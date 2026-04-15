import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { sendCustomerReportSharedEmail } from "@/lib/customerReportMail";
import { connectMongo } from "@/lib/mongodb";
import VerificationRequest from "@/lib/models/VerificationRequest";
import User from "@/lib/models/User";

const verifyServicePatchSchema = z.object({
  action: z.literal("verify-service"),
  requestId: z.string().min(1),
  serviceId: z.string().min(1),
  serviceStatus: z.enum(["verified", "unverified"]),
  verificationMode: z.string().trim().max(120).optional().default("manual"),
  comment: z.string().trim().max(500).optional().default(""),
  verifierNote: z.string().trim().max(1200).optional().default(""),
  extraPaymentDone: z.boolean().optional().default(false),
  extraPaymentAmount: z.number().nonnegative().optional().nullable().default(null),
  screenshotFileName: z.string().trim().max(180).optional().default(""),
  screenshotMimeType: z.string().trim().max(100).optional().default(""),
  screenshotFileSize: z.number().int().nonnegative().optional().nullable().default(null),
  screenshotData: z.string().trim().max(3_000_000).optional().default(""),
});

const shareReportPatchSchema = z.object({
  action: z.literal("share-report-to-customer"),
  requestId: z.string().min(1),
  reportData: z.unknown().optional(),
});

const saveReportDraftPatchSchema = z.object({
  action: z.literal("save-report-draft"),
  requestId: z.string().min(1),
  reportData: z.unknown().optional(),
});

const deleteServiceAttemptLogPatchSchema = z.object({
  action: z.literal("delete-service-attempt-log"),
  requestId: z.string().min(1),
  serviceId: z.string().min(1),
  attemptIndex: z.number().int().nonnegative(),
});

const patchSchema = z.discriminatedUnion("action", [
  verifyServicePatchSchema,
  saveReportDraftPatchSchema,
  shareReportPatchSchema,
  deleteServiceAttemptLogPatchSchema,
]);

type SelectedServiceLike = {
  serviceId: unknown;
  serviceName: string;
  price?: number;
  currency?: string;
};

type ServiceVerificationLike = {
  serviceId: unknown;
  serviceName: string;
  status?: "pending" | "verified" | "unverified";
  verificationMode?: string;
  comment?: string;
  attempts?: Array<{
    status?: "verified" | "unverified";
    verificationMode?: string;
    comment?: string;
    verifierNote?: string;
    extraPaymentDone?: boolean;
    extraPaymentAmount?: number | null;
    screenshotFileName?: string;
    screenshotMimeType?: string;
    screenshotFileSize?: number | null;
    screenshotData?: string;
    attemptedAt?: Date;
    verifierId?: unknown;
    verifierName?: string;
    managerId?: unknown;
    managerName?: string;
  }>;
};

type NormalizedServiceVerification = {
  serviceId: string;
  serviceName: string;
  status: "pending" | "verified" | "unverified";
  verificationMode: string;
  comment: string;
  attempts: Array<{
    status: "verified" | "unverified";
    verificationMode: string;
    comment: string;
    verifierNote: string;
    extraPaymentDone: boolean;
    extraPaymentAmount: number | null;
    screenshotFileName: string;
    screenshotMimeType: string;
    screenshotFileSize: number | null;
    screenshotData: string;
    attemptedAt: Date;
    verifierId: string | null;
    verifierName: string;
    managerId: string | null;
    managerName: string;
  }>;
};

type ReportPayloadForShare = {
  reportNumber: string;
  generatedAt: string;
  generatedByName: string;
  candidate: {
    name: string;
    email: string;
    phone: string;
  };
  company: {
    name: string;
    email: string;
  };
  status: string;
  createdAt: string;
  services: Array<{
    serviceName: string;
    status: string;
    verificationMode: string;
    comment: string;
    attempts: Array<{
      attemptedAt: string;
      status: string;
      verificationMode: string;
      comment: string;
      verifierName: string;
      managerName: string;
    }>;
  }>;
};

