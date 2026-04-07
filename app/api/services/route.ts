import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import Service from "@/lib/models/Service";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const formFieldTypeSchema = z.enum(["text", "long_text", "number", "file", "date"]);

const SUPPORTED_QUESTION_ICON_KEYS = [
  "none",
  "diary",
  "house",
  "pen",
  "calendar",
  "phone",
  "location",
  "id-card",
  "document",
  "work",
  "person",
  "email",
  "company",
  "global",
  "security",
] as const;

type QuestionIconKey = (typeof SUPPORTED_QUESTION_ICON_KEYS)[number];

const DEFAULT_QUESTION_ICON: QuestionIconKey = "diary";

function normalizeQuestionIconKey(rawIconKey: unknown): QuestionIconKey {
  if (typeof rawIconKey !== "string") {
    return DEFAULT_QUESTION_ICON;
  }

  const normalized = rawIconKey.trim().toLowerCase() as QuestionIconKey;
  return SUPPORTED_QUESTION_ICON_KEYS.includes(normalized)
    ? normalized
    : DEFAULT_QUESTION_ICON;
}

const nullableLengthSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }

    return value;
  },
  z.coerce.number().int().min(1).max(5000).nullable(),
);

function createFieldKey() {
  return `fld_${crypto.randomUUID()}`;
}

const DEFAULT_PERSONAL_DETAILS_SERVICE_NAME = "Personal details";

const formFieldSchema = z
  .object({
    fieldKey: z.string().trim().min(1).max(120).optional(),
    question: z.string().trim().min(1).max(200),
    iconKey: z.string().trim().max(40).optional().default(DEFAULT_QUESTION_ICON),
    fieldType: formFieldTypeSchema,
    required: z.boolean().optional().default(false),
    repeatable: z.boolean().optional().default(false),
    minLength: nullableLengthSchema.optional(),
    maxLength: nullableLengthSchema.optional(),
    forceUppercase: z.boolean().optional().default(false),
    allowNotApplicable: z.boolean().optional().default(false),
    notApplicableText: z.string().trim().max(200).optional().default("Not Applicable"),
  })
  .superRefine((field, ctx) => {
    const supportsLengthConstraints =
      field.fieldType === "text" ||
      field.fieldType === "long_text" ||
      field.fieldType === "number";

    if (
      supportsLengthConstraints &&
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

    if (field.allowNotApplicable && !field.notApplicableText.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notApplicableText"],
        message: "Not Applicable text is required when enabled.",
      });
    }
  });

type ParsedFormField = z.infer<typeof formFieldSchema>;

function normalizeFormField(field: ParsedFormField) {
  const supportsLengthConstraints =
    field.fieldType === "text" ||
    field.fieldType === "long_text" ||
    field.fieldType === "number";
  const supportsUppercaseConstraint =
    field.fieldType === "text" || field.fieldType === "long_text";

  return {
    fieldKey: field.fieldKey?.trim() || createFieldKey(),
    question: field.question.trim(),
    iconKey: normalizeQuestionIconKey(field.iconKey),
    fieldType: field.fieldType,
    required: Boolean(field.required),
    repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
    minLength: supportsLengthConstraints
      ? typeof field.minLength === "number"
        ? field.minLength
        : null
      : null,
    maxLength: supportsLengthConstraints
      ? typeof field.maxLength === "number"
        ? field.maxLength
        : null
      : null,
    forceUppercase: supportsUppercaseConstraint ? Boolean(field.forceUppercase) : false,
    allowNotApplicable: Boolean(field.allowNotApplicable),
    notApplicableText: Boolean(field.allowNotApplicable)
      ? field.notApplicableText.trim() || "Not Applicable"
      : "",
  };
}

function serializeFormField(field: {
  fieldKey?: string;
  question: string;
  iconKey?: unknown;
  fieldType: "text" | "long_text" | "number" | "file" | "date";
  required?: boolean;
  repeatable?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  forceUppercase?: boolean;
  allowNotApplicable?: boolean;
  notApplicableText?: string;
}) {
  const supportsTextConstraints =
    field.fieldType === "text" || field.fieldType === "long_text";

  return {
    fieldKey: field.fieldKey?.trim() || createFieldKey(),
    question: field.question,
    iconKey: normalizeQuestionIconKey(field.iconKey),
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
    allowNotApplicable: Boolean(field.allowNotApplicable),
    notApplicableText: Boolean(field.allowNotApplicable)
      ? field.notApplicableText?.trim() || "Not Applicable"
      : "",
  };
}

