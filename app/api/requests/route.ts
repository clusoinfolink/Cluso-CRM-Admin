import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import VerificationRequest from "@/lib/models/VerificationRequest";
import User from "@/lib/models/User";

const patchSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["approved", "rejected", "verified"]),
  rejectionNote: z.string().trim().max(500).optional(),
});

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
      selectedServices: (item.selectedServices ?? []).map((service) => ({
        serviceId: String(service.serviceId),
        serviceName: service.serviceName,
        price: service.price,
        currency: service.currency,
      })),
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
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  if (parsed.data.status === "rejected" && !parsed.data.rejectionNote) {
    return NextResponse.json(
      { error: "Rejection note is required when rejecting a request." },
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
    .select("candidateFormStatus status")
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

  if (parsed.data.status === "verified" && requestDoc.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved requests can be marked as verified." },
      { status: 400 },
    );
  }

  let updateData: { status: "approved" | "rejected" | "verified"; rejectionNote: string };

  if (parsed.data.status === "rejected") {
    updateData = {
      status: "rejected",
      rejectionNote: parsed.data.rejectionNote ?? "",
    };
  } else if (parsed.data.status === "verified") {
    updateData = {
      status: "verified",
      rejectionNote: "",
    };
  } else {
    updateData = {
      status: "approved",
      rejectionNote: "",
    };
  }

  const updated = await VerificationRequest.findByIdAndUpdate(
    parsed.data.requestId,
    {
      ...updateData,
      candidateFormStatus: "submitted",
    },
    {
      new: true,
      runValidators: true,
    },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  return NextResponse.json({ message: `Request ${parsed.data.status}.` });
}