const MAX_ATTEMPT_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const ATTEMPT_SCREENSHOT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function normalizeAttemptScreenshotMimeType(rawMimeType: string) {
  const normalizedMimeType = rawMimeType.trim().toLowerCase();
  if (!normalizedMimeType) {
    return "";
  }

  if (normalizedMimeType === "image/x-png") {
    return "image/png";
  }

  if (normalizedMimeType === "image/jpg" || normalizedMimeType === "image/pjpeg") {
    return "image/jpeg";
  }

  return normalizedMimeType;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function extractFilenameFromContentDisposition(contentDisposition: string | null) {
  if (!contentDisposition) {
    return "";
  }

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].trim().replace(/^['"]|['"]$/g, ""));
    } catch {
      return encodedMatch[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  return "";
}

function normalizeAttachmentFileName(input: string, fallback: string) {
  const trimmed = input.trim();
  const candidate = trimmed || fallback;
  return candidate
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 180) || fallback;
}

function getImageExtensionFromMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function parseImageDataUrl(dataUrl: string, fallbackMimeType = "") {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([^;,]*);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    return null;
  }

  const mimeType = normalizeAttemptScreenshotMimeType(match[1] || fallbackMimeType);
  if (!ATTEMPT_SCREENSHOT_MIME_TYPES.has(mimeType)) {
    return null;
  }

  const base64Payload = match[2].replace(/\s+/g, "");
  if (!base64Payload) {
    return null;
  }

  try {
    const content = Buffer.from(base64Payload, "base64");
    if (content.byteLength === 0) {
      return null;
    }

    return {
      mimeType,
      content,
      normalizedDataUrl: `data:${mimeType};base64,${base64Payload}`,
    };
  } catch {
    return null;
  }
}

function parseReportPayload(value: unknown): ReportPayloadForShare | null {
  const root = asRecord(value);
  if (!root) {
    return null;
  }

  const candidate = asRecord(root.candidate);
  const company = asRecord(root.company);

  const servicesRaw = Array.isArray(root.services) ? root.services : [];
  const services = servicesRaw
    .map((serviceValue) => {
      const service = asRecord(serviceValue);
      if (!service) {
        return null;
      }

      const attemptsRaw = Array.isArray(service.attempts) ? service.attempts : [];
      const attempts = attemptsRaw
        .map((attemptValue) => {
          const attempt = asRecord(attemptValue);
          if (!attempt) {
            return null;
          }

          return {
            attemptedAt: asString(attempt.attemptedAt),
            status: asString(attempt.status),
            verificationMode: asString(attempt.verificationMode),
            comment: asString(attempt.comment),
            verifierName: asString(attempt.verifierName),
            managerName: asString(attempt.managerName),
          };
        })
        .filter(
          (
            attempt,
          ): attempt is {
            attemptedAt: string;
            status: string;
            verificationMode: string;
            comment: string;
            verifierName: string;
            managerName: string;
          } => Boolean(attempt),
        );

      return {
        serviceName: asString(service.serviceName),
        status: asString(service.status),
        verificationMode: asString(service.verificationMode),
        comment: asString(service.comment),
        attempts,
      };
    })
    .filter(
      (
        service,
      ): service is {
        serviceName: string;
        status: string;
        verificationMode: string;
        comment: string;
        attempts: Array<{
          attemptedAt: string;
          status: string;
          verificationMode: string;
          comment: string;
          verifierName: string;
          managerName: string;
        }>;
      } => Boolean(service),
    );

  return {
    reportNumber: asString(root.reportNumber),
    generatedAt: asString(root.generatedAt),
    generatedByName: asString(root.generatedByName),
    candidate: {
      name: asString(candidate?.name),
      email: asString(candidate?.email),
      phone: asString(candidate?.phone),
    },
    company: {
      name: asString(company?.name),
      email: asString(company?.email),
    },
    status: asString(root.status),
    createdAt: asString(root.createdAt),
    services,
  };
}

function normalizeReportPayloadForShare(
  value: unknown,
  fallbackRaw: unknown,
): ReportPayloadForShare | null {
  const fallback = parseReportPayload(fallbackRaw);
  const parsed = parseReportPayload(value);

  if (!parsed) {
    return fallback;
  }

  const nowIso = new Date().toISOString();
  const fallbackServices = fallback?.services ?? [];
  const parsedServices = parsed.services.length > 0 ? parsed.services : fallbackServices;

  return {
    reportNumber:
      parsed.reportNumber.trim() ||
      fallback?.reportNumber.trim() ||
      `RPT-${Date.now()}`,
    generatedAt: parsed.generatedAt.trim() || fallback?.generatedAt || nowIso,
    generatedByName:
      parsed.generatedByName.trim() || fallback?.generatedByName || "Unknown",
    candidate: {
      name: parsed.candidate.name.trim() || fallback?.candidate.name || "",
      email: parsed.candidate.email.trim() || fallback?.candidate.email || "",
      phone: parsed.candidate.phone.trim() || fallback?.candidate.phone || "",
    },
    company: {
      name: parsed.company.name.trim() || fallback?.company.name || "",
      email: parsed.company.email.trim() || fallback?.company.email || "",
    },
    status: parsed.status.trim() || fallback?.status || "verified",
    createdAt: parsed.createdAt.trim() || fallback?.createdAt || nowIso,
    services: parsedServices,
  };
}

function normalizeAttemptScreenshot(payload: {
  screenshotData?: string;
  screenshotFileName?: string;
  screenshotMimeType?: string;
  screenshotFileSize?: number | null;
}) {
  const rawData = payload.screenshotData?.trim() ?? "";
  const hasMetadata =
    Boolean(payload.screenshotFileName?.trim()) ||
    Boolean(payload.screenshotMimeType?.trim()) ||
    Boolean(payload.screenshotFileSize);

  if (!rawData) {
    if (hasMetadata) {
      return {
        ok: false as const,
        error: "Screenshot metadata was provided without image data.",
      };
    }

    return {
      ok: true as const,
      value: {
        screenshotFileName: "",
        screenshotMimeType: "",
        screenshotFileSize: null,
        screenshotData: "",
      },
    };
  }

  const parsed = parseImageDataUrl(rawData, payload.screenshotMimeType ?? "");
  if (!parsed) {
    return {
      ok: false as const,
      error: "Screenshot must be a valid PNG, JPG, or WEBP image.",
    };
  }

  if (parsed.content.byteLength > MAX_ATTEMPT_SCREENSHOT_BYTES) {
    return {
      ok: false as const,
      error: "Screenshot must be 2MB or smaller.",
    };
  }

  if (
    typeof payload.screenshotFileSize === "number" &&
    payload.screenshotFileSize > MAX_ATTEMPT_SCREENSHOT_BYTES
  ) {
    return {
      ok: false as const,
      error: "Screenshot must be 2MB or smaller.",
    };
  }

  const extension = getImageExtensionFromMimeType(parsed.mimeType);
  const fallbackName = `attempt-screenshot.${extension}`;
  const normalizedFileName = normalizeAttachmentFileName(
    payload.screenshotFileName ?? "",
    fallbackName,
  );

  return {
    ok: true as const,
    value: {
      screenshotFileName: normalizedFileName,
      screenshotMimeType: parsed.mimeType,
      screenshotFileSize: parsed.content.byteLength,
      screenshotData: parsed.normalizedDataUrl,
    },
  };
}

function buildAttemptScreenshotAttachments(
  requestId: string,
  verifications: ServiceVerificationLike[] = [],
) {
  const usedFilenames = new Set<string>();
  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }> = [];

  for (const verification of verifications) {
    const safeServiceName = normalizeAttachmentFileName(
      verification.serviceName ?? "service",
      "service",
    );

    for (const [attemptIndex, attempt] of (verification.attempts ?? []).entries()) {
      const parsed = parseImageDataUrl(
        attempt.screenshotData ?? "",
        attempt.screenshotMimeType ?? "",
      );
      if (!parsed) {
        continue;
      }

      if (parsed.content.byteLength > MAX_ATTEMPT_SCREENSHOT_BYTES) {
        continue;
      }

      const fallbackBase = `${requestId}-${safeServiceName}-attempt-${attemptIndex + 1}`;
      const fallbackName = `${fallbackBase}.${getImageExtensionFromMimeType(parsed.mimeType)}`;
      const normalizedBaseName = normalizeAttachmentFileName(
        attempt.screenshotFileName ?? "",
        fallbackName,
      );

      let attachmentName = normalizedBaseName;
      let serial = 2;
      while (usedFilenames.has(attachmentName.toLowerCase())) {
        const dotIndex = normalizedBaseName.lastIndexOf(".");
        if (dotIndex === -1) {
          attachmentName = `${normalizedBaseName}-${serial}`;
        } else {
          const base = normalizedBaseName.slice(0, dotIndex);
          const ext = normalizedBaseName.slice(dotIndex);
          attachmentName = `${base}-${serial}${ext}`;
        }
        serial += 1;
      }

      usedFilenames.add(attachmentName.toLowerCase());
      attachments.push({
        filename: attachmentName,
        content: parsed.content,
        contentType: parsed.mimeType,
      });
    }
  }

  return attachments;
}

