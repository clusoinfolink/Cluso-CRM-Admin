import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import ClusoDetails from "@/lib/models/ClusoDetails";
import Invoice from "@/lib/models/Invoice";
import Service from "@/lib/models/Service";
import User from "@/lib/models/User";
import VerificationRequest from "@/lib/models/VerificationRequest";
import type {
  InvoiceCurrencyTotal,
  InvoiceLineItem,
  InvoicePaymentDetails,
  InvoicePaymentMethod,
  InvoicePaymentProof,
  InvoicePaymentStatus,
  InvoicePartyDetails,
  InvoiceRecord,
} from "@/lib/types";

const CLUSO_DETAILS_SLUG = "cluso-details";
const SUPPORTED_CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCIES);
const BILLING_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_PAYMENT_PROOF_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_DATA_URL_REGEX = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;
const RELATED_FILE_DATA_URL_REGEX =
  /^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,/i;
const SERVICE_COUNTRY_FIELD_KEY = "system_service_country";
const LEGACY_SERVICE_COUNTRY_FIELD_QUESTIONS = new Set([
  "country",
  "verification country",
  "service country",
  "select verification country for this service",
]);

const generateInvoiceSchema = z.object({
  action: z.literal("generate"),
  companyId: z.string().min(1),
  billingMonth: z.string().regex(BILLING_MONTH_REGEX).optional(),
  gstEnabled: z.boolean().optional(),
  gstRate: z.number().min(0).max(100).optional(),
  enterpriseDetails: z.unknown().optional(),
  clusoDetails: z.unknown().optional(),
  paymentDetails: z.unknown().optional(),
});

const updateInvoiceSchema = z.object({
  action: z.enum([
    "update-fields",
    "update-enterprise-defaults",
    "update-cluso-defaults",
    "update-company-gst-defaults",
    "update-payment-status",
  ]),
  invoiceId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  gstEnabled: z.boolean().optional(),
  gstRate: z.number().min(0).max(100).optional(),
  paymentStatus: z.enum(["unpaid", "submitted", "paid"]).optional(),
  paymentProof: z.unknown().optional(),
  clearPaymentProof: z.boolean().optional(),
  enterpriseDetails: z.unknown().optional(),
  clusoDetails: z.unknown().optional(),
  paymentDetails: z.unknown().optional(),
});

const emptyPartyDetails: InvoicePartyDetails = {
  companyName: "",
  loginEmail: "",
  gstin: "",
  cinRegistrationNumber: "",
  sacCode: "",
  ltuCode: "",
  address: "",
  invoiceEmail: "",
  billingSameAsCompany: true,
  billingAddress: "",
};

const emptyPaymentDetails: InvoicePaymentDetails = {
  upi: {
    upiId: "",
    qrCodeImageUrl: "",
  },
  wireTransfer: {
    accountHolderName: "",
    accountNumber: "",
    bankName: "",
    ifscCode: "",
    branchName: "",
    swiftCode: "",
    instructions: "",
  },
};

function normalizeInvoicePaymentStatus(
  value: unknown,
  fallback: InvoicePaymentStatus = "unpaid",
): InvoicePaymentStatus {
  if (value === "unpaid" || value === "submitted" || value === "paid") {
    return value;
  }

  return fallback;
}

function normalizeInvoicePaymentRelatedFile(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = asRecord(value);
  const fileData = asString(raw.fileData).trim();
  const fileName = asString(raw.fileName).trim();
  const fileMimeType = asString(raw.fileMimeType).trim().toLowerCase();
  const fileSizeRaw = Number(raw.fileSize);
  const uploadedAt = parseDateValue(raw.uploadedAt);
  const normalizedFileSize =
    Number.isFinite(fileSizeRaw) && fileSizeRaw > 0 ? Math.trunc(fileSizeRaw) : 0;

  if (
    !fileData ||
    !fileName ||
    !fileMimeType ||
    !uploadedAt ||
    !RELATED_FILE_DATA_URL_REGEX.test(fileData) ||
    normalizedFileSize <= 0 ||
    normalizedFileSize > MAX_PAYMENT_PROOF_FILE_SIZE_BYTES
  ) {
    return null;
  }

  return {
    fileData,
    fileName,
    fileMimeType,
    fileSize: normalizedFileSize,
    uploadedAt: uploadedAt.toISOString(),
  };
}

function normalizeInvoicePaymentProof(value: unknown): InvoicePaymentProof | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = asRecord(value);
  const methodRaw = asString(raw.method).trim();
  let method: InvoicePaymentMethod = "upi";
  if (methodRaw === "wireTransfer" || methodRaw === "adminUpload") {
    method = methodRaw;
  }
  const screenshotData = asString(raw.screenshotData).trim();
  const screenshotFileName = asString(raw.screenshotFileName).trim();
  const screenshotMimeType = asString(raw.screenshotMimeType).trim();
  const screenshotFileSize = Number(raw.screenshotFileSize);
  const uploadedAt = parseDateValue(raw.uploadedAt);
  const normalizedMimeType = screenshotMimeType.toLowerCase();
  const relatedFiles = Array.isArray(raw.relatedFiles)
    ? raw.relatedFiles
        .map((entry) => normalizeInvoicePaymentRelatedFile(entry))
        .filter(
          (
            entry,
          ): entry is NonNullable<ReturnType<typeof normalizeInvoicePaymentRelatedFile>> =>
            Boolean(entry),
        )
    : [];
  const normalizedFileSize =
    Number.isFinite(screenshotFileSize) && screenshotFileSize > 0
      ? Math.trunc(screenshotFileSize)
      : 0;

  if (
    !screenshotData ||
    !screenshotFileName ||
    !screenshotMimeType ||
    !uploadedAt ||
    !normalizedMimeType.startsWith("image/") ||
    !IMAGE_DATA_URL_REGEX.test(screenshotData) ||
    normalizedFileSize <= 0 ||
    normalizedFileSize > MAX_PAYMENT_PROOF_FILE_SIZE_BYTES
  ) {
    return null;
  }

  return {
    method,
    screenshotData,
    screenshotFileName,
    screenshotMimeType: normalizedMimeType,
    screenshotFileSize: normalizedFileSize,
    uploadedAt: uploadedAt.toISOString(),
    relatedFiles,
  };
}

type NormalizedServiceSelection = {
  serviceId: string;
  serviceName: string;
  price: number;
  currency: InvoiceLineItem["currency"];
  countryRates?: Array<{
    country: string;
    price: number;
    currency: InvoiceLineItem["currency"];
  }>;
};

type ServiceUsageSummary = {
  serviceId: string;
  serviceName: string;
  usageCount: number;
  price: number;
  currency: InvoiceLineItem["currency"];
};