const DEFAULT_PERSONAL_DETAILS_FORM_FIELDS: ParsedFormField[] = [
  {
    fieldKey: "personal_full_name",
    question: "Full name (as per government ID)",
    iconKey: "pen",
    fieldType: "text",
    required: true,
    repeatable: false,
    minLength: 2,
    maxLength: 120,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
  },
  {
    fieldKey: "personal_date_of_birth",
    question: "Date of birth",
    iconKey: "calendar",
    fieldType: "date",
    required: true,
    repeatable: false,
    minLength: null,
    maxLength: null,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
  },
  {
    fieldKey: "personal_mobile_number",
    question: "Mobile number",
    iconKey: "phone",
    fieldType: "text",
    required: true,
    repeatable: false,
    minLength: 7,
    maxLength: 20,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
  },
  {
    fieldKey: "personal_residential_address",
    question: "Current residential address",
    iconKey: "house",
    fieldType: "long_text",
    required: true,
    repeatable: false,
    minLength: 10,
    maxLength: 400,
    forceUppercase: false,
    allowNotApplicable: false,
    notApplicableText: "",
  },
  {
    fieldKey: "personal_primary_id_number",
    question: "Primary government ID number",
    iconKey: "id-card",
    fieldType: "text",
    required: true,
    repeatable: false,
    minLength: 4,
    maxLength: 80,
    forceUppercase: true,
    allowNotApplicable: false,
    notApplicableText: "",
  },
];

function isHiddenService(service: {
  hiddenFromCustomerPortal?: unknown;
  isDefaultPersonalDetails?: unknown;
}) {
  return Boolean(service.hiddenFromCustomerPortal || service.isDefaultPersonalDetails);
}

async function ensureDefaultPersonalDetailsService() {
  const normalizedDefaultFields = DEFAULT_PERSONAL_DETAILS_FORM_FIELDS.map((field) =>
    normalizeFormField(field),
  );

  const existingDefault = await Service.findOne({ isDefaultPersonalDetails: true })
    .select(
      "_id hiddenFromCustomerPortal isDefaultPersonalDetails isPackage defaultPrice allowMultipleEntries includedServiceIds formFields",
    )
    .lean();

  if (existingDefault) {
    const shouldSeedDefaultFields =
      !Array.isArray(existingDefault.formFields) || existingDefault.formFields.length === 0;

    if (
      !isHiddenService(existingDefault) ||
      Boolean(existingDefault.isPackage) ||
      Boolean(existingDefault.allowMultipleEntries) ||
      Number(existingDefault.defaultPrice ?? 0) !== 0 ||
      (existingDefault.includedServiceIds ?? []).length > 0 ||
      shouldSeedDefaultFields
    ) {
      await Service.findByIdAndUpdate(existingDefault._id, {
        hiddenFromCustomerPortal: true,
        isDefaultPersonalDetails: true,
        isPackage: false,
        allowMultipleEntries: false,
        includedServiceIds: [],
        defaultPrice: 0,
        ...(shouldSeedDefaultFields ? { formFields: normalizedDefaultFields } : {}),
      });
    }

    return;
  }

  const existingByName = await Service.findOne({
    name: { $regex: /^personal\s+details$/i },
  })
    .select("_id formFields")
    .lean();

  if (existingByName) {
    const shouldSeedDefaultFields =
      !Array.isArray(existingByName.formFields) || existingByName.formFields.length === 0;

    await Service.findByIdAndUpdate(existingByName._id, {
      hiddenFromCustomerPortal: true,
      isDefaultPersonalDetails: true,
      isPackage: false,
      allowMultipleEntries: false,
      includedServiceIds: [],
      defaultPrice: 0,
      ...(shouldSeedDefaultFields ? { formFields: normalizedDefaultFields } : {}),
    });
    return;
  }

  await Service.create({
    name: DEFAULT_PERSONAL_DETAILS_SERVICE_NAME,
    description: "System service that captures candidate personal details.",
    defaultPrice: 0,
    defaultCurrency: "INR",
    isPackage: false,
    allowMultipleEntries: false,
    includedServiceIds: [],
    hiddenFromCustomerPortal: true,
    isDefaultPersonalDetails: true,
    formFields: normalizedDefaultFields,
  });
}

const createServiceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional().default(""),
  defaultPrice: z.coerce.number().min(0).optional(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES).optional().default("INR"),
  isPackage: z.boolean().optional().default(false),
  allowMultipleEntries: z.boolean().optional().default(false),
  multipleEntriesLabel: z.string().optional().nullable(),
  includedServiceIds: z.array(z.string().min(1)).optional().default([]),
  formFields: z.array(formFieldSchema).optional().default([]),
});

