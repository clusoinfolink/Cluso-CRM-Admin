import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import VerificationRequest from "@/lib/models/VerificationRequest";
import User from "@/lib/models/User";

type SelectedServiceLike = {
  serviceId: unknown;
  serviceName: string;
  price: number;
  currency: string;
};

type ServiceVerificationLike = {
  serviceId: unknown;
  serviceName: string;
  status?: "pending" | "verified" | "unverified";
  verificationMode?: string;
  comment?: string;
  attempts?: Array<{
    status?: "verified" | "unverified";
    verificationMode?: string;
    comment?: string;
    attemptedAt?: Date;
    verifierName?: string;
    managerName?: string;
  }>;
};

type NormalizedServiceVerification = {
  serviceId: string;
  serviceName: string;
  status: "pending" | "verified" | "unverified";
  verificationMode: string;
  comment: string;
  attempts: Array<{
    status: "verified" | "unverified";
    verificationMode: string;
    comment: string;
    attemptedAt: Date;
    verifierName: string;
    managerName: string;
  }>;
};

type ReportPayload = {
  reportNumber: string;
  generatedAt: string;
  generatedByName: string;
  candidate: {
    name: string;
    email: string;
    phone: string;
  };
  company: {
    name: string;
    email: string;
  };
  status: string;
  createdAt: string;
  services: Array<{
    serviceName: string;
    status: string;
    verificationMode: string;
    comment: string;
    attempts: Array<{
      attemptedAt: string;
      status: string;
      verificationMode: string;
      comment: string;
      verifierName: string;
      managerName: string;
    }>;
  }>;
};

type InvoiceSnapshot = {
  currency: string;
  subtotal: number;
  items: Array<{
    serviceId: string;
    serviceName: string;
    price: number;
  }>;
  billingEmail: string;
  companyName: string;
};

function asDate(value: unknown) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCurrency(amount: number, currency: string) {
  const normalizedAmount = Number.isFinite(amount) ? amount : 0;
  const normalizedCurrency = (currency || "INR").toUpperCase();

  try {
    const formattedAmount = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(normalizedAmount);

    return `${normalizedCurrency} ${formattedAmount}`;
  } catch {
    return `${normalizedCurrency} ${normalizedAmount.toFixed(2)}`;
  }
}

function sanitizePdfText(value: string) {
  return value
    .replace(/₹/g, "INR ")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "");
}

function normalizeServiceVerifications(
  selectedServices: SelectedServiceLike[] = [],
  existingVerifications: ServiceVerificationLike[] = [],
) {
  const defaults: NormalizedServiceVerification[] = selectedServices.map((service) => ({
    serviceId: String(service.serviceId),
    serviceName: service.serviceName,
    status: "pending",
    verificationMode: "",
    comment: "",
    attempts: [],
  }));

  const serviceMap = new Map<string, NormalizedServiceVerification>(
    defaults.map((entry) => [entry.serviceId, entry]),
  );

  for (const verification of existingVerifications) {
    const serviceId = String(verification.serviceId);
    serviceMap.set(serviceId, {
      serviceId,
      serviceName: verification.serviceName,
      status: verification.status ?? "pending",
      verificationMode: verification.verificationMode ?? "",
      comment: verification.comment ?? "",
      attempts: (verification.attempts ?? []).map((attempt) => ({
        status: attempt.status ?? "verified",
        verificationMode: attempt.verificationMode ?? "",
        comment: attempt.comment ?? "",
        attemptedAt: attempt.attemptedAt ? new Date(attempt.attemptedAt) : new Date(),
        verifierName: attempt.verifierName ?? "",
        managerName: attempt.managerName ?? "",
      })),
    });
  }

  return [...serviceMap.values()];
}

async function getScopedRequest(auth: {
  userId: string;
  role: "admin" | "superadmin" | "manager" | "verifier";
}, requestId: string) {
  if (auth.role === "verifier") {
    return {
      error: "Only admin or manager roles can generate reports.",
      status: 403,
      item: null,
    };
  }

  if (auth.role === "admin" || auth.role === "superadmin") {
    const item = await VerificationRequest.findById(requestId).lean();
    return { error: "", status: 200, item };
  }

  const manager = await User.findOne({ _id: auth.userId, role: "manager" }).lean();
  if (!manager) {
    return {
      error: "Unauthorized",
      status: 401,
      item: null,
    };
  }

  const managedVerifiers = await User.find({
    role: "verifier",
    manager: manager._id,
  })
    .select("assignedCompanies")
    .lean();

  const scopedCompanies = new Set<string>(
    (manager.assignedCompanies ?? []).map((companyId) => String(companyId)),
  );

  for (const verifier of managedVerifiers) {
    for (const companyId of verifier.assignedCompanies ?? []) {
      scopedCompanies.add(String(companyId));
    }
  }

  const item = await VerificationRequest.findOne({
    _id: requestId,
    customer: { $in: [...scopedCompanies] },
  }).lean();

  return {
    error: "",
    status: 200,
    item,
  };
}

