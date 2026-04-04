import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import Service from "@/lib/models/Service";
import User from "@/lib/models/User";
import type { CompanyPartnerProfile } from "@/lib/types";

import VerificationRequest from "@/lib/models/VerificationRequest";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  selectedServices: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        price: z.coerce.number().min(0),
        currency: z.enum(SUPPORTED_CURRENCIES),
      }),
    )
    .optional()
    .default([]),
});

const updateSchema = z.object({
  customerId: z.string().min(1),
  selectedServices: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        price: z.coerce.number().min(0),
        currency: z.enum(SUPPORTED_CURRENCIES),
      }),
    )
    .optional()
    .default([]),
});

function asString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value;
}

function normalizeAddress(value: unknown): CompanyPartnerProfile["companyInformation"]["address"] {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    line1: asString(raw.line1),
    line2: asString(raw.line2),
    city: asString(raw.city),
    state: asString(raw.state),
    postalCode: asString(raw.postalCode),
    country: asString(raw.country),
  };
}

function normalizePhone(value: unknown): CompanyPartnerProfile["primaryContactInformation"]["mobilePhone"] {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    countryCode: asString(raw.countryCode, "India (+91)"),
    number: asString(raw.number),
  };
}

function normalizeDocuments(value: unknown): CompanyPartnerProfile["companyInformation"]["documents"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const raw = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
      if (!raw) {
        return null;
      }

      const fileName = asString(raw.fileName).trim();
      const fileType = asString(raw.fileType).trim();
      const fileSize =
        typeof raw.fileSize === "number" && Number.isFinite(raw.fileSize)
          ? Math.max(0, Math.trunc(raw.fileSize))
          : 0;

      if (!fileName || !fileType || fileSize <= 0) {
        return null;
      }

      return { fileName, fileType, fileSize };
    })
    .filter((entry): entry is CompanyPartnerProfile["companyInformation"]["documents"][number] =>
      Boolean(entry),
    );
}