const updateServiceFormSchema = z.object({
  serviceId: z.string().min(1),
  allowMultipleEntries: z.boolean().optional(),
  multipleEntriesLabel: z.string().optional().nullable(),
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
  await ensureDefaultPersonalDetailsService();
  const items = await Service.find({}).sort({ name: 1 }).lean();

  return NextResponse.json({
    items: items.map((item) => ({
      id: String(item._id),
      name: item.name,
      description: item.description ?? "",
      defaultPrice: typeof item.defaultPrice === "number" ? item.defaultPrice : null,
      defaultCurrency: item.defaultCurrency ?? "INR",
      isPackage: Boolean(item.isPackage),
      allowMultipleEntries: Boolean(item.allowMultipleEntries),
        multipleEntriesLabel: item.multipleEntriesLabel ?? undefined,
      hiddenFromCustomerPortal: Boolean(item.hiddenFromCustomerPortal),
      isDefaultPersonalDetails: Boolean(item.isDefaultPersonalDetails),
      includedServiceIds: (item.includedServiceIds ?? []).map((id) => String(id)),
      formFields: (item.formFields ?? []).map((field) =>
        serializeFormField({
          fieldKey: field.fieldKey,
          question: field.question,
          iconKey: field.iconKey,
          fieldType: field.fieldType,
          required: field.required,
          repeatable: field.repeatable,
          minLength: field.minLength,
          maxLength: field.maxLength,
          forceUppercase: field.forceUppercase,
          allowNotApplicable: field.allowNotApplicable,
          notApplicableText: field.notApplicableText,
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
  await ensureDefaultPersonalDetailsService();

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
      .select("_id isPackage hiddenFromCustomerPortal isDefaultPersonalDetails")
      .lean();

    if (includedServices.length !== includedServiceIds.length) {
      return NextResponse.json(
        { error: "One or more package services are invalid." },
        { status: 400 },
      );
    }

    if (
      includedServices.some(
        (service) => Boolean(service.isPackage) || isHiddenService(service),
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Package deals can only include regular services that are visible on the customer portal.",
        },
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
    allowMultipleEntries: parsed.data.allowMultipleEntries,
      multipleEntriesLabel: parsed.data.multipleEntriesLabel ?? undefined,
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
        allowMultipleEntries: Boolean(service.allowMultipleEntries),
          multipleEntriesLabel: service.multipleEntriesLabel ?? undefined,
        hiddenFromCustomerPortal: Boolean(service.hiddenFromCustomerPortal),
        isDefaultPersonalDetails: Boolean(service.isDefaultPersonalDetails),
        includedServiceIds: (service.includedServiceIds ?? []).map((id) => String(id)),
        formFields: (service.formFields ?? []).map((field) =>
          serializeFormField({
            fieldKey: field.fieldKey,
            question: field.question,
            iconKey: field.iconKey,
            fieldType: field.fieldType,
            required: field.required,
            repeatable: field.repeatable,
            minLength: field.minLength,
            maxLength: field.maxLength,
            forceUppercase: field.forceUppercase,
            allowNotApplicable: field.allowNotApplicable,
            notApplicableText: field.notApplicableText,
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
  const updatePayload: {
    formFields: ReturnType<typeof normalizeFormField>[];
    allowMultipleEntries?: boolean;
      multipleEntriesLabel?: string | null;
  } = {
    formFields: normalizedFormFields,
  };

  if (typeof parsed.data.allowMultipleEntries === "boolean") {
    updatePayload.allowMultipleEntries = parsed.data.allowMultipleEntries;
    }

    if ("multipleEntriesLabel" in parsed.data) {
      updatePayload.multipleEntriesLabel = parsed.data.multipleEntriesLabel;
  }

  await connectMongo();
  await ensureDefaultPersonalDetailsService();

  const updated = await Service.findByIdAndUpdate(
    parsed.data.serviceId,
    updatePayload,
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
      allowMultipleEntries: Boolean(updated.allowMultipleEntries),
        multipleEntriesLabel: updated.multipleEntriesLabel ?? undefined,
      hiddenFromCustomerPortal: Boolean(updated.hiddenFromCustomerPortal),
      isDefaultPersonalDetails: Boolean(updated.isDefaultPersonalDetails),
      includedServiceIds: (updated.includedServiceIds ?? []).map((id) => String(id)),
      formFields: (updated.formFields ?? []).map((field) =>
        serializeFormField({
          fieldKey: field.fieldKey,
          question: field.question,
          iconKey: field.iconKey,
          fieldType: field.fieldType,
          required: field.required,
          repeatable: field.repeatable,
          minLength: field.minLength,
          maxLength: field.maxLength,
          forceUppercase: field.forceUppercase,
          allowNotApplicable: field.allowNotApplicable,
          notApplicableText: field.notApplicableText,
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

  const targetService = await Service.findById(id)
    .select("name isDefaultPersonalDetails hiddenFromCustomerPortal")
    .lean();

  if (!targetService) {
    return NextResponse.json({ error: "Service not found." }, { status: 404 });
  }

  if (
    Boolean(targetService.isDefaultPersonalDetails) ||
    /^personal\s+details$/i.test(targetService.name ?? "")
  ) {
    return NextResponse.json(
      {
        error:
          "Personal details is a system service and cannot be deleted.",
      },
      { status: 400 },
    );
  }

  const deleted = await Service.findByIdAndDelete(id);

  if (!deleted) {
    return NextResponse.json({ error: "Service not found." }, { status: 404 });
  }

  return NextResponse.json({ message: "Service deleted successfully." });
}
