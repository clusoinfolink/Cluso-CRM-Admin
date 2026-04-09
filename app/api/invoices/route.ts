import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import ClusoDetails from "@/lib/models/ClusoDetails";
import Invoice from "@/lib/models/Invoice";
import User from "@/lib/models/User";
import type {
  InvoiceCurrencyTotal,
  InvoiceLineItem,
  InvoicePartyDetails,
  InvoiceRecord,
} from "@/lib/types";

const CLUSO_DETAILS_SLUG = "cluso-details";
const SUPPORTED_CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCIES);

const generateInvoiceSchema = z.object({
  action: z.literal("generate"),
  companyId: z.string().min(1),
  enterpriseDetails: z.unknown().optional(),
  clusoDetails: z.unknown().optional(),
});

const updateInvoiceSchema = z.object({
  action: z.literal("update-fields"),
  invoiceId: z.string().min(1),
  enterpriseDetails: z.unknown().optional(),
  clusoDetails: z.unknown().optional(),
});

const emptyPartyDetails: InvoicePartyDetails = {
  companyName: "",
  loginEmail: "",
  gstin: "",
  cinRegistrationNumber: "",
  address: "",
  invoiceEmail: "",
  billingSameAsCompany: true,
  billingAddress: "",
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value;
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function toIdString(value: unknown): string {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const objectLike = value as { toHexString?: () => string; toString?: () => string };
  if (typeof objectLike.toHexString === "function") {
    const hex = normalizeWhitespace(objectLike.toHexString());
    if (hex) {
      return hex;
    }
  }

  const raw = value as Record<string, unknown>;

  if ("$oid" in raw) {
    return toIdString(raw.$oid);
  }

  if ("id" in raw && raw.id && raw.id !== value) {
    const nestedId = toIdString(raw.id);
    if (nestedId) {
      return nestedId;
    }
  }

  if ("_id" in raw && raw._id && raw._id !== value) {
    const nestedUnderscoreId = toIdString(raw._id);
    if (nestedUnderscoreId) {
      return nestedUnderscoreId;
    }
  }

  const text = typeof objectLike.toString === "function" ? objectLike.toString() : String(value);
  if (!text || text === "[object Object]") {
    return "";
  }

  return normalizeWhitespace(text);
}

function formatAddress(value: unknown) {
  const raw = asRecord(value);
  const parts = [
    asString(raw.line1),
    asString(raw.line2),
    asString(raw.city),
    asString(raw.state),
    asString(raw.postalCode),
    asString(raw.country),
  ]
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);

  return parts.join(", ");
}

function normalizePartyDetails(
  value: unknown,
  fallback: InvoicePartyDetails,
): InvoicePartyDetails {
  const raw = asRecord(value);

  const billingSameAsCompany =
    typeof raw.billingSameAsCompany === "boolean"
      ? raw.billingSameAsCompany
      : fallback.billingSameAsCompany;

  const address = normalizeWhitespace(asString(raw.address, fallback.address));
  const billingAddress = normalizeWhitespace(
    asString(raw.billingAddress, fallback.billingAddress),
  );

  return {
    companyName: normalizeWhitespace(
      asString(raw.companyName, fallback.companyName),
    ),
    loginEmail: normalizeWhitespace(asString(raw.loginEmail, fallback.loginEmail)),
    gstin: normalizeWhitespace(asString(raw.gstin, fallback.gstin)).toUpperCase(),
    cinRegistrationNumber: normalizeWhitespace(
      asString(raw.cinRegistrationNumber, fallback.cinRegistrationNumber),
    ),
    address,
    invoiceEmail: normalizeWhitespace(
      asString(raw.invoiceEmail, fallback.invoiceEmail),
    ),
    billingSameAsCompany,
    billingAddress: billingSameAsCompany ? address : billingAddress,
  };
}

function normalizeInvoiceLineItems(value: unknown): InvoiceLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const raw = asRecord(entry);
      const serviceId = toIdString(raw.serviceId);
      const serviceName = normalizeWhitespace(asString(raw.serviceName));
      const currencyRaw = normalizeWhitespace(asString(raw.currency, "INR")).toUpperCase();
      const currency = SUPPORTED_CURRENCY_SET.has(currencyRaw) ? currencyRaw : "INR";
      const priceRaw = Number(raw.price);
      const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : 0;

      if (!serviceId || !serviceName || price <= 0) {
        return null;
      }

      return {
        serviceId,
        serviceName,
        price,
        currency,
      } as InvoiceLineItem;
    })
    .filter((entry): entry is InvoiceLineItem => Boolean(entry));
}

