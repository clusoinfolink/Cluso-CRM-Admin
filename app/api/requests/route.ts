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
});

const shareReportPatchSchema = z.object({
  action: z.literal("share-report-to-customer"),
  requestId: z.string().min(1),
});

const patchSchema = z.discriminatedUnion("action", [
  verifyServicePatchSchema,
  shareReportPatchSchema,
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
    attemptedAt: Date;
    verifierId: string | null;
    verifierName: string;
    managerId: string | null;
    managerName: string;
  }>;
};

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
      invoiceSnapshot: item.invoiceSnapshot ?? null,
      candidateFormResponses: (item.candidateFormResponses ?? []).map((serviceResponse) => ({
        serviceId: String(serviceResponse.serviceId),
        serviceName: serviceResponse.serviceName,
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
          "Invalid input. Expected verify-service or share-report-to-customer action payload.",
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

  if (parsed.data.action === "share-report-to-customer") {
    if (auth.role === "verifier") {
      return NextResponse.json(
        { error: "Only admin or manager roles can share reports with customers." },
        { status: 403 },
      );
    }

    const shareTarget = await VerificationRequest.findById(parsed.data.requestId)
      .select("status reportData candidateName customer")
      .lean();

    if (!shareTarget) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (shareTarget.status !== "verified") {
      return NextResponse.json(
        { error: "Only verified requests can be shared with customers." },
        { status: 400 },
      );
    }

    if (!shareTarget.reportData) {
      return NextResponse.json(
        { error: "Generate the report before sharing it with customer." },
        { status: 400 },
      );
    }

    await VerificationRequest.findByIdAndUpdate(
      parsed.data.requestId,
      {
        "reportMetadata.customerSharedAt": new Date(),
      },
      {
        new: true,
        runValidators: true,
      },
    );

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

    const emailResult = await sendCustomerReportSharedEmail({
      customerName: customer?.name?.trim() || "Customer",
      customerEmail,
      candidateName: shareTarget.candidateName || "Candidate",
      requestId: parsed.data.requestId,
      reportPdf: {
        filename: reportPdfFilename,
        content: reportPdfBuffer,
      },
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

  const requestDoc = await VerificationRequest.findById(verifyPayload.requestId)
    .select("candidateFormStatus status selectedServices serviceVerifications")
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

  const updated = await VerificationRequest.findByIdAndUpdate(
    verifyPayload.requestId,
    {
      status: nextStatus,
      rejectionNote: "",
      candidateFormStatus: "submitted",
      serviceVerifications: normalizedServiceVerifications,
    },
    {
      new: true,
      runValidators: true,
    },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: `Service verification attempt logged (${verifyPayload.serviceStatus}).`,
    requestStatus: nextStatus,
  });
}
