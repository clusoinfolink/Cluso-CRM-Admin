import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import ClusoDetails from "@/lib/models/ClusoDetails";
import Invoice from "@/lib/models/Invoice";
import User from "@/lib/models/User";
import VerificationRequest from "@/lib/models/VerificationRequest";
import type {
  InvoiceCurrencyTotal,
  InvoiceLineItem,
  InvoicePartyDetails,
  InvoiceRecord,
} from "@/lib/types";

const CLUSO_DETAILS_SLUG = "cluso-details";
const SUPPORTED_CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCIES);
const BILLING_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const generateInvoiceSchema = z.object({
  action: z.literal("generate"),
  companyId: z.string().min(1),
  billingMonth: z.string().regex(BILLING_MONTH_REGEX).optional(),
  gstEnabled: z.boolean().optional(),
  gstRate: z.number().min(0).max(100).optional(),
  enterpriseDetails: z.unknown().optional(),
  clusoDetails: z.unknown().optional(),
});

const updateInvoiceSchema = z.object({
  action: z.enum([
    "update-fields",
    "update-enterprise-defaults",
    "update-cluso-defaults",
    "update-company-gst-defaults",
  ]),
  invoiceId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  gstEnabled: z.boolean().optional(),
  gstRate: z.number().min(0).max(100).optional(),
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

type NormalizedServiceSelection = {
  serviceId: string;
  serviceName: string;
  price: number;
  currency: InvoiceLineItem["currency"];
};

type ServiceUsageSummary = {
  serviceId: string;
  serviceName: string;
  usageCount: number;
  fallbackPrice: number;
  fallbackCurrency: InvoiceLineItem["currency"];
};

type MonthlySummaryRow = {
  srNo: number;
  requestedAt: string;
  candidateName: string;
  requestStatus: string;
  serviceName: string;
  currency: InvoiceLineItem["currency"];
  subtotal: number;
  gstAmount: number;
  total: number;
};

type MonthlySummaryCurrencyTotal = {
  currency: InvoiceLineItem["currency"];
  subtotal: number;
  gstAmount: number;
  total: number;
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

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function normalizeGstRate(value: unknown, fallback = 18) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric < 0) {
    return 0;
  }

  if (numeric > 100) {
    return 100;
  }

  return Math.round(numeric * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeEmail(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function setAddressFromText(
  doc: { set: (path: string, value: unknown) => unknown },
  pathPrefix: string,
  text: string,
) {
  doc.set(`${pathPrefix}.line1`, normalizeWhitespace(text));
  doc.set(`${pathPrefix}.line2`, "");
  doc.set(`${pathPrefix}.city`, "");
  doc.set(`${pathPrefix}.state`, "");
  doc.set(`${pathPrefix}.postalCode`, "");
  doc.set(`${pathPrefix}.country`, "");
}

function getCurrentBillingMonth(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function normalizeBillingMonth(value: unknown): string {
  const candidate = normalizeWhitespace(asString(value));
  return BILLING_MONTH_REGEX.test(candidate) ? candidate : "";
}

function getBillingMonthRange(billingMonth: string) {
  const [yearText, monthText] = billingMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { monthStart, monthEnd };
}

function buildBillableRequestFilter(
  companyId: string,
  monthStart: Date,
  monthEnd: Date,
) {
  return {
    customer: companyId,
    "reportMetadata.generatedAt": { $exists: true, $ne: null },
    "reportMetadata.customerSharedAt": { $gte: monthStart, $lt: monthEnd },
  };
}

function formatBillingMonthLabel(billingMonth: string) {
  const [yearText, monthText] = billingMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  const parsed = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(parsed.getTime())) {
    return billingMonth;
  }

  return parsed.toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatBillingPeriod(billingMonth: string) {
  const parsedStart = new Date(`${billingMonth}-01T00:00:00.000Z`);
  if (Number.isNaN(parsedStart.getTime())) {
    return billingMonth || "-";
  }

  const year = parsedStart.getUTCFullYear();
  const monthIndex = parsedStart.getUTCMonth();
  const parsedEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));

  const formatOptions: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  };

  return `${parsedStart.toLocaleDateString("en-IN", formatOptions)} to ${parsedEnd.toLocaleDateString("en-IN", formatOptions)}`;
}

function buildMonthlySummaryRows(
  requests: Array<Record<string, unknown>>,
  gstEnabled: boolean,
  gstRate: number,
  invoiceLineItems: InvoiceLineItem[] = [],
) {
  const rows: MonthlySummaryRow[] = [];
  const totals = new Map<string, { subtotal: number; gstAmount: number; total: number }>();
  const normalizedRate = normalizeGstRate(gstRate, 18);

  const invoiceRatesByServiceId = new Map<string, InvoiceLineItem>();
  const invoiceRatesByServiceName = new Map<string, InvoiceLineItem>();

  invoiceLineItems.forEach((lineItem) => {
    const serviceId = normalizeWhitespace(lineItem.serviceId);
    const serviceNameKey = normalizeWhitespace(lineItem.serviceName).toLowerCase();

    if (serviceId) {
      invoiceRatesByServiceId.set(serviceId, lineItem);
    }

    if (serviceNameKey && !invoiceRatesByServiceName.has(serviceNameKey)) {
      invoiceRatesByServiceName.set(serviceNameKey, lineItem);
    }
  });

  let srNo = 1;
  for (const request of requests) {
    const candidateName = normalizeWhitespace(asString(request.candidateName)) || `Candidate ${srNo}`;
    const requestStatus = normalizeWhitespace(asString(request.status)) || "pending";
    const selectedServices = normalizeServiceSelections(request.selectedServices);
    const createdAt = new Date(asString(request.createdAt));
    const requestedAt = Number.isNaN(createdAt.getTime())
      ? ""
      : createdAt.toISOString();

    const normalizedServices = selectedServices.length > 0
      ? selectedServices
      : [{ serviceId: "", serviceName: "Service Not Available", price: 0, currency: "INR" as InvoiceLineItem["currency"] }];

    for (const service of normalizedServices) {
      const serviceId = normalizeWhitespace(service.serviceId);
      const serviceNameKey = normalizeWhitespace(service.serviceName).toLowerCase();
      const matchedInvoiceRate =
        (serviceId ? invoiceRatesByServiceId.get(serviceId) : undefined) ??
        invoiceRatesByServiceName.get(serviceNameKey);

      const currencyRaw = normalizeWhitespace(matchedInvoiceRate?.currency ?? service.currency).toUpperCase();
      const currency = SUPPORTED_CURRENCY_SET.has(currencyRaw) ? currencyRaw : "INR";
      const subtotal = roundMoney(matchedInvoiceRate?.price ?? service.price);
      const gstAmount = gstEnabled ? roundMoney((subtotal * normalizedRate) / 100) : 0;
      const total = roundMoney(subtotal + gstAmount);

      rows.push({
        srNo,
        requestedAt,
        candidateName,
        requestStatus,
        serviceName: matchedInvoiceRate?.serviceName ?? service.serviceName,
        currency: currency as InvoiceLineItem["currency"],
        subtotal,
        gstAmount,
        total,
      });

      const existing = totals.get(currency) ?? { subtotal: 0, gstAmount: 0, total: 0 };
      existing.subtotal = roundMoney(existing.subtotal + subtotal);
      existing.gstAmount = roundMoney(existing.gstAmount + gstAmount);
      existing.total = roundMoney(existing.total + total);
      totals.set(currency, existing);

      srNo += 1;
    }
  }

  const totalsByCurrency = [...totals.entries()]
    .map(
      ([currency, value]) =>
        ({
          currency: currency as InvoiceLineItem["currency"],
          subtotal: value.subtotal,
          gstAmount: value.gstAmount,
          total: value.total,
        }) as MonthlySummaryCurrencyTotal,
    )
    .sort((first, second) => first.currency.localeCompare(second.currency));

  return { rows, totalsByCurrency };
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
      const price = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;
      const usageCountRaw = Number(raw.usageCount);
      const usageCount =
        Number.isFinite(usageCountRaw) && usageCountRaw > 0
          ? Math.floor(usageCountRaw)
          : 1;
      const lineTotalRaw = Number(raw.lineTotal);
      const lineTotal =
        Number.isFinite(lineTotalRaw) && lineTotalRaw >= 0
          ? lineTotalRaw
          : price * usageCount;

      if (!serviceId || !serviceName) {
        return null;
      }

      return {
        serviceId,
        serviceName,
        usageCount,
        price,
        lineTotal,
        currency,
      } as InvoiceLineItem;
    })
    .filter((entry): entry is InvoiceLineItem => Boolean(entry));
}