function computeTotalsByCurrency(lineItems: InvoiceLineItem[]): InvoiceCurrencyTotal[] {
  const totals = new Map<string, number>();

  for (const item of lineItems) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.price);
  }

  return [...totals.entries()]
    .map(
      ([currency, subtotal]) =>
        ({
          currency: currency as InvoiceCurrencyTotal["currency"],
          subtotal,
        }) as InvoiceCurrencyTotal,
    )
    .sort((first, second) => first.currency.localeCompare(second.currency));
}

function buildEnterpriseDefaults(customer: {
  name?: string;
  email?: string;
  partnerProfile?: unknown;
}): InvoicePartyDetails {
  const partnerProfile = asRecord(customer.partnerProfile);
  const companyInformation = asRecord(partnerProfile.companyInformation);
  const invoicingInformation = asRecord(partnerProfile.invoicingInformation);

  const companyAddress = formatAddress(companyInformation.address);
  const billingSameAsCompany =
    typeof invoicingInformation.billingSameAsCompany === "boolean"
      ? invoicingInformation.billingSameAsCompany
      : true;
  const explicitBillingAddress = formatAddress(invoicingInformation.address);

  return {
    companyName:
      normalizeWhitespace(asString(companyInformation.companyName)) ||
      normalizeWhitespace(customer.name ?? ""),
    loginEmail: normalizeWhitespace(customer.email ?? ""),
    gstin: normalizeWhitespace(asString(companyInformation.gstin)).toUpperCase(),
    cinRegistrationNumber: normalizeWhitespace(
      asString(companyInformation.cinRegistrationNumber),
    ),
    address: companyAddress,
    invoiceEmail:
      normalizeWhitespace(asString(invoicingInformation.invoiceEmail)) ||
      normalizeWhitespace(customer.email ?? ""),
    billingSameAsCompany,
    billingAddress: billingSameAsCompany ? companyAddress : explicitBillingAddress,
  };
}

function buildClusoDefaults(profile: unknown): InvoicePartyDetails {
  const root = asRecord(profile);
  const companyInformation = asRecord(root.companyInformation);
  const invoicingInformation = asRecord(root.invoicingInformation);
  const primaryContactInformation = asRecord(root.primaryContactInformation);

  const companyAddress = formatAddress(companyInformation.address);
  const billingSameAsCompany =
    typeof invoicingInformation.billingSameAsCompany === "boolean"
      ? invoicingInformation.billingSameAsCompany
      : true;
  const explicitBillingAddress = formatAddress(invoicingInformation.address);
  const loginEmail =
    normalizeWhitespace(asString(primaryContactInformation.email)) ||
    normalizeWhitespace(asString(invoicingInformation.invoiceEmail));

  return {
    companyName: normalizeWhitespace(asString(companyInformation.companyName)),
    loginEmail,
    gstin: normalizeWhitespace(asString(companyInformation.gstin)).toUpperCase(),
    cinRegistrationNumber: normalizeWhitespace(
      asString(companyInformation.cinRegistrationNumber),
    ),
    address: companyAddress,
    invoiceEmail: normalizeWhitespace(asString(invoicingInformation.invoiceEmail)),
    billingSameAsCompany,
    billingAddress: billingSameAsCompany ? companyAddress : explicitBillingAddress,
  };
}

function normalizeInvoiceRecord(doc: Record<string, unknown>): InvoiceRecord {
  const idRaw = doc._id;
  const customerRaw = doc.customer;

  return {
    id: String(idRaw),
    invoiceNumber: asString(doc.invoiceNumber),
    customerId:
      typeof customerRaw === "string"
        ? customerRaw
        : customerRaw
          ? String((customerRaw as { _id?: unknown })._id ?? customerRaw)
          : "",
    customerName: asString(doc.customerName),
    customerEmail: asString(doc.customerEmail),
    enterpriseDetails: normalizePartyDetails(doc.enterpriseDetails, emptyPartyDetails),
    clusoDetails: normalizePartyDetails(doc.clusoDetails, emptyPartyDetails),
    lineItems: normalizeInvoiceLineItems(doc.lineItems),
    totalsByCurrency: Array.isArray(doc.totalsByCurrency)
      ? (doc.totalsByCurrency as Array<Record<string, unknown>>)
          .map((entry) => {
            const currencyRaw = normalizeWhitespace(asString(entry.currency, "INR")).toUpperCase();
            const currency = SUPPORTED_CURRENCY_SET.has(currencyRaw)
              ? currencyRaw
              : "INR";
            const subtotalRaw = Number(entry.subtotal);
            const subtotal = Number.isFinite(subtotalRaw) ? subtotalRaw : 0;

            return {
              currency,
              subtotal,
            } as InvoiceCurrencyTotal;
          })
          .filter((entry) => entry.subtotal >= 0)
      : [],
    generatedByName: asString(doc.generatedByName),
    createdAt: new Date(String(doc.createdAt ?? "")).toISOString(),
    updatedAt: new Date(String(doc.updatedAt ?? "")).toISOString(),
  };
}

