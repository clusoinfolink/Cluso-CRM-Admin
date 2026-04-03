import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import Service from "@/lib/models/Service";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const formFieldTypeSchema = z.enum(["text", "long_text", "number", "file", "date"]);

const nullableLengthSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }

    return value;
  },
  z.coerce.number().int().min(1).max(5000).nullable(),
);

const formFieldSchema = z
  .object({
    question: z.string().trim().min(1).max(200),
    fieldType: formFieldTypeSchema,
    required: z.boolean().optional().default(false),
    repeatable: z.boolean().optional().default(false),
    minLength: nullableLengthSchema.optional(),
    maxLength: nullableLengthSchema.optional(),
    forceUppercase: z.boolean().optional().default(false),
  })
  .superRefine((field, ctx) => {
    const supportsTextConstraints =
      field.fieldType === "text" || field.fieldType === "long_text";

    if (
      supportsTextConstraints &&
      field.minLength !== null &&
      field.minLength !== undefined &&
      field.maxLength !== null &&
      field.maxLength !== undefined &&
      field.minLength > field.maxLength
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minLength"],
        message: "Minimum length cannot be greater than maximum length.",
      });
    }

    if (field.fieldType === "file" && field.repeatable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repeatable"],
        message: "File upload fields cannot be repeatable.",
      });
    }
  });

type ParsedFormField = z.infer<typeof formFieldSchema>;

function normalizeFormField(field: ParsedFormField) {
  const supportsTextConstraints =
    field.fieldType === "text" || field.fieldType === "long_text";

  return {
    question: field.question.trim(),
    fieldType: field.fieldType,
    required: Boolean(field.required),
    repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
    minLength: supportsTextConstraints
      ? typeof field.minLength === "number"
        ? field.minLength
        : null
      : null,
    maxLength: supportsTextConstraints
      ? typeof field.maxLength === "number"
        ? field.maxLength
        : null
      : null,
    forceUppercase: supportsTextConstraints ? Boolean(field.forceUppercase) : false,
  };
}

function serializeFormField(field: {
  question: string;
  fieldType: "text" | "long_text" | "number" | "file" | "date";
  required?: boolean;
  repeatable?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  forceUppercase?: boolean;
}) {
  const supportsTextConstraints =
    field.fieldType === "text" || field.fieldType === "long_text";

  return {
    question: field.question,
    fieldType: field.fieldType,
    required: Boolean(field.required),
    repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
    minLength:
      supportsTextConstraints && typeof field.minLength === "number"
        ? field.minLength
        : null,
    maxLength:
      supportsTextConstraints && typeof field.maxLength === "number"
        ? field.maxLength
        : null,
    forceUppercase: supportsTextConstraints ? Boolean(field.forceUppercase) : false,
  };
}

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
      formFields: (item.formFields ?? []).map((field) =>
        serializeFormField({
          question: field.question,
          fieldType: field.fieldType,
          required: field.required,
          repeatable: field.repeatable,
          minLength: field.minLength,
          maxLength: field.maxLength,
          forceUppercase: field.forceUppercase,
        }),
      ),
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
  const normalizedFormFields = parsed.data.formFields.map((field) => normalizeFormField(field));

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
    formFields: normalizedFormFields,
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
        formFields: (service.formFields ?? []).map((field) =>
          serializeFormField({
            question: field.question,
            fieldType: field.fieldType,
            required: field.required,
            repeatable: field.repeatable,
            minLength: field.minLength,
            maxLength: field.maxLength,
            forceUppercase: field.forceUppercase,
          }),
        ),
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

  const normalizedFormFields = parsed.data.formFields.map((field) => normalizeFormField(field));

  await connectMongo();

  const updated = await Service.findByIdAndUpdate(
    parsed.data.serviceId,
    { formFields: normalizedFormFields },
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
      formFields: (updated.formFields ?? []).map((field) =>
        serializeFormField({
          question: field.question,
          fieldType: field.fieldType,
          required: field.required,
          repeatable: field.repeatable,
          minLength: field.minLength,
          maxLength: field.maxLength,
          forceUppercase: field.forceUppercase,
        }),
      ),
    },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Service ID is required." }, { status: 400 });
  }

  await connectMongo();

  const deleted = await Service.findByIdAndDelete(id);

  if (!deleted) {
    return NextResponse.json({ error: "Service not found." }, { status: 404 });
  }

  return NextResponse.json({ message: "Service deleted successfully." });
}