function normalizeServiceSelections(value: unknown): NormalizedServiceSelection[] {
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
      const price = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;

      if (!serviceId || !serviceName) {
        return null;
      }

      return {
        serviceId,
        serviceName,
        price,
        currency,
      } as NormalizedServiceSelection;
    })
    .filter((entry): entry is NormalizedServiceSelection => Boolean(entry));
}

function buildMonthlyInvoiceLineItems(
  latestRates: InvoiceLineItem[],
  monthlyRequests: Array<Record<string, unknown>>,
): InvoiceLineItem[] {
  const ratesById = new Map<string, InvoiceLineItem>();
  const ratesByName = new Map<string, InvoiceLineItem>();

  for (const rate of latestRates) {
    ratesById.set(rate.serviceId, rate);
    const byNameKey = rate.serviceName.toLowerCase();
    if (!ratesByName.has(byNameKey)) {
      ratesByName.set(byNameKey, rate);
    }
  }

  const usageByService = new Map<string, ServiceUsageSummary>();

  for (const request of monthlyRequests) {
    const selectedServices = normalizeServiceSelections(request.selectedServices);
    for (const service of selectedServices) {
      const key = service.serviceId || service.serviceName.toLowerCase();
      const existing = usageByService.get(key);

      if (existing) {
        existing.usageCount += 1;
        continue;
      }

      usageByService.set(key, {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        usageCount: 1,
        fallbackPrice: service.price,
        fallbackCurrency: service.currency,
      });
    }
  }

  return [...usageByService.values()]
    .map((usage) => {
      const latestById = ratesById.get(usage.serviceId);
      const latestByName = ratesByName.get(usage.serviceName.toLowerCase());
      const latest = latestById ?? latestByName;

      const price = roundMoney(latest ? latest.price : usage.fallbackPrice);
      const currency = latest ? latest.currency : usage.fallbackCurrency;
      const serviceName = latest ? latest.serviceName : usage.serviceName;
      const lineTotal = roundMoney(price * usage.usageCount);

      return {
        serviceId: usage.serviceId,
        serviceName,
        usageCount: usage.usageCount,
        price,
        lineTotal,
        currency,
      } as InvoiceLineItem;
    })
    .filter((lineItem) => lineItem.usageCount > 0)
    .sort((first, second) => first.serviceName.localeCompare(second.serviceName));
}