function normalizePartnerProfile(value: unknown): CompanyPartnerProfile {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const companyInformation =
    raw.companyInformation && typeof raw.companyInformation === "object"
      ? (raw.companyInformation as Record<string, unknown>)
      : {};
  const invoicingInformation =
    raw.invoicingInformation && typeof raw.invoicingInformation === "object"
      ? (raw.invoicingInformation as Record<string, unknown>)
      : {};
  const primaryContactInformation =
    raw.primaryContactInformation && typeof raw.primaryContactInformation === "object"
      ? (raw.primaryContactInformation as Record<string, unknown>)
      : {};
  const additionalQuestions =
    raw.additionalQuestions && typeof raw.additionalQuestions === "object"
      ? (raw.additionalQuestions as Record<string, unknown>)
      : {};

  const updatedAtRaw = raw.updatedAt;
  const updatedAt =
    updatedAtRaw instanceof Date
      ? updatedAtRaw.toISOString()
      : typeof updatedAtRaw === "string" && updatedAtRaw
        ? updatedAtRaw
        : null;

  return {
    companyInformation: {
      companyName: asString(companyInformation.companyName),
      gstin: asString(companyInformation.gstin),
      cinRegistrationNumber: asString(companyInformation.cinRegistrationNumber),
      address: normalizeAddress(companyInformation.address),
      documents: normalizeDocuments(companyInformation.documents),
    },
    invoicingInformation: {
      billingSameAsCompany: Boolean(invoicingInformation.billingSameAsCompany),
      invoiceEmail: asString(invoicingInformation.invoiceEmail),
      address: normalizeAddress(invoicingInformation.address),
    },
    primaryContactInformation: {
      firstName: asString(primaryContactInformation.firstName),
      lastName: asString(primaryContactInformation.lastName),
      designation: asString(primaryContactInformation.designation),
      email: asString(primaryContactInformation.email),
      officePhone: normalizePhone(primaryContactInformation.officePhone),
      mobilePhone: normalizePhone(primaryContactInformation.mobilePhone),
      whatsappPhone: normalizePhone(primaryContactInformation.whatsappPhone),
    },
    additionalQuestions: {
      heardAboutUs: asString(additionalQuestions.heardAboutUs),
      referredBy: asString(additionalQuestions.referredBy),
      yearlyBackgroundsExpected: asString(additionalQuestions.yearlyBackgroundsExpected),
      promoCode: asString(additionalQuestions.promoCode),
      primaryIndustry: asString(additionalQuestions.primaryIndustry),
    },
    updatedAt,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const items = await User.find({ role: "customer" }).sort({ createdAt: -1 }).lean();

  const customerIds = items.map((i) => i._id);

  const [verifiers, requests] = await Promise.all([
    User.find({ role: "verifier", assignedCompanies: { $in: customerIds } }, { name: 1, assignedCompanies: 1 }).lean(),
    VerificationRequest.aggregate([
      { $match: { customer: { $in: customerIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$customer",
          totalRequests: { $sum: 1 },
          lastRequestDate: { $first: "$createdAt" },
          lastRequestStatus: { $first: "$status" },
        },
      },
    ]),
  ]);

  const requestStatsMap = Object.fromEntries(
    requests.map((r) => [
      String(r._id),
      {
        totalRequests: r.totalRequests,
        lastRequestDate: r.lastRequestDate,
        lastRequestStatus: r.lastRequestStatus,
      },
    ])
  );

  const verifiersMap = new Map<string, string[]>();
  for (const v of verifiers) {
    if (Array.isArray(v.assignedCompanies)) {
      for (const cid of v.assignedCompanies) {
        const idStr = String(cid);
        if (!verifiersMap.has(idStr)) {
          verifiersMap.set(idStr, []);
        }
        verifiersMap.get(idStr)!.push(v.name);
      }
    }
  }

  return NextResponse.json({
    items: items.map((item) => {
      const idStr = String(item._id);
      return {
        id: idStr,
        name: item.name,
        email: item.email,
        selectedServices: (item.selectedServices ?? []).map((service) => ({
          serviceId: String(service.serviceId),
          serviceName: service.serviceName,
          price: service.price,
          currency: service.currency,
        })),
        partnerProfile: normalizePartnerProfile(item.partnerProfile),
        stats: {
          totalRequests: requestStatsMap[idStr]?.totalRequests || 0,
          assignedVerifiers: verifiersMap.get(idStr) || [],
          lastRequestDate: requestStatsMap[idStr]?.lastRequestDate || null,
          lastRequestStatus: requestStatsMap[idStr]?.lastRequestStatus || null,
        },
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    return NextResponse.json({ error: "Email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const selectedServiceIds = parsed.data.selectedServices.map((item) => item.serviceId);
  const serviceDocs =
    selectedServiceIds.length > 0
      ? await Service.find({ _id: { $in: selectedServiceIds } }).lean()
      : [];

  if (serviceDocs.length !== selectedServiceIds.length) {
    return NextResponse.json(
      { error: "One or more selected services are invalid." },
      { status: 400 },
    );
  }

  const serviceMap = new Map(serviceDocs.map((item) => [String(item._id), item]));
  const selectedServices = parsed.data.selectedServices.map((item) => {
    const service = serviceMap.get(item.serviceId);
    return {
      serviceId: item.serviceId,
      serviceName: service?.name ?? "",
      price: item.price,
      currency: item.currency,
    };
  });

  await User.create({
    name: parsed.data.name,
    email,
    passwordHash,
    role: "customer",
    parentCustomer: null,
    selectedServices,
  });

  return NextResponse.json({ message: "Enterprise login issued successfully." }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const customer = await User.findOne({ _id: parsed.data.customerId, role: "customer" }).lean();
  if (!customer) {
    return NextResponse.json({ error: "Enterprise company not found." }, { status: 404 });
  }

  const selectedServiceIds = parsed.data.selectedServices.map((item) => item.serviceId);
  const serviceDocs =
    selectedServiceIds.length > 0
      ? await Service.find({ _id: { $in: selectedServiceIds } }).lean()
      : [];

  if (serviceDocs.length !== selectedServiceIds.length) {
    return NextResponse.json(
      { error: "One or more selected services are invalid." },
      { status: 400 },
    );
  }

  const serviceMap = new Map(serviceDocs.map((item) => [String(item._id), item]));
  const selectedServices = parsed.data.selectedServices.map((item) => {
    const service = serviceMap.get(item.serviceId);
    return {
      serviceId: item.serviceId,
      serviceName: service?.name ?? "",
      price: item.price,
      currency: item.currency,
    };
  });

  await User.findByIdAndUpdate(parsed.data.customerId, { selectedServices });

  return NextResponse.json({ message: "Company services updated." });
}