function buildDefaultServiceVerifications(
  selectedServices: SelectedServiceLike[] = [],
): NormalizedServiceVerification[] {
  return selectedServices.map((service) => ({
    serviceId: String(service.serviceId),
    serviceName: service.serviceName,
    status: "pending" as const,
    verificationMode: "",
    comment: "",
    attempts: [] as Array<{
      status: "verified" | "unverified";
      verificationMode: string;
      comment: string;
      verifierNote: string;
      extraPaymentDone: boolean;
      extraPaymentAmount: number | null;
      screenshotFileName: string;
      screenshotMimeType: string;
      screenshotFileSize: number | null;
      screenshotData: string;
      attemptedAt: Date;
      verifierId: string | null;
      verifierName: string;
      managerId: string | null;
      managerName: string;
    }>,
  }));
}

function normalizeServiceVerifications(
  selectedServices: SelectedServiceLike[] = [],
  existingVerifications: ServiceVerificationLike[] = [],
) {
  const defaults = buildDefaultServiceVerifications(selectedServices);
  const serviceMap = new Map<string, NormalizedServiceVerification>(
    defaults.map((entry) => [entry.serviceId, entry]),
  );

  for (const verification of existingVerifications) {
    const serviceId = String(verification.serviceId);
    const normalized: NormalizedServiceVerification = {
      serviceId,
      serviceName: verification.serviceName,
      status: verification.status ?? "pending",
      verificationMode: verification.verificationMode ?? "",
      comment: verification.comment ?? "",
      attempts: (verification.attempts ?? []).map((attempt) => ({
        status: attempt.status ?? "verified",
        verificationMode: attempt.verificationMode ?? "",
        comment: attempt.comment ?? "",
        verifierNote: attempt.verifierNote ?? "",
        extraPaymentDone: Boolean(attempt.extraPaymentDone),
        extraPaymentAmount:
          typeof attempt.extraPaymentAmount === "number" &&
          Number.isFinite(attempt.extraPaymentAmount) &&
          attempt.extraPaymentAmount > 0
            ? Math.round(attempt.extraPaymentAmount * 100) / 100
            : null,
        screenshotFileName: attempt.screenshotFileName ?? "",
        screenshotMimeType: attempt.screenshotMimeType ?? "",
        screenshotFileSize: attempt.screenshotFileSize ?? null,
        screenshotData: attempt.screenshotData ?? "",
        attemptedAt: attempt.attemptedAt ? new Date(attempt.attemptedAt) : new Date(),
        verifierId: attempt.verifierId ? String(attempt.verifierId) : null,
        verifierName: attempt.verifierName ?? "",
        managerId: attempt.managerId ? String(attempt.managerId) : null,
        managerName: attempt.managerName ?? "",
      })),
    };

    serviceMap.set(serviceId, normalized);
  }

  return [...serviceMap.values()];
}