function computeTotalsByCurrency(lineItems: InvoiceLineItem[]): InvoiceCurrencyTotal[] {
  const totals = new Map<string, number>();

  for (const item of lineItems) {
    totals.set(
      item.currency,
      roundMoney((totals.get(item.currency) ?? 0) + roundMoney(item.lineTotal)),
    );
  }

  return [...totals.entries()]
    .map(
      ([currency, subtotal]) =>
        ({
          currency: currency as InvoiceCurrencyTotal["currency"],
          subtotal: roundMoney(subtotal),
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

function buildEnterpriseGstDefaults(customer: {
  partnerProfile?: unknown;
}) {
  const partnerProfile = asRecord(customer.partnerProfile);
  const invoicingInformation = asRecord(partnerProfile.invoicingInformation);

  return {
    gstEnabled: asBoolean(invoicingInformation.gstEnabled, false),
    gstRate: normalizeGstRate(invoicingInformation.gstRate, 18),
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

function resolveInvoiceBillingMonth(doc: Record<string, unknown>) {
  const explicitBillingMonth = normalizeBillingMonth(doc.billingMonth);
  if (explicitBillingMonth) {
    return explicitBillingMonth;
  }

  const createdAt = new Date(String(doc.createdAt ?? ""));
  if (Number.isNaN(createdAt.getTime())) {
    return getCurrentBillingMonth();
  }

  return getCurrentBillingMonth(createdAt);
}

function normalizeInvoiceRecord(doc: Record<string, unknown>): InvoiceRecord {
  const idRaw = doc._id;
  const customerRaw = doc.customer;

  return {
    id: String(idRaw),
    invoiceNumber: asString(doc.invoiceNumber),
    billingMonth: resolveInvoiceBillingMonth(doc),
    gstEnabled: asBoolean(doc.gstEnabled, false),
    gstRate: normalizeGstRate(doc.gstRate, 18),
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

  const action = req.nextUrl.searchParams.get("action")?.trim() ?? "";
  if (action === "month-summary") {
    const companyId = req.nextUrl.searchParams.get("companyId")?.trim() ?? "";
    if (!companyId) {
      return NextResponse.json({ error: "Missing companyId." }, { status: 400 });
    }

    const billingMonth =
      normalizeBillingMonth(req.nextUrl.searchParams.get("billingMonth")) ||
      getCurrentBillingMonth();

    const { monthStart, monthEnd } = getBillingMonthRange(billingMonth);

    const [customer, clusoDoc, monthInvoice, requests] = await Promise.all([
      User.findOne({ _id: companyId, role: "customer" })
        .select("name email partnerProfile selectedServices")
        .lean(),
      ClusoDetails.findOne({ slug: CLUSO_DETAILS_SLUG }).select("profile").lean(),
      Invoice.findOne({ customer: companyId, billingMonth })
        .sort({ createdAt: -1 })
        .select("enterpriseDetails clusoDetails gstEnabled gstRate lineItems")
        .lean(),
      VerificationRequest.find(
        buildBillableRequestFilter(companyId, monthStart, monthEnd),
      )
        .sort({ createdAt: 1 })
        .select("candidateName status selectedServices createdAt")
        .lean(),
    ]);

    if (!customer) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const enterpriseDefaults = buildEnterpriseDefaults(customer);
    const enterpriseGstDefaults = buildEnterpriseGstDefaults(customer);
    const clusoDefaults = buildClusoDefaults(clusoDoc?.profile);

    const enterpriseDetails = monthInvoice
      ? normalizePartyDetails(monthInvoice.enterpriseDetails, enterpriseDefaults)
      : enterpriseDefaults;
    const clusoDetails = monthInvoice
      ? normalizePartyDetails(monthInvoice.clusoDetails, clusoDefaults)
      : clusoDefaults;

    const gstEnabled = monthInvoice
      ? asBoolean(monthInvoice.gstEnabled, false)
      : enterpriseGstDefaults.gstEnabled;
    const gstRate = monthInvoice
      ? normalizeGstRate(monthInvoice.gstRate, 18)
      : enterpriseGstDefaults.gstRate;
    const companyCurrentRates = normalizeInvoiceLineItems(
      asRecord(customer).selectedServices,
    );
    const invoiceLineItems = monthInvoice
      ? normalizeInvoiceLineItems((monthInvoice as Record<string, unknown>).lineItems)
      : companyCurrentRates;

    const { rows, totalsByCurrency } = buildMonthlySummaryRows(
      requests as unknown as Array<Record<string, unknown>>,
      gstEnabled,
      gstRate,
      invoiceLineItems,
    );

    return NextResponse.json({
      summary: {
        billingMonth,
        billingMonthLabel: formatBillingMonthLabel(billingMonth),
        billingPeriod: formatBillingPeriod(billingMonth),
        totalRequests: requests.length,
        gstEnabled,
        gstRate,
        enterpriseDetails,
        clusoDetails,
        rows,
        totalsByCurrency,
      },
    });
  }

  const customerIdFilter = req.nextUrl.searchParams.get("customerId")?.trim() ?? "";
  const filter = customerIdFilter ? { customer: customerIdFilter } : {};

  const [invoiceDocs, clusoDoc] = await Promise.all([
    Invoice.find(filter).sort({ billingMonth: -1, createdAt: -1 }).lean(),
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

  const billingMonth =
    normalizeBillingMonth(parsed.data.billingMonth) || getCurrentBillingMonth();
  const { monthStart, monthEnd } = getBillingMonthRange(billingMonth);

  const latestRates = normalizeInvoiceLineItems(customer.selectedServices ?? []);
  if (latestRates.length === 0) {
    return NextResponse.json(
      {
        error:
          "No active company service rates are available. Assign services and latest rates before generating invoices.",
      },
      { status: 400 },
    );
  }

  const monthlyRequests = await VerificationRequest.find(
    buildBillableRequestFilter(parsed.data.companyId, monthStart, monthEnd),
  )
    .select("selectedServices")
    .lean();

  const lineItems = buildMonthlyInvoiceLineItems(
    latestRates,
    monthlyRequests as unknown as Array<Record<string, unknown>>,
  );
  if (lineItems.length === 0) {
    const monthLabel = formatBillingMonthLabel(billingMonth);
    return NextResponse.json(
      {
        error: `No billable service usage found for ${monthLabel}. Only requests with generated reports that were shared to customer are invoiced in this month.`,
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
  const enterpriseGstDefaults = buildEnterpriseGstDefaults(customer);
  const gstEnabled = asBoolean(parsed.data.gstEnabled, enterpriseGstDefaults.gstEnabled);
  const gstRate = normalizeGstRate(parsed.data.gstRate, enterpriseGstDefaults.gstRate);

  const totalsByCurrency = computeTotalsByCurrency(lineItems);
  const invoiceNumber = await createUniqueInvoiceNumber();

  const legacyMonthFilter = {
    $or: [
      { billingMonth: { $exists: false } },
      { billingMonth: "" },
      { billingMonth: null },
    ],
    createdAt: { $gte: monthStart, $lt: monthEnd },
  };

  const deletedResult = await Invoice.deleteMany({
    customer: parsed.data.companyId,
    $or: [{ billingMonth }, legacyMonthFilter],
  });

  const created = await Invoice.create({
    invoiceNumber,
    billingMonth,
    customer: parsed.data.companyId,
    customerName: customer.name ?? "",
    customerEmail: customer.email ?? "",
    enterpriseDetails,
    clusoDetails,
    gstEnabled,
    gstRate,
    lineItems,
    totalsByCurrency,
    generatedBy: auth?.userId ?? null,
    generatedByName: actor?.name ?? "",
  });

  const replacedOlderInvoice = (deletedResult.deletedCount ?? 0) > 0;
  const billingMonthLabel = formatBillingMonthLabel(billingMonth);

  return NextResponse.json({
    message: replacedOlderInvoice
      ? `Invoice regenerated for ${billingMonthLabel}. Previous invoice for this month was deleted.`
      : `Invoice generated successfully for ${billingMonthLabel}.`,
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
      { error: "Invalid payload." },
      { status: 400 },
    );
  }

  await connectMongo();

  if (parsed.data.action === "update-enterprise-defaults") {
    if (!parsed.data.companyId) {
      return NextResponse.json({ error: "Missing companyId." }, { status: 400 });
    }

    const customer = await User.findOne({ _id: parsed.data.companyId, role: "customer" });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const enterpriseDetails = normalizePartyDetails(parsed.data.enterpriseDetails, emptyPartyDetails);

    const requestedLoginEmail = normalizeEmail(enterpriseDetails.loginEmail);
    const currentLoginEmail = normalizeEmail(asString(customer.email));

    if (requestedLoginEmail && requestedLoginEmail !== currentLoginEmail) {
      const existing = await User.findOne({
        email: requestedLoginEmail,
        _id: { $ne: customer._id },
      }).lean();

      if (existing) {
        return NextResponse.json(
          { error: "Login email is already used by another account." },
          { status: 409 },
        );
      }

      customer.email = requestedLoginEmail;
    }

    customer.set("partnerProfile.companyInformation.companyName", enterpriseDetails.companyName);
    customer.set("partnerProfile.companyInformation.gstin", enterpriseDetails.gstin);
    customer.set(
      "partnerProfile.companyInformation.cinRegistrationNumber",
      enterpriseDetails.cinRegistrationNumber,
    );
    setAddressFromText(
      customer,
      "partnerProfile.companyInformation.address",
      enterpriseDetails.address,
    );

    customer.set(
      "partnerProfile.invoicingInformation.billingSameAsCompany",
      enterpriseDetails.billingSameAsCompany,
    );
    customer.set(
      "partnerProfile.invoicingInformation.invoiceEmail",
      normalizeEmail(enterpriseDetails.invoiceEmail),
    );
    setAddressFromText(
      customer,
      "partnerProfile.invoicingInformation.address",
      enterpriseDetails.billingAddress,
    );

    customer.set("partnerProfile.updatedAt", new Date());
    await customer.save();

    return NextResponse.json({ message: "Customer defaults saved to profile." });
  }

  if (parsed.data.action === "update-cluso-defaults") {
    const clusoDetails = normalizePartyDetails(parsed.data.clusoDetails, emptyPartyDetails);

    const clusoDoc =
      (await ClusoDetails.findOne({ slug: CLUSO_DETAILS_SLUG })) ||
      new ClusoDetails({ slug: CLUSO_DETAILS_SLUG });

    clusoDoc.set("profile.companyInformation.companyName", clusoDetails.companyName);
    clusoDoc.set("profile.companyInformation.gstin", clusoDetails.gstin);
    clusoDoc.set(
      "profile.companyInformation.cinRegistrationNumber",
      clusoDetails.cinRegistrationNumber,
    );
    setAddressFromText(clusoDoc, "profile.companyInformation.address", clusoDetails.address);

    clusoDoc.set(
      "profile.invoicingInformation.billingSameAsCompany",
      clusoDetails.billingSameAsCompany,
    );
    clusoDoc.set(
      "profile.invoicingInformation.invoiceEmail",
      normalizeEmail(clusoDetails.invoiceEmail),
    );
    setAddressFromText(
      clusoDoc,
      "profile.invoicingInformation.address",
      clusoDetails.billingAddress,
    );

    clusoDoc.set(
      "profile.primaryContactInformation.email",
      normalizeEmail(clusoDetails.loginEmail),
    );
    clusoDoc.set("profile.updatedAt", new Date());

    await clusoDoc.save();

    return NextResponse.json({ message: "Cluso defaults saved to profile." });
  }

  if (parsed.data.action === "update-company-gst-defaults") {
    if (!parsed.data.companyId) {
      return NextResponse.json({ error: "Missing companyId." }, { status: 400 });
    }

    const customer = await User.findOne({ _id: parsed.data.companyId, role: "customer" });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const gstEnabled = asBoolean(parsed.data.gstEnabled, false);
    const gstRate = normalizeGstRate(parsed.data.gstRate, 18);

    customer.set("partnerProfile.invoicingInformation.gstEnabled", gstEnabled);
    customer.set("partnerProfile.invoicingInformation.gstRate", gstRate);
    customer.set("partnerProfile.updatedAt", new Date());

    await customer.save();

    return NextResponse.json({
      message: "Company GST defaults saved to profile.",
      gstEnabled,
      gstRate,
    });
  }

  if (!parsed.data.invoiceId) {
    return NextResponse.json({ error: "Missing invoiceId." }, { status: 400 });
  }

  const invoiceDoc = await Invoice.findById(parsed.data.invoiceId);
  if (!invoiceDoc) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const currentEnterprise = normalizePartyDetails(
    invoiceDoc.enterpriseDetails,
    emptyPartyDetails,
  );
  const currentCluso = normalizePartyDetails(invoiceDoc.clusoDetails, emptyPartyDetails);
  const currentGstEnabled = asBoolean(invoiceDoc.gstEnabled, false);
  const currentGstRate = normalizeGstRate(invoiceDoc.gstRate, 18);

  invoiceDoc.enterpriseDetails = normalizePartyDetails(
    parsed.data.enterpriseDetails,
    currentEnterprise,
  );
  invoiceDoc.clusoDetails = normalizePartyDetails(
    parsed.data.clusoDetails,
    currentCluso,
  );
  invoiceDoc.gstEnabled = asBoolean(parsed.data.gstEnabled, currentGstEnabled);
  invoiceDoc.gstRate = normalizeGstRate(parsed.data.gstRate, currentGstRate);

  await invoiceDoc.save();

  return NextResponse.json({
    message: "Invoice details updated successfully.",
    invoice: normalizeInvoiceRecord(
      invoiceDoc.toObject() as unknown as Record<string, unknown>,
    ),
  });
}