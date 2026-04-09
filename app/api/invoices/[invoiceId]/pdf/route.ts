import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { buildInvoicePdf, toInvoicePdfPayload } from "@/lib/invoicePdf";
import Invoice from "@/lib/models/Invoice";

function canAccessInvoices(auth: { role: string } | null) {
  if (!auth) {
    return false;
  }

  return auth.role === "admin" || auth.role === "superadmin";
}

export async function GET(
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

  const payload = toInvoicePdfPayload(invoiceDoc as unknown as Record<string, unknown>);
  const pdfBuffer = await buildInvoicePdf(payload);
  const responseBody = new Uint8Array(pdfBuffer);

  return new NextResponse(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payload.invoiceNumber || "invoice"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