type MonthlySummaryRow = {
  srNo: number;
  requestedAt: string;
  candidateName: string;
  userName: string;
  verifierName: string;
  requestStatus: string;
  serviceName: string;
  verificationOrigin: string;
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

type RequestServiceQuantityMaps = {
  byServiceId: Map<string, number>;
  byServiceName: Map<string, number>;
};

type PackageRateSelection = NormalizedServiceSelection & {
  includedServiceIds: string[];
};

type CollapsedPackageBillingServices = {
  billingServices: NormalizedServiceSelection[];
  selectedPackageServiceIds: Set<string>;
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

function parseDateValue(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

type ExtraPaymentApprovalStatus =
  | "not-requested"
  | "pending"
  | "approved"
  | "rejected";

function normalizeExtraPaymentApprovalStatus(
  value: unknown,
): ExtraPaymentApprovalStatus {
  const normalized = normalizeWhitespace(asString(value)).toLowerCase();
  if (
    normalized === "not-requested" ||
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "rejected"
  ) {
    return normalized;
  }

  return "not-requested";
}

function resolveBillableExtraPaymentAmount(attemptRecord: Record<string, unknown>) {
  const amountRaw = Number(attemptRecord.extraPaymentAmount);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    return 0;
  }

  const roundedAmount = roundMoney(amountRaw);
  const approvalRequested = asBoolean(
    attemptRecord.extraPaymentApprovalRequested,
    false,
  );

  if (approvalRequested) {
    const approvalStatus = normalizeExtraPaymentApprovalStatus(
      attemptRecord.extraPaymentApprovalStatus,
    );
    return approvalStatus === "approved" ? roundedAmount : 0;
  }

  return asBoolean(attemptRecord.extraPaymentDone, false) ? roundedAmount : 0;
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

function normalizeServiceLabel(value: string) {
  return normalizeWhitespace(value).replace(/\s+x\d+$/i, "");
}

function resolveVerificationOrigin(value: unknown) {
  const normalized = normalizeWhitespace(asString(value));
  return normalized || "-";
}

function normalizeCountryPricingRates(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{
      country: string;
      price: number;
      currency: InvoiceLineItem["currency"];
    }>;
  }

  const deduped = new Map<
    string,
    { country: string; price: number; currency: InvoiceLineItem["currency"] }
  >();

  for (const entry of value) {
    const raw = asRecord(entry);
    const country = normalizeWhitespace(asString(raw.country));
    const price = Number(raw.price);
    const currencyRaw = normalizeWhitespace(asString(raw.currency, "INR")).toUpperCase();
    const currency = SUPPORTED_CURRENCY_SET.has(currencyRaw)
      ? (currencyRaw as InvoiceLineItem["currency"])
      : "INR";

    if (!country || !Number.isFinite(price) || price < 0) {
      continue;
    }

    deduped.set(country.toLowerCase(), {
      country,
      price: roundMoney(price),
      currency,
    });
  }

  return [...deduped.values()];
}

function resolveCountryRateForOrigin(
  service: NormalizedServiceSelection | undefined,
  verificationOrigin: string,
) {
  if (!service || !service.countryRates || service.countryRates.length === 0) {
    return undefined;
  }

  const normalizedOrigin = normalizeWhitespace(verificationOrigin).toLowerCase();
  if (!normalizedOrigin || normalizedOrigin === "-") {
    return undefined;
  }

  return service.countryRates.find(
    (rate) => normalizeWhitespace(rate.country).toLowerCase() === normalizedOrigin,
  );
}

function buildServiceSelectionLookups(serviceSelections: unknown) {
  const byServiceId = new Map<string, NormalizedServiceSelection>();
  const byServiceName = new Map<string, NormalizedServiceSelection>();
  const normalizedSelections = normalizeServiceSelections(serviceSelections);

  for (const selection of normalizedSelections) {
    const serviceId = normalizeWhitespace(selection.serviceId);
    const serviceNameKey = normalizeWhitespace(selection.serviceName).toLowerCase();

    if (serviceId && !byServiceId.has(serviceId)) {
      byServiceId.set(serviceId, selection);
    }

    if (serviceNameKey && !byServiceName.has(serviceNameKey)) {
      byServiceName.set(serviceNameKey, selection);
    }
  }

  return { byServiceId, byServiceName };
}

function parseRepeatableValues(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item ?? ""));
    }
  } catch {
    // Keep backward compatibility for old non-JSON values.
  }

  return [rawValue];
}

function extractCountrySelectionsFromAnswers(answers: unknown) {
  if (!Array.isArray(answers)) {
    return [] as string[];
  }

  const countryAnswer = answers
    .map((entry) => asRecord(entry))
    .find((answer) => {
      const normalizedFieldKey = normalizeWhitespace(asString(answer.fieldKey)).toLowerCase();
      if (normalizedFieldKey === SERVICE_COUNTRY_FIELD_KEY) {
        return true;
      }

      const normalizedQuestion = normalizeWhitespace(asString(answer.question)).toLowerCase();
      return LEGACY_SERVICE_COUNTRY_FIELD_QUESTIONS.has(normalizedQuestion);
    });

  if (!countryAnswer || asBoolean(countryAnswer.notApplicable, false)) {
    return [] as string[];
  }

  const rawValue = asString(countryAnswer.value);
  const rawSelections = asBoolean(countryAnswer.repeatable, false)
    ? parseRepeatableValues(rawValue)
    : [rawValue];

  return rawSelections
    .map((entry) => normalizeWhitespace(String(entry ?? "")))
    .filter(Boolean);
}

function normalizeServiceEntryCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

function buildServiceCountrySelectionMaps(
  candidateFormResponses: unknown,
  fallbackCountry: string,
) {
  const byServiceId = new Map<string, string[]>();
  const byServiceName = new Map<string, string[]>();

  if (!Array.isArray(candidateFormResponses)) {
    return { byServiceId, byServiceName };
  }

  for (const responseEntry of candidateFormResponses) {
    const response = asRecord(responseEntry);
    const serviceId = normalizeWhitespace(toIdString(response.serviceId));
    const serviceNameKey = normalizeWhitespace(asString(response.serviceName)).toLowerCase();
    const entryCount = normalizeServiceEntryCount(response.serviceEntryCount);

    const selectedCountries = extractCountrySelectionsFromAnswers(response.answers);
    const fallbackSelections = fallbackCountry && fallbackCountry !== "-" ? [fallbackCountry] : [];
    const countries = selectedCountries.length > 0 ? selectedCountries : fallbackSelections;

    const normalizedCountries =
      countries.length > 0
        ? Array.from(
            { length: entryCount },
            (_unused, index) => countries[index] || countries[0],
          ).filter(Boolean)
        : [];

    if (serviceId && !byServiceId.has(serviceId)) {
      byServiceId.set(serviceId, normalizedCountries);
    }

    if (serviceNameKey && !byServiceName.has(serviceNameKey)) {
      byServiceName.set(serviceNameKey, normalizedCountries);
    }
  }

  return { byServiceId, byServiceName };
}

