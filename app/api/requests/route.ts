import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import VerificationRequest from "@/lib/models/VerificationRequest";
import User from "@/lib/models/User";

const patchSchema = z.object({
  action: z.literal("verify-service"),
  requestId: z.string().min(1),
  serviceId: z.string().min(1),
  serviceStatus: z.enum(["verified", "unverified"]),
  verificationMode: z.string().trim().max(120).optional().default("manual"),
  comment: z.string().trim().max(500).optional().default(""),
});

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

function buildDefaultServiceVerifications(selectedServices: SelectedServiceLike[] = []) {
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
  const serviceMap = new Map(defaults.map((entry) => [entry.serviceId, entry]));

  for (const verification of existingVerifications) {
    const serviceId = String(verification.serviceId);
    const normalized = {
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
      { error: "Invalid input. Expected verify-service action payload." },
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

  const requestDoc = await VerificationRequest.findById(parsed.data.requestId)
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
    (service) => service.serviceId === parsed.data.serviceId,
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
  target.status = parsed.data.serviceStatus;
  target.verificationMode = parsed.data.verificationMode;
  target.comment = parsed.data.comment;
  target.attempts.push({
    status: parsed.data.serviceStatus,
    verificationMode: parsed.data.verificationMode,
    comment: parsed.data.comment,
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
    parsed.data.requestId,
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
    message: `Service verification attempt logged (${parsed.data.serviceStatus}).`,
    requestStatus: nextStatus,
  });
}
