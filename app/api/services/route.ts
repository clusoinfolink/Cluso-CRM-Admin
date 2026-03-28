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

  const existing = await Service.findOne({ name: normalizedName })
    .collation({ locale: "en", strength: 2 })
    .lean();
  if (existing) {
    return NextResponse.json({ error: "Service already exists." }, { status: 409 });
  }

  const service = await Service.create({
    name: normalizedName,
    description: parsed.data.description?.trim() ?? "",
    defaultPrice: parsed.data.defaultPrice,
    defaultCurrency: parsed.data.defaultCurrency,
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
      formFields: (updated.formFields ?? []).map((field) => ({
        question: field.question,
        fieldType: field.fieldType,
        required: Boolean(field.required),
      })),
    },
  });
}