function resolveServiceVerificationOrigin(
  serviceId: string,
  serviceNameKey: string,
  serviceEntryIndex: number,
  countrySelections: {
    byServiceId: Map<string, string[]>;
    byServiceName: Map<string, string[]>;
  },
  fallbackCountry: string,
) {
  const selections =
    (serviceId ? countrySelections.byServiceId.get(serviceId) : undefined) ??
    countrySelections.byServiceName.get(serviceNameKey) ??
    [];

  const resolved = selections[serviceEntryIndex] || selections[0] || fallbackCountry;
  return resolved || "-";
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
    $or: [
      { "reportMetadata.customerSharedAt": { $gte: monthStart, $lt: monthEnd } },
      { "reportMetadata.generatedAt": { $gte: monthStart, $lt: monthEnd } },
    ],
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
  packageRates: PackageRateSelection[] = [],
  companyServiceSelections: unknown = [],
  companyAdminName = "",
) {
  const rows: MonthlySummaryRow[] = [];
  const totals = new Map<string, { subtotal: number; gstAmount: number; total: number }>();
  const normalizedRate = normalizeGstRate(gstRate, 18);

  const invoiceRatesByServiceId = new Map<string, InvoiceLineItem>();
  const invoiceRatesByServiceName = new Map<string, InvoiceLineItem>();
  const companyServiceLookups = buildServiceSelectionLookups(
    companyServiceSelections,
  );

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
    const currentSrNo = srNo;
    const requestRecord = asRecord(request);
    const reportMetadata = asRecord(requestRecord.reportMetadata);
    const candidateName = normalizeWhitespace(asString(request.candidateName)) || `Candidate ${srNo}`;
    const createdByRecord = asRecord(requestRecord.createdBy);
    const createdByDelegateRecord = asRecord(requestRecord.createdByDelegate);
    const createdByName = normalizeWhitespace(asString(createdByRecord.name));
    const delegateName = normalizeWhitespace(asString(createdByDelegateRecord.name));
    const userName =
      createdByName ||
      delegateName ||
      companyAdminName ||
      "-";
    const serviceVerifications = Array.isArray(requestRecord.serviceVerifications)
      ? requestRecord.serviceVerifications
      : [];
    let verifierName = "";
    let latestAttemptedAt = -1;

    for (const verification of serviceVerifications) {
      const verificationRecord = asRecord(verification);
      const attempts = Array.isArray(verificationRecord.attempts)
        ? verificationRecord.attempts
        : [];

      for (const attempt of attempts) {
        const attemptRecord = asRecord(attempt);
        const resolvedVerifierName =
          normalizeWhitespace(asString(attemptRecord.verifierName)) ||
          normalizeWhitespace(asString(attemptRecord.managerName));
        if (!resolvedVerifierName) {
          continue;
        }

        const attemptedAt = parseDateValue(attemptRecord.attemptedAt);
        const attemptedAtMs = attemptedAt ? attemptedAt.getTime() : -1;

        if (attemptedAtMs >= latestAttemptedAt) {
          latestAttemptedAt = attemptedAtMs;
          verifierName = resolvedVerifierName;
        }
      }
    }

    const requestStatus = normalizeWhitespace(asString(request.status)) || "pending";
    const requestCountryFallback = resolveVerificationOrigin(
      requestRecord.verificationCountry,
    );
    const serviceCountrySelections = buildServiceCountrySelectionMaps(
      requestRecord.candidateFormResponses,
      requestCountryFallback,
    );
    const { selectedServices: rawSelectedServices, usesInvoiceSnapshot } =
      getRequestBillingServiceSelections(requestRecord);
    const collapsedBillingServices = usesInvoiceSnapshot
      ? {
          billingServices: rawSelectedServices,
          selectedPackageServiceIds: new Set<string>(),
        }
      : collapsePackageBillingServices(rawSelectedServices, packageRates);
    const selectedServices = collapsedBillingServices.billingServices;
    const selectedPackageServiceIds =
      collapsedBillingServices.selectedPackageServiceIds;
    const serviceQuantities = buildRequestServiceQuantityMaps(requestRecord);
    const requestedDate =
      parseDateValue(requestRecord.createdAt) ??
      parseDateValue(reportMetadata.customerSharedAt) ??
      parseDateValue(reportMetadata.generatedAt);
    const requestedAt = requestedDate ? requestedDate.toISOString() : "";

    if (!requestedAt) {
      console.warn("[invoices][month-summary] Missing requested date for billable request", {
        requestId: toIdString(requestRecord._id),
        candidateName,
        billingCreatedAt: requestRecord.createdAt ?? null,
        customerSharedAt: reportMetadata.customerSharedAt ?? null,
        generatedAt: reportMetadata.generatedAt ?? null,
      });
    }

    const normalizedServices = selectedServices.length > 0
      ? selectedServices
      : [{ serviceId: "", serviceName: "Service Not Available", price: 0, currency: "INR" as InvoiceLineItem["currency"] }];

    const selectedServiceReference =
      rawSelectedServices.length > 0 ? rawSelectedServices : normalizedServices;
    const selectedServicesById = new Map<string, NormalizedServiceSelection>();
    const selectedServicesByName = new Map<string, NormalizedServiceSelection>();
    for (const selectedService of selectedServiceReference) {
      const normalizedServiceId = normalizeWhitespace(selectedService.serviceId);
      const normalizedServiceNameKey = normalizeWhitespace(
        selectedService.serviceName,
      ).toLowerCase();

      if (normalizedServiceId && !selectedServicesById.has(normalizedServiceId)) {
        selectedServicesById.set(normalizedServiceId, selectedService);
      }

      if (normalizedServiceNameKey && !selectedServicesByName.has(normalizedServiceNameKey)) {
        selectedServicesByName.set(normalizedServiceNameKey, selectedService);
      }
    }

    const requestServicesByCurrency = new Map<
      string,
      Map<string, { serviceName: string; verificationOrigin: string; subtotal: number }>
    >();

    for (const service of normalizedServices) {
      const serviceId = normalizeWhitespace(service.serviceId);
      const serviceNameKey = normalizeWhitespace(service.serviceName).toLowerCase();
      const matchedInvoiceRate =
        (serviceId ? invoiceRatesByServiceId.get(serviceId) : undefined) ??
        invoiceRatesByServiceName.get(serviceNameKey);
      const companyAssignedService =
        (serviceId ? companyServiceLookups.byServiceId.get(serviceId) : undefined) ??
        companyServiceLookups.byServiceName.get(serviceNameKey);
      const resolvedService = companyAssignedService ?? service;
      const usageCount =
        serviceId && selectedPackageServiceIds.has(serviceId)
          ? 1
          : resolveServiceUsageCount(service, serviceQuantities);
      const resolvedServiceName =
        normalizeServiceLabel(
          matchedInvoiceRate?.serviceName ?? resolvedService.serviceName ?? "Service Not Available",
        );

      for (let entryIndex = 0; entryIndex < usageCount; entryIndex += 1) {
        const verificationOrigin = resolveServiceVerificationOrigin(
          serviceId,
          serviceNameKey,
          entryIndex,
          serviceCountrySelections,
          requestCountryFallback,
        );
        const countryRate = resolveCountryRateForOrigin(
          resolvedService,
          verificationOrigin,
        );
        const currencyRaw = normalizeWhitespace(
          countryRate?.currency ??
            matchedInvoiceRate?.currency ??
            resolvedService.currency,
        ).toUpperCase();
        const currency = SUPPORTED_CURRENCY_SET.has(currencyRaw) ? currencyRaw : "INR";
        const unitPrice = roundMoney(
          countryRate?.price ?? matchedInvoiceRate?.price ?? resolvedService.price,
        );

        let currencyServices = requestServicesByCurrency.get(currency);
        if (!currencyServices) {
          currencyServices = new Map();
          requestServicesByCurrency.set(currency, currencyServices);
        }

        const serviceKey = `${serviceId || serviceNameKey || resolvedServiceName.toLowerCase()}::entry-${entryIndex + 1}::${verificationOrigin.toLowerCase()}`;
        const existingService = currencyServices.get(serviceKey);
        if (existingService) {
          existingService.subtotal = roundMoney(existingService.subtotal + unitPrice);
        } else {
          currencyServices.set(serviceKey, {
            serviceName: resolvedServiceName,
            verificationOrigin,
            subtotal: unitPrice,
          });
        }
      }
    }

    const verificationEntries = Array.isArray(requestRecord.serviceVerifications)
      ? requestRecord.serviceVerifications
      : [];

    for (const verificationEntry of verificationEntries) {
      const verificationRecord = asRecord(verificationEntry);
      const verificationServiceId = normalizeWhitespace(
        toIdString(verificationRecord.serviceId),
      );
      const verificationServiceName = normalizeWhitespace(
        asString(verificationRecord.serviceName),
      );
      const verificationServiceNameKey = verificationServiceName.toLowerCase();
      const verificationServiceEntryIndex = Math.max(
        1,
        Math.floor(Number(verificationRecord.serviceEntryIndex) || 1),
      );
      const attempts = Array.isArray(verificationRecord.attempts)
        ? verificationRecord.attempts
        : [];

      let extraChargesSubtotal = 0;
      for (const attemptEntry of attempts) {
        const attemptRecord = asRecord(attemptEntry);
        const billableExtraAmount = resolveBillableExtraPaymentAmount(
          attemptRecord,
        );
        if (billableExtraAmount <= 0) {
          continue;
        }

        extraChargesSubtotal = roundMoney(
          extraChargesSubtotal + billableExtraAmount,
        );
      }

      if (extraChargesSubtotal <= 0) {
        continue;
      }

      const selectedService =
        (verificationServiceId ? selectedServicesById.get(verificationServiceId) : undefined) ??
        selectedServicesByName.get(verificationServiceNameKey);
      const companyAssignedService =
        (verificationServiceId
          ? companyServiceLookups.byServiceId.get(verificationServiceId)
          : undefined) ??
        companyServiceLookups.byServiceName.get(verificationServiceNameKey);
      const resolvedService = selectedService ?? companyAssignedService;
      const matchedInvoiceRate =
        (verificationServiceId
          ? invoiceRatesByServiceId.get(verificationServiceId)
          : undefined) ?? invoiceRatesByServiceName.get(verificationServiceNameKey);

      const verificationOrigin = resolveServiceVerificationOrigin(
        verificationServiceId,
        verificationServiceNameKey,
        verificationServiceEntryIndex - 1,
        serviceCountrySelections,
        requestCountryFallback,
      );
      const countryRate = resolveCountryRateForOrigin(
        resolvedService,
        verificationOrigin,
      );

      const resolvedBaseServiceName =
        normalizeServiceLabel(
          matchedInvoiceRate?.serviceName ??
            resolvedService?.serviceName ??
            verificationServiceName,
        ) || "Service Not Available";
      const currencyRaw = normalizeWhitespace(
        (countryRate?.currency ??
          matchedInvoiceRate?.currency ??
          resolvedService?.currency ??
          "INR") as string,
      ).toUpperCase();
      const currency = SUPPORTED_CURRENCY_SET.has(currencyRaw) ? currencyRaw : "INR";

      let currencyServices = requestServicesByCurrency.get(currency);
      if (!currencyServices) {
        currencyServices = new Map();
        requestServicesByCurrency.set(currency, currencyServices);
      }

      const extraServiceKey =
        `${verificationServiceId || verificationServiceNameKey || resolvedBaseServiceName.toLowerCase()}::extra::entry-${verificationServiceEntryIndex}::${verificationOrigin.toLowerCase()}`;
      const existingExtraService = currencyServices.get(extraServiceKey);
      if (existingExtraService) {
        existingExtraService.subtotal = roundMoney(
          existingExtraService.subtotal + extraChargesSubtotal,
        );
      } else {
        currencyServices.set(extraServiceKey, {
          serviceName: `${resolvedBaseServiceName} (Extra Charges)`,
          verificationOrigin,
          subtotal: extraChargesSubtotal,
        });
      }
    }

    const sortedCurrencyEntries = [...requestServicesByCurrency.entries()].sort(
      ([firstCurrency], [secondCurrency]) => firstCurrency.localeCompare(secondCurrency),
    );

    for (const [currency, serviceEntries] of sortedCurrencyEntries) {
      const services = [...serviceEntries.values()].sort((first, second) =>
        first.serviceName.localeCompare(second.serviceName),
      );

      for (const serviceEntry of services) {
        const serviceName = serviceEntry.serviceName;
        const subtotal = roundMoney(serviceEntry.subtotal);
        const gstAmount = gstEnabled
          ? roundMoney((subtotal * normalizedRate) / 100)
          : 0;
        const total = roundMoney(subtotal + gstAmount);

        rows.push({
          srNo: currentSrNo,
          requestedAt,
          candidateName,
          userName,
          verifierName: verifierName || "-",
          requestStatus,
          serviceName,
          verificationOrigin: serviceEntry.verificationOrigin,
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
      }
    }

    if (sortedCurrencyEntries.length === 0) {
      rows.push({
        srNo: currentSrNo,
        requestedAt,
        candidateName,
        userName,
        verifierName: verifierName || "-",
        requestStatus,
        serviceName: "Service Not Available",
        verificationOrigin: requestCountryFallback,
        currency: "INR",
        subtotal: 0,
        gstAmount: 0,
        total: 0,
      });

      const existing = totals.get("INR") ?? { subtotal: 0, gstAmount: 0, total: 0 };
      totals.set("INR", existing);
    }

    srNo += 1;
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
    sacCode: normalizeWhitespace(asString(raw.sacCode, fallback.sacCode)),
    ltuCode: normalizeWhitespace(asString(raw.ltuCode, fallback.ltuCode)),
    address,
    invoiceEmail: normalizeWhitespace(
      asString(raw.invoiceEmail, fallback.invoiceEmail),
    ),
    billingSameAsCompany,
    billingAddress: billingSameAsCompany ? address : billingAddress,
  };
}

function normalizeInvoicePaymentDetails(
  value: unknown,
  fallback: InvoicePaymentDetails,
): InvoicePaymentDetails {
  const raw = asRecord(value);
  const upiRaw = asRecord(raw.upi);
  const wireTransferRaw = asRecord(raw.wireTransfer);

  return {
    upi: {
      upiId: normalizeWhitespace(asString(upiRaw.upiId, fallback.upi.upiId)),
      qrCodeImageUrl: normalizeWhitespace(
        asString(upiRaw.qrCodeImageUrl, fallback.upi.qrCodeImageUrl),
      ),
    },
    wireTransfer: {
      accountHolderName: normalizeWhitespace(
        asString(
          wireTransferRaw.accountHolderName,
          fallback.wireTransfer.accountHolderName,
        ),
      ),
      accountNumber: normalizeWhitespace(
        asString(wireTransferRaw.accountNumber, fallback.wireTransfer.accountNumber),
      ),
      bankName: normalizeWhitespace(
        asString(wireTransferRaw.bankName, fallback.wireTransfer.bankName),
      ),
      ifscCode: normalizeWhitespace(
        asString(wireTransferRaw.ifscCode, fallback.wireTransfer.ifscCode),
      ).toUpperCase(),
      branchName: normalizeWhitespace(
        asString(wireTransferRaw.branchName, fallback.wireTransfer.branchName),
      ),
      swiftCode: normalizeWhitespace(
        asString(wireTransferRaw.swiftCode, fallback.wireTransfer.swiftCode),
      ).toUpperCase(),
      instructions: normalizeWhitespace(
        asString(wireTransferRaw.instructions, fallback.wireTransfer.instructions),
      ),
    },
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
      const countryRates = normalizeCountryPricingRates(raw.countryRates);

      if (!serviceId || !serviceName) {
        return null;
      }

      return {
        serviceId,
        serviceName,
        price,
        currency,
        countryRates,
      } as NormalizedServiceSelection;
    })
    .filter((entry): entry is NormalizedServiceSelection => Boolean(entry));
}

