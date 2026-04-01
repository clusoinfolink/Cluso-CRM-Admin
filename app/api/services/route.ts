import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import Service from "@/lib/models/Service";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const formFieldSchema = z.object({
  question: z.string().trim().min(1).max(200),
  fieldType: z.enum(["text", "long_text", "number", "file"]),
  required: z.boolean().optional().default(false),
});

const createServiceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional().default(""),
  defaultPrice: z.coerce.number().min(0).optional(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES).optional().default("INR"),
  isPackage: z.boolean().optional().default(false),
  includedServiceIds: z.array(z.string().min(1)).optional().default([]),
  formFields: z.array(formFieldSchema).optional().default([]),
});

const updateServiceFormSchema = z.object({
  serviceId: z.string().min(1),
  formFields: z.array(formFieldSchema),
});

export async function GET(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (
    !auth ||
    (auth.role !== "admin" && auth.role !== "superadmin" && auth.role !== "verifier")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const items = await Service.find({}).sort({ name: 1 }).lean();

  return NextResponse.json({
    items: items.map((item) => ({
      id: String(item._id),
      name: item.name,
      description: item.description ?? "",
      defaultPrice: typeof item.defaultPrice === "number" ? item.defaultPrice : null,
      defaultCurrency: item.defaultCurrency ?? "INR",
      isPackage: Boolean(item.isPackage),
      includedServiceIds: (item.includedServiceIds ?? []).map((id) => String(id)),
      formFields: (item.formFields ?? []).map((field) => ({
        question: field.question,
        fieldType: field.fieldType,
        required: Boolean(field.required),
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const normalizedName = parsed.data.name.trim();
  if (!normalizedName) {
    return NextResponse.json({ error: "Service name is required." }, { status: 400 });
  }

  const isPackage = Boolean(parsed.data.isPackage);
  const includedServiceIds = [...new Set(parsed.data.includedServiceIds.map((id) => id.trim()).filter(Boolean))];

  if (isPackage && includedServiceIds.length < 2) {
    return NextResponse.json(
      { error: "Package deal must include at least two services." },
      { status: 400 },
    );
  }

  const existing = await Service.findOne({ name: normalizedName })
    .collation({ locale: "en", strength: 2 })
    .lean();
  if (existing) {
    return NextResponse.json({ error: "Service already exists." }, { status: 409 });
  }

  if (isPackage && includedServiceIds.length > 0) {
    const includedServices = await Service.find({ _id: { $in: includedServiceIds } })
      .select("_id isPackage")
      .lean();

    if (includedServices.length !== includedServiceIds.length) {
      return NextResponse.json(
        { error: "One or more package services are invalid." },
        { status: 400 },
      );
    }

    if (includedServices.some((service) => Boolean(service.isPackage))) {
      return NextResponse.json(
        { error: "Package deals can only include regular services." },
        { status: 400 },
      );
    }
  }

  const service = await Service.create({
    name: normalizedName,
    description: parsed.data.description?.trim() ?? "",
    defaultPrice: parsed.data.defaultPrice,
    defaultCurrency: parsed.data.defaultCurrency,
    isPackage,
    includedServiceIds: isPackage ? includedServiceIds : [],
    formFields: parsed.data.formFields,
  });

  return NextResponse.json(
    {
      message: "Service added.",
      item: {
        id: String(service._id),
        name: service.name,
        description: service.description ?? "",
        defaultPrice: typeof service.defaultPrice === "number" ? service.defaultPrice : null,
        defaultCurrency: service.defaultCurrency ?? "INR",
        isPackage: Boolean(service.isPackage),
        includedServiceIds: (service.includedServiceIds ?? []).map((id) => String(id)),
        formFields: (service.formFields ?? []).map((field) => ({
          question: field.question,
          fieldType: field.fieldType,
          required: Boolean(field.required),
        })),
      },
    },
    { status: 201 },
  );
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (
    !auth ||
    (auth.role !== "admin" && auth.role !== "superadmin" && auth.role !== "verifier")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateServiceFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const updated = await Service.findByIdAndUpdate(
    parsed.data.serviceId,
    { formFields: parsed.data.formFields },
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: "Service not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Service form updated.",
    item: {
      id: String(updated._id),
      name: updated.name,
      description: updated.description ?? "",
      defaultPrice: typeof updated.defaultPrice === "number" ? updated.defaultPrice : null,
      defaultCurrency: updated.defaultCurrency ?? "INR",
      isPackage: Boolean(updated.isPackage),
      includedServiceIds: (updated.includedServiceIds ?? []).map((id) => String(id)),
      formFields: (updated.formFields ?? []).map((field) => ({
        question: field.question,
        fieldType: field.fieldType,
        required: Boolean(field.required),
      })),
    },
  });
}