async function createUniqueInvoiceNumber() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${timestamp}-${randomSuffix}`;

    const existing = await Invoice.findOne({ invoiceNumber }).select("_id").lean();
    if (!existing) {
      return invoiceNumber;
    }
  }

  const fallbackTimestamp = Date.now();
  return `INV-${fallbackTimestamp}`;
}

function canAccessInvoices(auth: { role: string } | null) {
  if (!auth) {
    return false;
  }

  return auth.role === "admin" || auth.role === "superadmin";
}

export async function GET(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!canAccessInvoices(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();

  const customerIdFilter = req.nextUrl.searchParams.get("customerId")?.trim() ?? "";
  const filter = customerIdFilter ? { customer: customerIdFilter } : {};

  const [invoiceDocs, clusoDoc] = await Promise.all([
    Invoice.find(filter).sort({ createdAt: -1 }).lean(),
    ClusoDetails.findOne({ slug: CLUSO_DETAILS_SLUG }).select("profile").lean(),
  ]);

  return NextResponse.json({
    invoices: invoiceDocs.map((doc) =>
      normalizeInvoiceRecord(doc as unknown as Record<string, unknown>),
    ),
    clusoDefaultDetails: buildClusoDefaults(clusoDoc?.profile),
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!canAccessInvoices(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = generateInvoiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invoice generation payload." },
      { status: 400 },
    );
  }

  await connectMongo();

  const [customer, clusoDoc, actor] = await Promise.all([
    User.findOne({ _id: parsed.data.companyId, role: "customer" })
      .select("name email selectedServices partnerProfile")
      .lean(),
    ClusoDetails.findOne({ slug: CLUSO_DETAILS_SLUG }).select("profile").lean(),
    User.findById(auth?.userId).select("name").lean(),
  ]);

  if (!customer) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const lineItems = normalizeInvoiceLineItems(customer.selectedServices ?? []);
  if (lineItems.length === 0) {
    return NextResponse.json(
      {
        error:
          "No active company service rates are available. Assign services and latest rates before generating invoices.",
      },
      { status: 400 },
    );
  }

  const enterpriseDefaults = buildEnterpriseDefaults(customer);
  const clusoDefaults = buildClusoDefaults(clusoDoc?.profile);

  const enterpriseDetails = normalizePartyDetails(
    parsed.data.enterpriseDetails,
    enterpriseDefaults,
  );
  const clusoDetails = normalizePartyDetails(parsed.data.clusoDetails, clusoDefaults);

  const totalsByCurrency = computeTotalsByCurrency(lineItems);
  const invoiceNumber = await createUniqueInvoiceNumber();

  const created = await Invoice.create({
    invoiceNumber,
    customer: parsed.data.companyId,
    customerName: customer.name ?? "",
    customerEmail: customer.email ?? "",
    enterpriseDetails,
    clusoDetails,
    lineItems,
    totalsByCurrency,
    generatedBy: auth?.userId ?? null,
    generatedByName: actor?.name ?? "",
  });

  return NextResponse.json({
    message: "Invoice generated successfully with latest company service rates.",
    invoice: normalizeInvoiceRecord(
      created.toObject() as unknown as Record<string, unknown>,
    ),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!canAccessInvoices(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateInvoiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invoice update payload." },
      { status: 400 },
    );
  }

  await connectMongo();

  const invoiceDoc = await Invoice.findById(parsed.data.invoiceId);
  if (!invoiceDoc) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const currentEnterprise = normalizePartyDetails(
    invoiceDoc.enterpriseDetails,
    emptyPartyDetails,
  );
  const currentCluso = normalizePartyDetails(invoiceDoc.clusoDetails, emptyPartyDetails);

  invoiceDoc.enterpriseDetails = normalizePartyDetails(
    parsed.data.enterpriseDetails,
    currentEnterprise,
  );
  invoiceDoc.clusoDetails = normalizePartyDetails(
    parsed.data.clusoDetails,
    currentCluso,
  );

  await invoiceDoc.save();

  return NextResponse.json({
    message: "Invoice details updated successfully.",
    invoice: normalizeInvoiceRecord(
      invoiceDoc.toObject() as unknown as Record<string, unknown>,
    ),
  });
}