async function resolvePackageRateSelections(
  customerServiceSelections: unknown,
): Promise<PackageRateSelection[]> {
  const normalizedSelections = normalizeServiceSelections(customerServiceSelections);
  if (normalizedSelections.length === 0) {
    return [];
  }

  const selectionById = new Map<string, NormalizedServiceSelection>();
  for (const selection of normalizedSelections) {
    const serviceId = normalizeWhitespace(selection.serviceId);
    if (serviceId && !selectionById.has(serviceId)) {
      selectionById.set(serviceId, selection);
    }
  }

  if (selectionById.size === 0) {
    return [];
  }

  const serviceDocs = await Service.find({ _id: { $in: [...selectionById.keys()] } })
    .select("_id isPackage includedServiceIds")
    .lean();

  const packageRates: PackageRateSelection[] = [];

  for (const doc of serviceDocs) {
    const serviceRecord = asRecord(doc);
    if (!asBoolean(serviceRecord.isPackage, false)) {
      continue;
    }

    const serviceId = toIdString(serviceRecord._id);
    if (!serviceId) {
      continue;
    }

    const selectedRate = selectionById.get(serviceId);
    if (!selectedRate) {
      continue;
    }

    const includedServiceIds = Array.isArray(serviceRecord.includedServiceIds)
      ? [
          ...new Set(
            serviceRecord.includedServiceIds
              .map((id) => toIdString(id))
              .filter((id) => id.length > 0),
          ),
        ]
      : [];

    if (includedServiceIds.length === 0) {
      continue;
    }

    packageRates.push({
      serviceId: selectedRate.serviceId,
      serviceName: selectedRate.serviceName,
      price: selectedRate.price,
      currency: selectedRate.currency,
      includedServiceIds,
    });
  }

  return packageRates.sort((first, second) => {
    const includedSizeDiff =
      second.includedServiceIds.length - first.includedServiceIds.length;
    if (includedSizeDiff !== 0) {
      return includedSizeDiff;
    }

    return first.serviceName.localeCompare(second.serviceName);
  });
}

