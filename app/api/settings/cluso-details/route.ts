import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthFromCookies, getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import ClusoDetails from "@/lib/models/ClusoDetails";
import type { CompanyPartnerProfile } from "@/lib/types";

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 5;
const CLUSO_DETAILS_SLUG = "cluso-details";

function asString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value;
}

function normalizeAddress(
  value: unknown,
): CompanyPartnerProfile["companyInformation"]["address"] {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    line1: asString(raw.line1),
    line2: asString(raw.line2),
    city: asString(raw.city),
    state: asString(raw.state),
    postalCode: asString(raw.postalCode),
    country: asString(raw.country),
  };
}

function normalizePhone(
  value: unknown,
): CompanyPartnerProfile["primaryContactInformation"]["mobilePhone"] {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    countryCode: asString(raw.countryCode, "India (+91)"),
    number: asString(raw.number),
  };
}

function normalizeDocuments(
  value: unknown,
): CompanyPartnerProfile["companyInformation"]["documents"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const raw =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : null;
      if (!raw) {
        return null;
      }

      const fileName = asString(raw.fileName).trim();
      const fileType = asString(raw.fileType).trim();
      const fileSize =
        typeof raw.fileSize === "number" && Number.isFinite(raw.fileSize)
          ? Math.max(0, Math.trunc(raw.fileSize))
          : 0;

      if (
        !fileName ||
        !fileType ||
        fileSize <= 0 ||
        fileSize > MAX_DOCUMENT_SIZE_BYTES
      ) {
        return null;
      }

      return { fileName, fileType, fileSize };
    })
    .filter(
      (
        entry,
      ): entry is CompanyPartnerProfile["companyInformation"]["documents"][number] =>
        Boolean(entry),
    )
    .slice(0, MAX_DOCUMENTS);
}

function normalizePaymentMethods(
  value: unknown,
): NonNullable<CompanyPartnerProfile["invoicingInformation"]["paymentMethods"]> {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const wireTransferRaw =
    raw.wireTransfer && typeof raw.wireTransfer === "object"
      ? (raw.wireTransfer as Record<string, unknown>)
      : {};

  return {
    upiId: asString(raw.upiId),
    upiQrCodeImageUrl: asString(raw.upiQrCodeImageUrl),
    wireTransfer: {
      accountHolderName: asString(wireTransferRaw.accountHolderName),
      accountNumber: asString(wireTransferRaw.accountNumber),
      bankName: asString(wireTransferRaw.bankName),
      ifscCode: asString(wireTransferRaw.ifscCode),
      branchName: asString(wireTransferRaw.branchName),
      swiftCode: asString(wireTransferRaw.swiftCode),
      instructions: asString(wireTransferRaw.instructions),
    },
  };
}

function normalizePartnerProfile(value: unknown): CompanyPartnerProfile {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const companyInformation =
    raw.companyInformation && typeof raw.companyInformation === "object"
      ? (raw.companyInformation as Record<string, unknown>)
      : {};
  const invoicingInformation =
    raw.invoicingInformation && typeof raw.invoicingInformation === "object"
      ? (raw.invoicingInformation as Record<string, unknown>)
      : {};
  const primaryContactInformation =
    raw.primaryContactInformation &&
    typeof raw.primaryContactInformation === "object"
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
      sacCode: asString(companyInformation.sacCode),
      ltuCode: asString(companyInformation.ltuCode),
      address: normalizeAddress(companyInformation.address),
      documents: normalizeDocuments(companyInformation.documents),
    },
    invoicingInformation: {
      billingSameAsCompany: Boolean(invoicingInformation.billingSameAsCompany),
      invoiceEmail: asString(invoicingInformation.invoiceEmail),
      address: normalizeAddress(invoicingInformation.address),
      paymentMethods: normalizePaymentMethods(invoicingInformation.paymentMethods),
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
      yearlyBackgroundsExpected: asString(
        additionalQuestions.yearlyBackgroundsExpected,
      ),
      promoCode: asString(additionalQuestions.promoCode),
      primaryIndustry: asString(additionalQuestions.primaryIndustry),
    },
    updatedAt,
  };
}

function ensureSuperAdmin(auth: { role: string } | null): NextResponse<{ error: string }> | null {
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.role !== "superadmin") {
    return NextResponse.json(
      { error: "Only superadmin can manage Cluso company details." },
      { status: 403 },
    );
  }

  return null;
}

export async function GET() {
  const auth = await getAdminAuthFromCookies();
  const accessError = ensureSuperAdmin(auth);
  if (accessError) {
    return accessError;
  }

  await connectMongo();

  const detailsDoc = await ClusoDetails.findOne({ slug: CLUSO_DETAILS_SLUG })
    .select("profile")
    .lean();

  return NextResponse.json({
    profile: normalizePartnerProfile(detailsDoc?.profile),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  const accessError = ensureSuperAdmin(auth);
  if (accessError) {
    return accessError;
  }

  const body = await req.json();
  const normalizedProfile = normalizePartnerProfile(body?.profile);

  await connectMongo();

  const companyAddress = normalizedProfile.companyInformation.address;
  const invoiceAddress = normalizedProfile.invoicingInformation.billingSameAsCompany
    ? companyAddress
    : normalizedProfile.invoicingInformation.address;

  const nextProfile = {
    companyInformation: {
      companyName: normalizedProfile.companyInformation.companyName,
      gstin: normalizedProfile.companyInformation.gstin.toUpperCase(),
      cinRegistrationNumber: normalizedProfile.companyInformation.cinRegistrationNumber,
      sacCode: asString(normalizedProfile.companyInformation.sacCode),
      ltuCode: asString(normalizedProfile.companyInformation.ltuCode),
      address: companyAddress,
      documents: normalizedProfile.companyInformation.documents,
    },
    invoicingInformation: {
      billingSameAsCompany: normalizedProfile.invoicingInformation.billingSameAsCompany,
      invoiceEmail: normalizedProfile.invoicingInformation.invoiceEmail,
      address: invoiceAddress,
      paymentMethods: normalizePaymentMethods(
        normalizedProfile.invoicingInformation.paymentMethods,
      ),
    },
    primaryContactInformation: normalizedProfile.primaryContactInformation,
    additionalQuestions: normalizedProfile.additionalQuestions,
    updatedAt: new Date(),
  };

  const savedDoc = await ClusoDetails.findOneAndUpdate(
    { slug: CLUSO_DETAILS_SLUG },
    {
      slug: CLUSO_DETAILS_SLUG,
      profile: nextProfile,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    },
  ).lean();

  return NextResponse.json({
    message: "Cluso details updated successfully.",
    profile: normalizePartnerProfile(savedDoc?.profile ?? nextProfile),
  });
}