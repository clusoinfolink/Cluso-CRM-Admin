import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { sendCustomerInvoiceEmail } from "@/lib/invoiceMail";
import { buildInvoicePdf, toInvoicePdfPayload } from "@/lib/invoicePdf";
import { connectMongo } from "@/lib/mongodb";
import Invoice from "@/lib/models/Invoice";
import User from "@/lib/models/User";

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

function canAccessInvoices(auth: { role: string } | null) {
  if (!auth) {
    return false;
  }

  return auth.role === "admin" || auth.role === "superadmin";
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const auth = await getAdminAuthFromRequest(req);
  if (!canAccessInvoices(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  if (!invoiceId?.trim()) {
    return NextResponse.json({ error: "Invalid invoice id." }, { status: 400 });
  }

  await connectMongo();

  const invoiceDoc = await Invoice.findById(invoiceId).lean();
  if (!invoiceDoc) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const invoiceData = invoiceDoc as unknown as Record<string, unknown>;
  const enterpriseDetails = asRecord(invoiceData.enterpriseDetails);

  let recipientEmail =
    normalizeWhitespace(asString(enterpriseDetails.invoiceEmail)) ||
    normalizeWhitespace(asString(invoiceData.customerEmail)) ||
    normalizeWhitespace(asString(enterpriseDetails.loginEmail));

  let recipientName =
    normalizeWhitespace(asString(invoiceData.customerName)) ||
    normalizeWhitespace(asString(enterpriseDetails.companyName));

  if (!recipientEmail || !recipientName) {
    const customerId = invoiceData.customer;
    if (customerId) {
      const customerDoc = await User.findById(customerId).select("name email").lean();
      if (customerDoc) {
        if (!recipientEmail) {
          recipientEmail = normalizeWhitespace(asString(customerDoc.email));
        }
        if (!recipientName) {
          recipientName = normalizeWhitespace(asString(customerDoc.name));
        }
      }
    }
  }

  if (!recipientEmail) {
    return NextResponse.json(
      {
        error:
          "Could not determine customer invoice email. Update enterprise invoice email and try again.",
      },
      { status: 400 },
    );
  }

  const payload = toInvoicePdfPayload(invoiceData);
  const pdfBuffer = await buildInvoicePdf(payload);

  const invoiceNumber = normalizeWhitespace(payload.invoiceNumber) || "invoice";
  const safeInvoiceFilename = invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, "_");

  const emailResult = await sendCustomerInvoiceEmail({
    customerName: recipientName || "Customer",
    customerEmail: recipientEmail,
    invoiceNumber,
    invoiceGeneratedAt: payload.createdAt,
    invoicePdf: {
      filename: `${safeInvoiceFilename}.pdf`,
      content: pdfBuffer,
    },
  });

  if (!emailResult.sent) {
    return NextResponse.json(
      {
        error: "Invoice could not be emailed to customer.",
        details: emailResult.reason ?? "Unknown email error",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: `Invoice ${invoiceNumber} emailed successfully to ${recipientEmail}.`,
    recipientEmail,
  });
}