export async function GET(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (
    !auth ||
    (auth.role !== "admin" &&
      auth.role !== "superadmin" &&
      auth.role !== "manager" &&
      auth.role !== "verifier")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();

  let requestFilter: Record<string, unknown> = {};
  let scopedVerifiers: Array<{ name: string; assignedCompanies?: unknown[] }> = [];

  if (auth.role === "verifier") {
    const verifier = await User.findOne({ _id: auth.userId, role: "verifier" }).lean();
    if (!verifier) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const assignedCompanies = (verifier.assignedCompanies ?? []).map((item) => String(item));
    if (assignedCompanies.length === 0) {
      return NextResponse.json({ items: [] });
    }

    requestFilter = { customer: { $in: assignedCompanies } };
    scopedVerifiers = [
      {
        name: verifier.name,
        assignedCompanies: verifier.assignedCompanies,
      },
    ];
  }

  if (auth.role === "manager") {
    const manager = await User.findOne({ _id: auth.userId, role: "manager" }).lean();
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const managedVerifiers = await User.find({
      role: "verifier",
      manager: manager._id,
    }).lean();

    const scopedCompanySet = new Set<string>(
      (manager.assignedCompanies ?? []).map((item) => String(item)),
    );
    for (const verifier of managedVerifiers) {
      for (const companyId of verifier.assignedCompanies ?? []) {
        scopedCompanySet.add(String(companyId));
      }
    }

    if (scopedCompanySet.size === 0) {
      return NextResponse.json({ items: [] });
    }

    requestFilter = { customer: { $in: [...scopedCompanySet] } };
    scopedVerifiers = managedVerifiers.map((verifier) => ({
      name: verifier.name,
      assignedCompanies: verifier.assignedCompanies,
    }));
    scopedVerifiers.push({
      name: manager.name,
      assignedCompanies: manager.assignedCompanies,
    });
  }

  const items = await VerificationRequest.find(requestFilter)
    .sort({ createdAt: -1 })
    .lean();

  const customerIds = [...new Set(items.map((item) => String(item.customer)))];
  const creatorIds = [...new Set(items.map((item) => String(item.createdBy)))];
  const customers = await User.find({ _id: { $in: customerIds } }).lean();
  const creators = await User.find({ _id: { $in: creatorIds } }).lean();
  const customerIdSet = new Set(customerIds);

  if (auth.role === "admin" || auth.role === "superadmin") {
    const verifiers = await User.find({
      role: "verifier",
      assignedCompanies: { $in: customerIds },
    }).lean();

    scopedVerifiers = verifiers.map((verifier) => ({
      name: verifier.name,
      assignedCompanies: verifier.assignedCompanies,
    }));
  }

  const verifierNamesByCompany = new Map<string, string[]>();
  for (const verifier of scopedVerifiers) {
    const trimmedName = verifier.name?.trim() ?? "";
    if (!trimmedName) {
      continue;
    }

    for (const companyIdRaw of verifier.assignedCompanies ?? []) {
      const companyId = String(companyIdRaw);
      if (!customerIdSet.has(companyId)) {
        continue;
      }

      const existing = verifierNamesByCompany.get(companyId);
      if (!existing) {
        verifierNamesByCompany.set(companyId, [trimmedName]);
        continue;
      }

      if (!existing.includes(trimmedName)) {
        existing.push(trimmedName);
      }
    }
  }

  const customerMap = new Map(customers.map((c) => [String(c._id), c]));
  const creatorMap = new Map(creators.map((c) => [String(c._id), c]));

  const enriched = items.map((item) => {
    const customer = customerMap.get(String(item.customer));
    const creator = creatorMap.get(String(item.createdBy));
    const selectedServices = (item.selectedServices ?? []).map((service) => ({
      serviceId: String(service.serviceId),
      serviceName: service.serviceName,
      price: service.price,
      currency: service.currency,
    }));
    const serviceVerifications = normalizeServiceVerifications(
      selectedServices,
      (item.serviceVerifications ?? []) as ServiceVerificationLike[],
    );

    return {
      _id: String(item._id),
      candidateName: item.candidateName,
      candidateEmail: item.candidateEmail,
      candidatePhone: item.candidatePhone,
      verifierNames: verifierNamesByCompany.get(String(item.customer)) ?? [],
      status: item.status,
      rejectionNote: item.rejectionNote ?? "",
      candidateFormStatus: item.candidateFormStatus ?? "pending",
      candidateSubmittedAt: item.candidateSubmittedAt ?? null,
      enterpriseApprovedAt: item.enterpriseApprovedAt ?? null,
      enterpriseDecisionLockedAt: item.enterpriseDecisionLockedAt ?? null,
      selectedServices,
      serviceVerifications,
      reportMetadata: item.reportMetadata ?? null,
      reportData: item.reportData ?? null,
      reverificationAppeal: item.reverificationAppeal ?? null,
      invoiceSnapshot: item.invoiceSnapshot ?? null,
      candidateFormResponses: (item.candidateFormResponses ?? []).map((serviceResponse) => ({
        serviceId: String(serviceResponse.serviceId),
        serviceName: serviceResponse.serviceName,
        serviceEntryCount:
          typeof serviceResponse.serviceEntryCount === "number" &&
          Number.isFinite(serviceResponse.serviceEntryCount) &&
          serviceResponse.serviceEntryCount > 0
            ? Math.floor(serviceResponse.serviceEntryCount)
            : 1,
        answers: (serviceResponse.answers ?? []).map((answer) => ({
          question: answer.question,
          fieldType: answer.fieldType,
          required: Boolean(answer.required),
          repeatable: Boolean(answer.repeatable),
          value: answer.value,
          fileName: answer.fileName ?? "",
          fileMimeType: answer.fileMimeType ?? "",
          fileSize: answer.fileSize ?? null,
          fileData: answer.fileData ?? "",
        })),
      })),
      createdAt: item.createdAt,
      createdByName: creator?.name ?? "Unknown",
      customerName: customer?.name ?? "Unknown",
      customerEmail: customer?.email ?? "Unknown",
    };
  });

  return NextResponse.json({ items: enriched });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (
    !auth ||
    (auth.role !== "admin" &&
      auth.role !== "superadmin" &&
      auth.role !== "manager" &&
      auth.role !== "verifier")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid input. Expected verify-service, delete-service-attempt-log, save-report-draft, or share-report-to-customer action payload.",
      },
      { status: 400 },
    );
  }

  await connectMongo();

  if (auth.role === "verifier" || auth.role === "manager") {
    const assignedCompanies = new Set<string>();

    if (auth.role === "verifier") {
      const verifier = await User.findOne({ _id: auth.userId, role: "verifier" }).lean();
      if (!verifier) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      for (const companyId of verifier.assignedCompanies ?? []) {
        assignedCompanies.add(String(companyId));
      }
    }

    if (auth.role === "manager") {
      const manager = await User.findOne({ _id: auth.userId, role: "manager" }).lean();
      if (!manager) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      for (const companyId of manager.assignedCompanies ?? []) {
        assignedCompanies.add(String(companyId));
      }

      const managedVerifiers = await User.find({
        role: "verifier",
        manager: manager._id,
      })
        .select("assignedCompanies")
        .lean();

      for (const verifier of managedVerifiers) {
        for (const companyId of verifier.assignedCompanies ?? []) {
          assignedCompanies.add(String(companyId));
        }
      }
    }

    if (assignedCompanies.size === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scopedRequest = await VerificationRequest.findById(parsed.data.requestId)
      .select("customer")
      .lean();
    if (!scopedRequest) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (!assignedCompanies.has(String(scopedRequest.customer))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (
    parsed.data.action === "delete-service-attempt-log"
  ) {
    if (auth.role === "verifier") {
      return NextResponse.json(
        {
          error: "Only admin or manager roles can delete verification logs.",
        },
        { status: 403 },
      );
    }

    const deletePayload = parsed.data;
    const requestDoc = await VerificationRequest.findById(deletePayload.requestId)
      .select(
        "candidateFormStatus status selectedServices serviceVerifications reportData reportMetadata invoiceSnapshot",
      )
      .lean();

    if (!requestDoc) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (requestDoc.candidateFormStatus !== "submitted") {
      return NextResponse.json(
        { error: "Candidate form is not submitted yet." },
        { status: 400 },
      );
    }

    if (requestDoc.status !== "approved" && requestDoc.status !== "verified") {
      return NextResponse.json(
        {
          error:
            "Request must be approved by enterprise before verification logs can be modified.",
        },
        { status: 400 },
      );
    }

    const normalizedServiceVerifications = normalizeServiceVerifications(
      (requestDoc.selectedServices ?? []) as SelectedServiceLike[],
      (requestDoc.serviceVerifications ?? []) as ServiceVerificationLike[],
    );

    const targetIndex = normalizedServiceVerifications.findIndex(
      (service) => service.serviceId === deletePayload.serviceId,
    );
    if (targetIndex === -1) {
      return NextResponse.json(
        { error: "Selected service does not belong to this request." },
        { status: 400 },
      );
    }

    const target = normalizedServiceVerifications[targetIndex];
    if (deletePayload.attemptIndex >= target.attempts.length) {
      return NextResponse.json(
        { error: "Verification log was not found." },
        { status: 404 },
      );
    }

    target.attempts.splice(deletePayload.attemptIndex, 1);

    if (target.attempts.length > 0) {
      const latestAttempt = target.attempts[target.attempts.length - 1];
      target.status = latestAttempt.status;
      target.verificationMode = latestAttempt.verificationMode;
      target.comment = latestAttempt.comment;
    } else {
      target.status = "pending";
      target.verificationMode = "";
      target.comment = "";
    }

    const isVerificationComplete = normalizedServiceVerifications.every(
      (service) => service.status === "verified" || service.status === "unverified",
    );
    const nextStatus = isVerificationComplete ? "verified" : "approved";

    const reportMetadata = asRecord(requestDoc.reportMetadata);
    const hadGeneratedReport =
      Boolean(requestDoc.reportData) || Boolean(reportMetadata?.generatedAt);
    const hadSharedWithCustomer = Boolean(reportMetadata?.customerSharedAt);
    const shouldResetReportArtifacts = hadGeneratedReport || hadSharedWithCustomer;

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      rejectionNote: "",
      candidateFormStatus: "submitted",
      serviceVerifications: normalizedServiceVerifications,
    };

    if (shouldResetReportArtifacts) {
      updatePayload.reportData = null;
      updatePayload.invoiceSnapshot = null;
      updatePayload["reportMetadata.generatedAt"] = null;
      updatePayload["reportMetadata.generatedBy"] = null;
      updatePayload["reportMetadata.generatedByName"] = "";
      updatePayload["reportMetadata.reportNumber"] = "";
      updatePayload["reportMetadata.customerSharedAt"] = null;
    }

    const updated = await VerificationRequest.findByIdAndUpdate(
      deletePayload.requestId,
      updatePayload,
      {
        new: true,
        runValidators: true,
      },
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    return NextResponse.json({
      message: shouldResetReportArtifacts
        ? "Verification attempt log deleted. Existing report was cleared. Generate and share an updated report with customer."
        : "Verification attempt log deleted.",
      requestStatus: nextStatus,
    });
  }

  if (
    parsed.data.action === "share-report-to-customer" ||
    parsed.data.action === "save-report-draft"
  ) {
    const isShareAction = parsed.data.action === "share-report-to-customer";

    if (auth.role === "verifier") {
      return NextResponse.json(
        {
          error: isShareAction
            ? "Only admin or manager roles can share reports with customers."
            : "Only admin or manager roles can save edited report previews.",
        },
        { status: 403 },
      );
    }

    const shareTarget = await VerificationRequest.findById(parsed.data.requestId)
      .select("status reportData candidateName customer serviceVerifications reverificationAppeal")
      .lean();

    if (!shareTarget) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (shareTarget.status !== "verified") {
      return NextResponse.json(
        {
          error: isShareAction
            ? "Only verified requests can be shared with customers."
            : "Only verified requests can save edited report previews.",
        },
        { status: 400 },
      );
    }

    const normalizedReportData = normalizeReportPayloadForShare(
      parsed.data.reportData,
      shareTarget.reportData,
    );

    if (!shareTarget.reportData && !normalizedReportData) {
      return NextResponse.json(
        {
          error: isShareAction
            ? "Generate the report before sharing it with customer."
            : "Generate the report preview before saving edited changes.",
        },
        { status: 400 },
      );
    }

    const generatedAtDate = normalizedReportData
      ? new Date(normalizedReportData.generatedAt)
      : null;
    const resolvedGeneratedAt =
      generatedAtDate && !Number.isNaN(generatedAtDate.getTime())
        ? generatedAtDate
        : new Date();

    const metadataUpdates: Record<string, unknown> = {};

    if (normalizedReportData) {
      metadataUpdates.reportData = normalizedReportData;
      metadataUpdates["reportMetadata.generatedAt"] = resolvedGeneratedAt;
      metadataUpdates["reportMetadata.generatedByName"] =
        normalizedReportData.generatedByName;
      metadataUpdates["reportMetadata.reportNumber"] =
        normalizedReportData.reportNumber;
    }

    if (isShareAction) {
      metadataUpdates["reportMetadata.customerSharedAt"] = new Date();

      const appealStatus =
        (shareTarget.reverificationAppeal as { status?: string } | null)?.status ?? "";
      if (appealStatus === "open") {
        const actor = await User.findById(auth.userId).select("name").lean();
        metadataUpdates["reverificationAppeal.status"] = "resolved";
        metadataUpdates["reverificationAppeal.resolvedAt"] = new Date();
        metadataUpdates["reverificationAppeal.resolvedBy"] = auth.userId;
        metadataUpdates["reverificationAppeal.resolvedByName"] = actor?.name ?? "";
      }
    }

    await VerificationRequest.findByIdAndUpdate(
      parsed.data.requestId,
      metadataUpdates,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!isShareAction) {
      return NextResponse.json({
        message: "Edited report changes saved to database.",
      });
    }

    const customer = await User.findById(shareTarget.customer)
      .select("name email")
      .lean();

    const customerEmail = customer?.email?.trim() ?? "";

    if (!customerEmail) {
      return NextResponse.json({
        message: "Report shared with customer portal, but customer email is not configured.",
      });
    }

    const reportDownloadUrl = new URL(
      `/api/requests/${encodeURIComponent(parsed.data.requestId)}/report`,
      req.nextUrl.origin,
    );

    let reportPdfBuffer: Buffer | null = null;
    let reportPdfFilename = `verification-report-${parsed.data.requestId}.pdf`;

    try {
      const reportResponse = await fetch(reportDownloadUrl, {
        method: "GET",
        cache: "no-store",
        headers: {
          cookie: req.headers.get("cookie") ?? "",
        },
      });

      if (!reportResponse.ok) {
        const details = (await reportResponse.text()).trim();
        return NextResponse.json({
          message:
            "Report shared with customer portal, but report PDF could not be prepared for email attachment.",
          emailError: details || "Could not download generated report PDF.",
        });
      }

      const reportBytes = await reportResponse.arrayBuffer();
      if (reportBytes.byteLength === 0) {
        return NextResponse.json({
          message:
            "Report shared with customer portal, but report PDF could not be prepared for email attachment.",
          emailError: "Generated report PDF is empty.",
        });
      }

      const contentDisposition = reportResponse.headers.get("content-disposition");
      const extractedFilename = extractFilenameFromContentDisposition(contentDisposition);
      if (extractedFilename) {
        reportPdfFilename = extractedFilename;
      }

      reportPdfBuffer = Buffer.from(reportBytes);
    } catch (error) {
      return NextResponse.json({
        message:
          "Report shared with customer portal, but report PDF could not be prepared for email attachment.",
        emailError: error instanceof Error ? error.message : "Unknown PDF attachment error",
      });
    }

    if (!reportPdfBuffer) {
      return NextResponse.json({
        message:
          "Report shared with customer portal, but report PDF could not be prepared for email attachment.",
        emailError: "Failed to prepare report PDF attachment.",
      });
    }

    const screenshotAttachments = buildAttemptScreenshotAttachments(
      parsed.data.requestId,
      (shareTarget.serviceVerifications ?? []) as ServiceVerificationLike[],
    );

    const emailResult = await sendCustomerReportSharedEmail({
      customerName: customer?.name?.trim() || "Customer",
      customerEmail,
      candidateName: shareTarget.candidateName || "Candidate",
      requestId: parsed.data.requestId,
      reportPdf: {
        filename: reportPdfFilename,
        content: reportPdfBuffer,
      },
      supplementalAttachments: screenshotAttachments,
    });

    if (!emailResult.sent) {
      return NextResponse.json({
        message: "Report shared with customer portal, but customer email could not be sent.",
        emailError: emailResult.reason ?? "Unknown email error",
      });
    }

    return NextResponse.json({
      message: "Report shared with customer portal and emailed to customer with PDF attachment.",
    });
  }

  const verifyPayload = parsed.data;
  const normalizedScreenshot = normalizeAttemptScreenshot(verifyPayload);
  if (!normalizedScreenshot.ok) {
    return NextResponse.json({ error: normalizedScreenshot.error }, { status: 400 });
  }

  if (verifyPayload.extraPaymentDone && !normalizedScreenshot.value.screenshotData) {
    return NextResponse.json(
      { error: "Receipt screenshot is required when extra payment is marked as done." },
      { status: 400 },
    );
  }

  const normalizedExtraPaymentAmount =
    verifyPayload.extraPaymentDone &&
    typeof verifyPayload.extraPaymentAmount === "number" &&
    Number.isFinite(verifyPayload.extraPaymentAmount) &&
    verifyPayload.extraPaymentAmount > 0
      ? Math.round(verifyPayload.extraPaymentAmount * 100) / 100
      : null;

  if (verifyPayload.extraPaymentDone && !normalizedExtraPaymentAmount) {
    return NextResponse.json(
      { error: "Extra payment amount must be greater than zero when extra payment is marked as done." },
      { status: 400 },
    );
  }

  const requestDoc = await VerificationRequest.findById(verifyPayload.requestId)
    .select(
      "candidateFormStatus status selectedServices serviceVerifications reportData reportMetadata invoiceSnapshot",
    )
    .lean();

  if (!requestDoc) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (requestDoc.candidateFormStatus !== "submitted") {
    return NextResponse.json(
      { error: "Candidate form is not submitted yet." },
      { status: 400 },
    );
  }

  if (requestDoc.status !== "approved" && requestDoc.status !== "verified") {
    return NextResponse.json(
      {
        error:
          "Request must be approved by enterprise before verification attempts can be logged.",
      },
      { status: 400 },
    );
  }

  const normalizedServiceVerifications = normalizeServiceVerifications(
    (requestDoc.selectedServices ?? []) as SelectedServiceLike[],
    (requestDoc.serviceVerifications ?? []) as ServiceVerificationLike[],
  );

  const targetIndex = normalizedServiceVerifications.findIndex(
    (service) => service.serviceId === verifyPayload.serviceId,
  );
  if (targetIndex === -1) {
    return NextResponse.json(
      { error: "Selected service does not belong to this request." },
      { status: 400 },
    );
  }

  const actor = await User.findById(auth.userId)
    .select("name role manager")
    .lean();
  const verifierName = actor?.name ?? "Unknown";

  let managerId: string | null = null;
  let managerName = "";

  if (auth.role === "manager") {
    managerId = auth.userId;
    managerName = verifierName;
  } else if (auth.role === "admin" || auth.role === "superadmin") {
    managerId = auth.userId;
    managerName = verifierName;
  } else if (auth.role === "verifier" && actor?.manager) {
    managerId = String(actor.manager);
    const manager = await User.findById(actor.manager).select("name").lean();
    managerName = manager?.name ?? "";
  }

  const target = normalizedServiceVerifications[targetIndex];
  target.status = verifyPayload.serviceStatus;
  target.verificationMode = verifyPayload.verificationMode;
  target.comment = verifyPayload.comment;
  target.attempts.push({
    status: verifyPayload.serviceStatus,
    verificationMode: verifyPayload.verificationMode,
    comment: verifyPayload.comment,
    verifierNote: verifyPayload.verifierNote,
    extraPaymentDone: verifyPayload.extraPaymentDone,
    extraPaymentAmount: normalizedExtraPaymentAmount,
    screenshotFileName: normalizedScreenshot.value.screenshotFileName,
    screenshotMimeType: normalizedScreenshot.value.screenshotMimeType,
    screenshotFileSize: normalizedScreenshot.value.screenshotFileSize,
    screenshotData: normalizedScreenshot.value.screenshotData,
    attemptedAt: new Date(),
    verifierId: auth.userId,
    verifierName,
    managerId,
    managerName,
  });

  const isVerificationComplete = normalizedServiceVerifications.every(
    (service) => service.status === "verified" || service.status === "unverified",
  );
  const nextStatus = isVerificationComplete ? "verified" : "approved";

  const reportMetadata = asRecord(requestDoc.reportMetadata);
  const hadGeneratedReport =
    Boolean(requestDoc.reportData) || Boolean(reportMetadata?.generatedAt);
  const hadSharedWithCustomer = Boolean(reportMetadata?.customerSharedAt);
  const shouldResetReportArtifacts =
    requestDoc.status === "verified" && (hadGeneratedReport || hadSharedWithCustomer);

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    rejectionNote: "",
    candidateFormStatus: "submitted",
    serviceVerifications: normalizedServiceVerifications,
  };

  if (shouldResetReportArtifacts) {
    updatePayload.reportData = null;
    updatePayload.invoiceSnapshot = null;
    updatePayload["reportMetadata.generatedAt"] = null;
    updatePayload["reportMetadata.generatedBy"] = null;
    updatePayload["reportMetadata.generatedByName"] = "";
    updatePayload["reportMetadata.reportNumber"] = "";
    updatePayload["reportMetadata.customerSharedAt"] = null;
  }

  const updated = await VerificationRequest.findByIdAndUpdate(
    verifyPayload.requestId,
    updatePayload,
    {
      new: true,
      runValidators: true,
    },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: shouldResetReportArtifacts
      ? `Service verification attempt logged (${verifyPayload.serviceStatus}). Existing report was cleared. Generate and share an updated report with customer.`
      : `Service verification attempt logged (${verifyPayload.serviceStatus}).`,
    requestStatus: nextStatus,
  });
}