async function buildPdfBuffer(report: ReportPayload, invoice: InvoiceSnapshot) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const pageMargin = 40;
  const maxTextWidth = pageWidth - pageMargin * 2;
  const paragraphGap = 4;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - pageMargin;

  function ensureSpace(requiredHeight: number) {
    if (y - requiredHeight >= pageMargin) {
      return;
    }

    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - pageMargin;
  }

  function wrapText(text: string, size: number, isBold = false) {
    const font = isBold ? boldFont : regularFont;
    const normalizedText = text.trim();
    if (!normalizedText) {
      return [""];
    }

    const words = normalizedText.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, size);

      if (width <= maxTextWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      if (font.widthOfTextAtSize(word, size) <= maxTextWidth) {
        currentLine = word;
        continue;
      }

      let segment = "";
      for (const char of word) {
        const nextSegment = `${segment}${char}`;
        if (font.widthOfTextAtSize(nextSegment, size) <= maxTextWidth) {
          segment = nextSegment;
        } else {
          if (segment) {
            lines.push(segment);
          }
          segment = char;
        }
      }
      currentLine = segment;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [""];
  }

  function writeText(text: string, size = 10, isBold = false, color = rgb(0.2, 0.25, 0.35)) {
    const safeText = sanitizePdfText(text);
    const lines = wrapText(safeText, size, isBold);
    const lineHeight = size + paragraphGap;
    ensureSpace(lines.length * lineHeight);

    for (const line of lines) {
      page.drawText(line, {
        x: pageMargin,
        y,
        size,
        font: isBold ? boldFont : regularFont,
        color,
      });
      y -= lineHeight;
    }
  }

  function writeSectionTitle(title: string) {
    y -= 2;
    writeText(title, 12, true, rgb(0.06, 0.1, 0.17));
    y -= 2;
  }

  writeText("Verification Report", 18, true, rgb(0.06, 0.1, 0.17));
  writeText(`Report Number: ${report.reportNumber}`);
  writeText(`Generated At: ${new Date(report.generatedAt).toLocaleString()}`);
  writeText(`Generated By: ${report.generatedByName}`);

  writeSectionTitle("Candidate Details");
  writeText(`Name: ${report.candidate.name}`);
  writeText(`Email: ${report.candidate.email || "-"}`);
  writeText(`Phone: ${report.candidate.phone || "-"}`);

  writeSectionTitle("Company Details");
  writeText(`Company: ${report.company.name}`);
  writeText(`Company Email: ${report.company.email}`);
  writeText(`Request Status: ${report.status}`);
  writeText(`Request Created: ${new Date(report.createdAt).toLocaleString()}`);

  writeSectionTitle("Service Verification Summary");

  for (const service of report.services) {
    writeText(`Service: ${service.serviceName}`, 10, true);
    writeText(`Status: ${service.status}`);
    writeText(`Verification Mode: ${service.verificationMode || "-"}`);
    writeText(`Comment: ${service.comment || "-"}`);
    writeText(`Attempts: ${service.attempts.length}`);

    for (const attempt of service.attempts.slice().reverse()) {
      writeText(
        `- ${new Date(attempt.attemptedAt).toLocaleString()} | ${attempt.status} | ${attempt.verificationMode || "-"} | Verifier: ${attempt.verifierName || "-"} | Manager: ${attempt.managerName || "-"}`,
      );

      if (attempt.comment) {
        writeText(`  Note: ${attempt.comment}`);
      }
    }

    y -= 2;
  }

  writeSectionTitle("Invoice Snapshot");
  writeText(`Company: ${invoice.companyName || "-"}`);
  writeText(`Billing Email: ${invoice.billingEmail || "-"}`);
  writeText(`Currency: ${invoice.currency}`);
  writeText(`Subtotal: ${formatCurrency(invoice.subtotal, invoice.currency)}`);

  if (invoice.items.length > 0) {
    writeText("Invoice Items:", 10, true);
    for (const item of invoice.items) {
      writeText(`- ${item.serviceName}: ${formatCurrency(item.price, invoice.currency)}`);
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const auth = await getAdminAuthFromRequest(req);
  if (
    !auth ||
    (auth.role !== "admin" &&
      auth.role !== "superadmin" &&
      auth.role !== "manager" &&
      auth.role !== "verifier")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId } = await context.params;
  if (!requestId?.trim()) {
    return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
  }

  await connectMongo();

  const scoped = await getScopedRequest(auth, requestId);
  if (!scoped.item) {
    return NextResponse.json({ error: scoped.error || "Request not found." }, { status: scoped.status || 404 });
  }

  if (scoped.item.status !== "verified") {
    return NextResponse.json(
      { error: "Report generation is available only after request verification is complete." },
      { status: 400 },
    );
  }

  const customer = await User.findById(scoped.item.customer).lean();
  const generator = await User.findById(auth.userId).select("name").lean();

  const selectedServices = (scoped.item.selectedServices ?? []) as SelectedServiceLike[];
  const serviceVerifications = normalizeServiceVerifications(
    selectedServices,
    (scoped.item.serviceVerifications ?? []) as ServiceVerificationLike[],
  );

  const reportNumber = `RPT-${Date.now()}`;
  const generatedAt = new Date();

  const reportData: ReportPayload = {
    reportNumber,
    generatedAt: generatedAt.toISOString(),
    generatedByName: generator?.name ?? "Unknown",
    candidate: {
      name: scoped.item.candidateName,
      email: scoped.item.candidateEmail,
      phone: scoped.item.candidatePhone,
    },
    company: {
      name: customer?.name ?? "Unknown",
      email: customer?.email ?? "Unknown",
    },
    status: scoped.item.status,
    createdAt: asDate(scoped.item.createdAt)?.toISOString() ?? new Date().toISOString(),
    services: serviceVerifications.map((service) => ({
      serviceName: service.serviceName,
      status: service.status,
      verificationMode: service.verificationMode,
      comment: service.comment,
      attempts: service.attempts.map((attempt) => ({
        attemptedAt: attempt.attemptedAt.toISOString(),
        status: attempt.status,
        verificationMode: attempt.verificationMode,
        comment: attempt.comment,
        verifierName: attempt.verifierName,
        managerName: attempt.managerName,
      })),
    })),
  };

  const invoiceSnapshot: InvoiceSnapshot = {
    currency: selectedServices[0]?.currency || "INR",
    subtotal: selectedServices.reduce((sum, service) => sum + (service.price || 0), 0),
    items: selectedServices.map((service) => ({
      serviceId: String(service.serviceId),
      serviceName: service.serviceName,
      price: service.price || 0,
    })),
    billingEmail:
      customer?.partnerProfile?.invoicingInformation?.invoiceEmail ||
      customer?.partnerProfile?.primaryContactInformation?.email ||
      customer?.email ||
      "",
    companyName: customer?.name || "",
  };

  await VerificationRequest.findByIdAndUpdate(
    requestId,
    {
      reportMetadata: {
        generatedAt,
        generatedBy: auth.userId,
        generatedByName: generator?.name ?? "Unknown",
        reportNumber,
      },
      reportData,
      invoiceSnapshot,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  return NextResponse.json({
    message: "Report generated successfully.",
    reportNumber,
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const auth = await getAdminAuthFromRequest(req);
    if (
      !auth ||
      (auth.role !== "admin" &&
        auth.role !== "superadmin" &&
        auth.role !== "manager" &&
        auth.role !== "verifier")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = await context.params;
    if (!requestId?.trim()) {
      return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
    }

    await connectMongo();

    const scoped = await getScopedRequest(auth, requestId);
    if (!scoped.item) {
      return NextResponse.json({ error: scoped.error || "Request not found." }, { status: scoped.status || 404 });
    }

    if (!scoped.item.reportData || !scoped.item.invoiceSnapshot) {
      return NextResponse.json(
        { error: "No generated report found for this request yet." },
        { status: 404 },
      );
    }

    const reportData = scoped.item.reportData as ReportPayload;
    const invoiceSnapshot = scoped.item.invoiceSnapshot as InvoiceSnapshot;

    const pdfBuffer = await buildPdfBuffer(reportData, invoiceSnapshot);
    const pdfBytes = Uint8Array.from(pdfBuffer);

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportData.reportNumber || "verification-report"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[report-download] failed", error);
    const message =
      error instanceof Error ? error.message : "Could not generate report download.";

    return NextResponse.json(
      {
        error: "Could not generate report download.",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