function collapsePackageBillingServices(
  selectedServices: NormalizedServiceSelection[],
  packageRates: PackageRateSelection[],
): CollapsedPackageBillingServices {
  if (selectedServices.length === 0 || packageRates.length === 0) {
    return {
      billingServices: selectedServices,
      selectedPackageServiceIds: new Set<string>(),
    };
  }

  const selectedServiceIds = new Set(
    selectedServices
      .map((service) => normalizeWhitespace(service.serviceId))
      .filter((serviceId) => serviceId.length > 0),
  );
  const selectedPackageServiceIds = new Set<string>();
  const coveredServiceIds = new Set<string>();
  const selectedPackageRateById = new Map<string, PackageRateSelection>();

  for (const packageRate of packageRates) {
    const packageServiceId = normalizeWhitespace(packageRate.serviceId);
    if (!packageServiceId || selectedPackageServiceIds.has(packageServiceId)) {
      continue;
    }

    const includedServiceIds = [
      ...new Set(
        packageRate.includedServiceIds
          .map((serviceId) => normalizeWhitespace(serviceId))
          .filter((serviceId) => serviceId.length > 0),
      ),
    ];
    if (includedServiceIds.length === 0) {
      continue;
    }

    const hasAllIncludedServices = includedServiceIds.every((serviceId) =>
      selectedServiceIds.has(serviceId),
    );
    if (!hasAllIncludedServices) {
      continue;
    }

    const overlapsCoveredServices = includedServiceIds.some((serviceId) =>
      coveredServiceIds.has(serviceId),
    );
    if (overlapsCoveredServices) {
      continue;
    }

    selectedPackageServiceIds.add(packageServiceId);
    selectedPackageRateById.set(packageServiceId, packageRate);
    for (const serviceId of includedServiceIds) {
      coveredServiceIds.add(serviceId);
    }
  }

  if (selectedPackageServiceIds.size === 0) {
    return {
      billingServices: selectedServices,
      selectedPackageServiceIds,
    };
  }

  const billingServices = selectedServices.filter((service) => {
    const serviceId = normalizeWhitespace(service.serviceId);
    if (!serviceId) {
      return true;
    }

    if (selectedPackageServiceIds.has(serviceId)) {
      return true;
    }

    return !coveredServiceIds.has(serviceId);
  });

  for (const packageServiceId of selectedPackageServiceIds) {
    const selectedPackageRate = selectedPackageRateById.get(packageServiceId);
    if (!selectedPackageRate) {
      continue;
    }

    const alreadyPresent = billingServices.some(
      (service) => normalizeWhitespace(service.serviceId) === packageServiceId,
    );
    if (alreadyPresent) {
      continue;
    }

    billingServices.push({
      serviceId: selectedPackageRate.serviceId,
      serviceName: selectedPackageRate.serviceName,
      price: selectedPackageRate.price,
      currency: selectedPackageRate.currency,
    });
  }

  return {
    billingServices,
    selectedPackageServiceIds,
  };
}

function normalizeServiceUsageCount(value: unknown) {
  const usageCount = Number(value);
  if (!Number.isFinite(usageCount) || usageCount <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(usageCount));
}

function buildRequestServiceQuantityMaps(
  request: Record<string, unknown>,
): RequestServiceQuantityMaps {
  const byServiceId = new Map<string, number>();
  const byServiceName = new Map<string, number>();
  const candidateFormResponses = Array.isArray(request.candidateFormResponses)
    ? request.candidateFormResponses
    : [];

  for (const response of candidateFormResponses) {
    const rawResponse = asRecord(response);
    const serviceId = toIdString(rawResponse.serviceId);
    const serviceNameKey = normalizeWhitespace(
      asString(rawResponse.serviceName),
    ).toLowerCase();
    const usageCount = normalizeServiceUsageCount(rawResponse.serviceEntryCount);

    if (serviceId) {
      const existing = byServiceId.get(serviceId) ?? 0;
      byServiceId.set(serviceId, Math.max(existing, usageCount));
    }

    if (serviceNameKey) {
      const existing = byServiceName.get(serviceNameKey) ?? 0;
      byServiceName.set(serviceNameKey, Math.max(existing, usageCount));
    }
  }

  return { byServiceId, byServiceName };
}

function resolveServiceUsageCount(
  service: NormalizedServiceSelection,
  quantities: RequestServiceQuantityMaps,
) {
  const serviceId = normalizeWhitespace(service.serviceId);
  const serviceNameKey = normalizeWhitespace(service.serviceName).toLowerCase();
  const usageCount =
    (serviceId ? quantities.byServiceId.get(serviceId) : undefined) ??
    quantities.byServiceName.get(serviceNameKey) ??
    1;

  return normalizeServiceUsageCount(usageCount);
}

function buildMonthlyInvoiceLineItems(
  monthlyRequests: Array<Record<string, unknown>>,
  packageRates: PackageRateSelection[] = [],
  companyServiceSelections: unknown = [],
): InvoiceLineItem[] {
  const usageByService = new Map<string, ServiceUsageSummary>();
  const extraChargesByService = new Map<
    string,
    {
      serviceId: string;
      serviceName: string;
      extraAmount: number;
      fallbackCurrency: InvoiceLineItem["currency"];
    }
  >();
  const companyServiceLookups = buildServiceSelectionLookups(
    companyServiceSelections,
  );

  for (const request of monthlyRequests) {
    const requestRecord = asRecord(request);
    const requestCountryFallback = resolveVerificationOrigin(
      requestRecord.verificationCountry,
    );
    const serviceCountrySelections = buildServiceCountrySelectionMaps(
      requestRecord.candidateFormResponses,
      requestCountryFallback,
    );
    const { selectedServices: rawSelectedServices, usesInvoiceSnapshot } =
      getRequestBillingServiceSelections(requestRecord);
    const collapsedBillingServices = usesInvoiceSnapshot
      ? {
          billingServices: rawSelectedServices,
          selectedPackageServiceIds: new Set<string>(),
        }
      : collapsePackageBillingServices(rawSelectedServices, packageRates);
    const selectedServices = collapsedBillingServices.billingServices;
    const selectedPackageServiceIds =
      collapsedBillingServices.selectedPackageServiceIds;
    const serviceQuantities = buildRequestServiceQuantityMaps(requestRecord);
    const selectedServiceReference =
      rawSelectedServices.length > 0 ? rawSelectedServices : selectedServices;
    const selectedServicesById = new Map<string, NormalizedServiceSelection>();
    const selectedServicesByName = new Map<string, NormalizedServiceSelection>();

    for (const selectedService of selectedServiceReference) {
      const selectedServiceId = normalizeWhitespace(selectedService.serviceId);
      const selectedServiceNameKey = normalizeWhitespace(
        selectedService.serviceName,
      ).toLowerCase();

      if (selectedServiceId && !selectedServicesById.has(selectedServiceId)) {
        selectedServicesById.set(selectedServiceId, selectedService);
      }

      if (selectedServiceNameKey && !selectedServicesByName.has(selectedServiceNameKey)) {
        selectedServicesByName.set(selectedServiceNameKey, selectedService);
      }
    }

    for (const service of selectedServices) {
      const normalizedServiceId = normalizeWhitespace(service.serviceId);
      const normalizedServiceName = normalizeWhitespace(service.serviceName);
      const normalizedServiceNameKey = normalizedServiceName.toLowerCase();
      const companyAssignedService =
        (normalizedServiceId
          ? companyServiceLookups.byServiceId.get(normalizedServiceId)
          : undefined) ??
        companyServiceLookups.byServiceName.get(normalizedServiceNameKey);
      const resolvedService = companyAssignedService ?? service;
      const keyBase =
        normalizeWhitespace(resolvedService.serviceId) ||
        normalizedServiceId ||
        normalizedServiceNameKey ||
        "service";
      const usageCount =
        normalizedServiceId && selectedPackageServiceIds.has(normalizedServiceId)
          ? 1
          : resolveServiceUsageCount(service, serviceQuantities);

      for (let entryIndex = 0; entryIndex < usageCount; entryIndex += 1) {
        const verificationOrigin = resolveServiceVerificationOrigin(
          normalizedServiceId,
          normalizedServiceNameKey,
          entryIndex,
          serviceCountrySelections,
          requestCountryFallback,
        );
        const countryRate = resolveCountryRateForOrigin(
          resolvedService,
          verificationOrigin,
        );
        const currencyRaw = normalizeWhitespace(
          (countryRate?.currency ?? resolvedService.currency ?? "INR") as string,
        ).toUpperCase();
        const currency = SUPPORTED_CURRENCY_SET.has(currencyRaw)
          ? (currencyRaw as InvoiceLineItem["currency"])
          : "INR";
        const price = roundMoney(countryRate?.price ?? resolvedService.price);
        const key = `${keyBase}::${currency}::${price}`;
        const existing = usageByService.get(key);

        if (existing) {
          existing.usageCount += 1;
          continue;
        }

        usageByService.set(key, {
          serviceId: resolvedService.serviceId,
          serviceName:
            normalizeWhitespace(resolvedService.serviceName) ||
            normalizedServiceName ||
            "Service Not Available",
          usageCount: 1,
          price,
          currency,
        });
      }
    }

    const serviceVerifications = Array.isArray(requestRecord.serviceVerifications)
      ? requestRecord.serviceVerifications
      : [];

    for (const verificationEntry of serviceVerifications) {
      const verificationRecord = asRecord(verificationEntry);
      const verificationServiceId = normalizeWhitespace(
        toIdString(verificationRecord.serviceId),
      );
      const verificationServiceName = normalizeWhitespace(
        asString(verificationRecord.serviceName),
      );
      const verificationServiceNameKey = verificationServiceName.toLowerCase();
      const verificationServiceEntryIndex = Math.max(
        1,
        Math.floor(Number(verificationRecord.serviceEntryIndex) || 1),
      );
      const attempts = Array.isArray(verificationRecord.attempts)
        ? verificationRecord.attempts
        : [];

      let extraAmount = 0;
      for (const attemptEntry of attempts) {
        const attemptRecord = asRecord(attemptEntry);
        const billableExtraAmount = resolveBillableExtraPaymentAmount(
          attemptRecord,
        );
        if (billableExtraAmount <= 0) {
          continue;
        }

        extraAmount = roundMoney(extraAmount + billableExtraAmount);
      }

      if (extraAmount <= 0) {
        continue;
      }

      const selectedService =
        (verificationServiceId ? selectedServicesById.get(verificationServiceId) : undefined) ??
        selectedServicesByName.get(verificationServiceNameKey);
      const companyAssignedService =
        (verificationServiceId
          ? companyServiceLookups.byServiceId.get(verificationServiceId)
          : undefined) ??
        companyServiceLookups.byServiceName.get(verificationServiceNameKey);
      const resolvedService = selectedService ?? companyAssignedService;
      const verificationOrigin = resolveServiceVerificationOrigin(
        verificationServiceId,
        verificationServiceNameKey,
        verificationServiceEntryIndex - 1,
        serviceCountrySelections,
        requestCountryFallback,
      );
      const countryRate = resolveCountryRateForOrigin(
        resolvedService,
        verificationOrigin,
      );

      const resolvedServiceName =
        normalizeWhitespace(
          resolvedService?.serviceName || verificationServiceName,
        ) || "Service Not Available";
      const fallbackCurrencyRaw = normalizeWhitespace(
        (countryRate?.currency ?? resolvedService?.currency ?? "INR") as string,
      ).toUpperCase();
      const fallbackCurrency = SUPPORTED_CURRENCY_SET.has(fallbackCurrencyRaw)
        ? (fallbackCurrencyRaw as InvoiceLineItem["currency"])
        : "INR";

      const extraKey =
        verificationServiceId || verificationServiceNameKey || resolvedServiceName.toLowerCase();
      const existingExtraCharge = extraChargesByService.get(extraKey);
      if (existingExtraCharge) {
        existingExtraCharge.extraAmount = roundMoney(
          existingExtraCharge.extraAmount + extraAmount,
        );
      } else {
        extraChargesByService.set(extraKey, {
          serviceId: verificationServiceId,
          serviceName: resolvedServiceName,
          extraAmount,
          fallbackCurrency,
        });
      }
    }
  }

  const usageLineItems = [...usageByService.values()]
    .map((usage) => {
      const price = roundMoney(usage.price);
      const currency = usage.currency;
      const serviceName = usage.serviceName;
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
    .filter((lineItem) => lineItem.usageCount > 0);

  const extraChargeLineItems = [...extraChargesByService.values()]
    .map((extraCharge) => {
      const resolvedServiceName =
        normalizeWhitespace(extraCharge.serviceName) || "Service Not Available";
      const currencyRaw = normalizeWhitespace(
        (extraCharge.fallbackCurrency ?? "INR") as string,
      ).toUpperCase();
      const currency = SUPPORTED_CURRENCY_SET.has(currencyRaw)
        ? (currencyRaw as InvoiceLineItem["currency"])
        : "INR";
      const amount = roundMoney(extraCharge.extraAmount);
      const idSeed =
        normalizeWhitespace(extraCharge.serviceId) ||
        resolvedServiceName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") ||
        "extra-service";

      return {
        serviceId: `${idSeed}::extra`,
        serviceName: `${resolvedServiceName} (Extra Charges)`,
        usageCount: 1,
        price: amount,
        lineTotal: amount,
        currency,
      } as InvoiceLineItem;
    })
    .filter((lineItem) => lineItem.lineTotal > 0);

  return [...usageLineItems, ...extraChargeLineItems].sort((first, second) =>
    first.serviceName.localeCompare(second.serviceName),
  );
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
    sacCode: "",
    ltuCode: "",
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
    sacCode: normalizeWhitespace(asString(companyInformation.sacCode)),
    ltuCode: normalizeWhitespace(asString(companyInformation.ltuCode)),
    address: companyAddress,
    invoiceEmail: normalizeWhitespace(asString(invoicingInformation.invoiceEmail)),
    billingSameAsCompany,
    billingAddress: billingSameAsCompany ? companyAddress : explicitBillingAddress,
  };
}

function buildClusoPaymentDefaults(profile: unknown): InvoicePaymentDetails {
  const root = asRecord(profile);
  const invoicingInformation = asRecord(root.invoicingInformation);
  const paymentMethods = asRecord(invoicingInformation.paymentMethods);
  const wireTransfer = asRecord(paymentMethods.wireTransfer);

  return {
    upi: {
      upiId: normalizeWhitespace(asString(paymentMethods.upiId)),
      qrCodeImageUrl: normalizeWhitespace(
        asString(paymentMethods.upiQrCodeImageUrl),
      ),
    },
    wireTransfer: {
      accountHolderName: normalizeWhitespace(
        asString(wireTransfer.accountHolderName),
      ),
      accountNumber: normalizeWhitespace(asString(wireTransfer.accountNumber)),
      bankName: normalizeWhitespace(asString(wireTransfer.bankName)),
      ifscCode: normalizeWhitespace(asString(wireTransfer.ifscCode)).toUpperCase(),
      branchName: normalizeWhitespace(asString(wireTransfer.branchName)),
      swiftCode: normalizeWhitespace(asString(wireTransfer.swiftCode)).toUpperCase(),
      instructions: normalizeWhitespace(asString(wireTransfer.instructions)),
    },
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
    paymentDetails: normalizeInvoicePaymentDetails(
      doc.paymentDetails,
      emptyPaymentDetails,
    ),
    paymentStatus: normalizeInvoicePaymentStatus(doc.paymentStatus, "unpaid"),
    paymentProof: normalizeInvoicePaymentProof(doc.paymentProof),
    paidAt: parseDateValue(doc.paidAt)?.toISOString() ?? "",
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

function formatInvoiceMonthToken(billingMonth: string) {
  const [yearText, monthText] = billingMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const monthTokens = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return normalizeWhitespace(billingMonth).replace("-", "").toUpperCase();
  }

  return `${monthTokens[month - 1]}${year}`;
}

function buildSequenceInvoiceNumber(sequence: number, billingMonth: string) {
  const normalizedSequence = Math.max(1, Math.trunc(sequence));
  const sequenceText = String(normalizedSequence).padStart(3, "0");
  return `${sequenceText}/${formatInvoiceMonthToken(billingMonth)}`;
}

async function createUniqueInvoiceNumber(billingMonth: string) {
  const monthToken = formatInvoiceMonthToken(billingMonth);
  const expectedSuffix = `/${monthToken}`;
  const monthInvoices = await Invoice.find({ billingMonth })
    .select("invoiceNumber")
    .lean();

  let highestExistingSequence = 0;

  for (const invoice of monthInvoices) {
    const invoiceRecord = asRecord(invoice);
    const rawInvoiceNumber = normalizeWhitespace(asString(invoiceRecord.invoiceNumber));
    if (!rawInvoiceNumber.endsWith(expectedSuffix)) {
      continue;
    }

    const [sequenceText, suffix] = rawInvoiceNumber.split("/");
    if (suffix !== monthToken) {
      continue;
    }

    const sequenceNumber = Number.parseInt(sequenceText, 10);
    if (Number.isFinite(sequenceNumber) && sequenceNumber > highestExistingSequence) {
      highestExistingSequence = sequenceNumber;
    }
  }

  const nextSequence = Math.max(highestExistingSequence, monthInvoices.length) + 1;
  return buildSequenceInvoiceNumber(nextSequence, billingMonth);
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
        .select("candidateName status verificationCountry createdBy createdByDelegate selectedServices invoiceSnapshot serviceVerifications.serviceId serviceVerifications.serviceName serviceVerifications.serviceEntryIndex serviceVerifications.attempts.verifierName serviceVerifications.attempts.managerName serviceVerifications.attempts.attemptedAt serviceVerifications.attempts.extraPaymentDone serviceVerifications.attempts.extraPaymentAmount serviceVerifications.attempts.extraPaymentApprovalRequested serviceVerifications.attempts.extraPaymentApprovalStatus candidateFormResponses.serviceId candidateFormResponses.serviceName candidateFormResponses.serviceEntryCount candidateFormResponses.answers.fieldKey candidateFormResponses.answers.question candidateFormResponses.answers.value candidateFormResponses.answers.repeatable candidateFormResponses.answers.notApplicable createdAt reportMetadata.customerSharedAt reportMetadata.generatedAt")
        .populate({ path: "createdBy", select: "name" })
        .populate({ path: "createdByDelegate", select: "name" })
        .lean(),
    ]);

    if (!customer) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const packageRates = await resolvePackageRateSelections(
      customer.selectedServices ?? [],
    );

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
    const invoiceLineItems = monthInvoice
      ? normalizeInvoiceLineItems((monthInvoice as Record<string, unknown>).lineItems)
      : [];

    const { rows, totalsByCurrency } = buildMonthlySummaryRows(
      requests as unknown as Array<Record<string, unknown>>,
      gstEnabled,
      gstRate,
      invoiceLineItems,
      packageRates,
      customer.selectedServices ?? [],
      normalizeWhitespace(asString(customer.name)),
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
    clusoDefaultPaymentDetails: buildClusoPaymentDefaults(clusoDoc?.profile),
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

  const packageRates = await resolvePackageRateSelections(
    customer.selectedServices ?? [],
  );

  const billingMonth =
    normalizeBillingMonth(parsed.data.billingMonth) || getCurrentBillingMonth();
  const { monthStart, monthEnd } = getBillingMonthRange(billingMonth);

  const monthlyRequests = await VerificationRequest.find(
    buildBillableRequestFilter(parsed.data.companyId, monthStart, monthEnd),
  )
    .select("selectedServices invoiceSnapshot verificationCountry serviceVerifications.serviceId serviceVerifications.serviceName serviceVerifications.serviceEntryIndex serviceVerifications.attempts.extraPaymentDone serviceVerifications.attempts.extraPaymentAmount serviceVerifications.attempts.extraPaymentApprovalRequested serviceVerifications.attempts.extraPaymentApprovalStatus candidateFormResponses.serviceId candidateFormResponses.serviceName candidateFormResponses.serviceEntryCount candidateFormResponses.answers.fieldKey candidateFormResponses.answers.question candidateFormResponses.answers.value candidateFormResponses.answers.repeatable candidateFormResponses.answers.notApplicable")
    .lean();

  const lineItems = buildMonthlyInvoiceLineItems(
    monthlyRequests as unknown as Array<Record<string, unknown>>,
    packageRates,
    customer.selectedServices ?? [],
  );
  if (lineItems.length === 0) {
    const monthLabel = formatBillingMonthLabel(billingMonth);
    return NextResponse.json(
      {
        error: `No billable service usage found for ${monthLabel}. Only requests with reports generated or shared in this month are invoiced.`,
      },
      { status: 400 },
    );
  }

  const enterpriseDefaults = buildEnterpriseDefaults(customer);
  const clusoDefaults = buildClusoDefaults(clusoDoc?.profile);
  const clusoPaymentDefaults = buildClusoPaymentDefaults(clusoDoc?.profile);

  const enterpriseDetails = normalizePartyDetails(
    parsed.data.enterpriseDetails,
    enterpriseDefaults,
  );
  const clusoDetails = normalizePartyDetails(parsed.data.clusoDetails, clusoDefaults);
  const paymentDetails = normalizeInvoicePaymentDetails(
    parsed.data.paymentDetails,
    clusoPaymentDefaults,
  );
  const enterpriseGstDefaults = buildEnterpriseGstDefaults(customer);
  const gstEnabled = asBoolean(parsed.data.gstEnabled, enterpriseGstDefaults.gstEnabled);
  const gstRate = normalizeGstRate(parsed.data.gstRate, enterpriseGstDefaults.gstRate);

  const totalsByCurrency = computeTotalsByCurrency(lineItems);

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

  const invoiceNumber = await createUniqueInvoiceNumber(billingMonth);

  const created = await Invoice.create({
    invoiceNumber,
    billingMonth,
    customer: parsed.data.companyId,
    customerName: customer.name ?? "",
    customerEmail: customer.email ?? "",
    enterpriseDetails,
    clusoDetails,
    paymentDetails,
    paymentStatus: "unpaid",
    paymentProof: null,
    paidAt: null,
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
    const currentPaymentDefaults = buildClusoPaymentDefaults(clusoDoc.profile);
    const paymentDetails = normalizeInvoicePaymentDetails(
      parsed.data.paymentDetails,
      currentPaymentDefaults,
    );

    clusoDoc.set("profile.companyInformation.companyName", clusoDetails.companyName);
    clusoDoc.set("profile.companyInformation.gstin", clusoDetails.gstin);
    clusoDoc.set(
      "profile.companyInformation.cinRegistrationNumber",
      clusoDetails.cinRegistrationNumber,
    );
    clusoDoc.set("profile.companyInformation.sacCode", clusoDetails.sacCode);
    clusoDoc.set("profile.companyInformation.ltuCode", clusoDetails.ltuCode);
    setAddressFromText(clusoDoc, "profile.companyInformation.address", clusoDetails.address);

    clusoDoc.set(
      "profile.invoicingInformation.billingSameAsCompany",
      clusoDetails.billingSameAsCompany,
    );
    clusoDoc.set(
      "profile.invoicingInformation.invoiceEmail",
      normalizeEmail(clusoDetails.invoiceEmail),
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.upiId",
      paymentDetails.upi.upiId,
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.upiQrCodeImageUrl",
      paymentDetails.upi.qrCodeImageUrl,
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.wireTransfer.accountHolderName",
      paymentDetails.wireTransfer.accountHolderName,
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.wireTransfer.accountNumber",
      paymentDetails.wireTransfer.accountNumber,
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.wireTransfer.bankName",
      paymentDetails.wireTransfer.bankName,
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.wireTransfer.ifscCode",
      paymentDetails.wireTransfer.ifscCode,
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.wireTransfer.branchName",
      paymentDetails.wireTransfer.branchName,
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.wireTransfer.swiftCode",
      paymentDetails.wireTransfer.swiftCode,
    );
    clusoDoc.set(
      "profile.invoicingInformation.paymentMethods.wireTransfer.instructions",
      paymentDetails.wireTransfer.instructions,
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

  if (parsed.data.action === "update-payment-status") {
    if (!parsed.data.invoiceId) {
      return NextResponse.json({ error: "Missing invoiceId." }, { status: 400 });
    }

    const invoiceDoc = await Invoice.findById(parsed.data.invoiceId);
    if (!invoiceDoc) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const nextStatus = normalizeInvoicePaymentStatus(
      parsed.data.paymentStatus,
      normalizeInvoicePaymentStatus(invoiceDoc.paymentStatus, "unpaid"),
    );
    const nextPaymentProof = normalizeInvoicePaymentProof(parsed.data.paymentProof);
    const clearPaymentProof = asBoolean(parsed.data.clearPaymentProof, false);

    invoiceDoc.paymentStatus = nextStatus;
    if (clearPaymentProof) {
      invoiceDoc.paymentProof = null;
    } else if (nextPaymentProof) {
      invoiceDoc.set("paymentProof", {
        ...nextPaymentProof,
        uploadedAt: new Date(nextPaymentProof.uploadedAt),
        relatedFiles: nextPaymentProof.relatedFiles.map((entry) => ({
          fileData: entry.fileData,
          fileName: entry.fileName,
          fileMimeType: entry.fileMimeType,
          fileSize: entry.fileSize,
          uploadedAt: new Date(entry.uploadedAt),
        })),
      });
    }

    if (nextStatus === "paid") {
      invoiceDoc.paidAt = new Date();
    } else {
      invoiceDoc.paidAt = null;
    }

    await invoiceDoc.save();

    let responseMessage =
      nextStatus === "paid"
        ? nextPaymentProof
          ? "Invoice marked as paid and payment document uploaded."
          : "Invoice marked as paid."
        : nextStatus === "submitted"
          ? "Invoice moved to payment submitted state."
          : "Invoice marked as unpaid.";

    if (clearPaymentProof) {
      responseMessage =
        nextStatus === "paid"
          ? "Invoice kept as paid and uploaded payment file removed."
          : "Uploaded payment file removed.";
    }

    return NextResponse.json({
      message: responseMessage,
      invoice: normalizeInvoiceRecord(
        invoiceDoc.toObject() as unknown as Record<string, unknown>,
      ),
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
  const currentPaymentDetails = normalizeInvoicePaymentDetails(
    invoiceDoc.paymentDetails,
    emptyPaymentDetails,
  );
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
  invoiceDoc.paymentDetails = normalizeInvoicePaymentDetails(
    parsed.data.paymentDetails,
    currentPaymentDetails,
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

function getRequestBillingServiceSelections(request: Record<string, unknown>) {
  const snapshot = asRecord(request.invoiceSnapshot);
  const snapshotServices = normalizeServiceSelections(snapshot.items);

  if (snapshotServices.length > 0) {
    return {
      selectedServices: snapshotServices,
      usesInvoiceSnapshot: true,
    };
  }

  return {
    selectedServices: normalizeServiceSelections(request.selectedServices),
    usesInvoiceSnapshot: false,
  };
}