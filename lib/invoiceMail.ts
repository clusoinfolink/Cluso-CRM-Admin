import nodemailer from "nodemailer";

type CustomerInvoiceMailPayload = {
  customerName: string;
  customerEmail: string;
  invoiceNumber: string;
  invoiceGeneratedAt: string;
  invoicePdf: {
    filename: string;
    content: Buffer;
  };
};

export type CustomerInvoiceMailResult = {
  sent: boolean;
  reason?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveCustomerPortalUrl() {
  const configuredUrl = process.env.CUSTOMER_PORTAL_URL?.trim();
  if (configuredUrl) {
    if (/vercel\.(app|com)/i.test(configuredUrl)) {
      return "https://enterprise.secure.cluso.in/";
    }

    return configuredUrl;
  }

  return "https://enterprise.secure.cluso.in/";
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export async function sendCustomerInvoiceEmail(
  payload: CustomerInvoiceMailPayload,
): Promise<CustomerInvoiceMailResult> {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;

  if (!smtpHost || !smtpUser || !smtpPass || Number.isNaN(smtpPort)) {
    return {
      sent: false,
      reason: "SMTP credentials are not configured.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const portalUrl = resolveCustomerPortalUrl();
  const safeCustomerName = escapeHtml(payload.customerName);
  const safeInvoiceNumber = escapeHtml(payload.invoiceNumber);
  const safePortalUrl = escapeHtml(portalUrl);
  const generatedAt = formatDateTime(payload.invoiceGeneratedAt);

  const fromAddress =
    process.env.CUSTOMER_REPORT_MAIL_FROM?.trim() ||
    process.env.VERIFICATION_MAIL_FROM?.trim() ||
    `Cluso Infolink Team <${smtpUser}>`;

  const subject = `Invoice ${payload.invoiceNumber} from Cluso Infolink`;

  const text = [
    `Dear ${payload.customerName},`,
    "",
    `Your invoice ${payload.invoiceNumber} has been generated and is attached to this email as a PDF file.`,
    `Generated: ${generatedAt}`,
    `Portal URL: ${portalUrl}`,
    "",
    "Regards,",
    "Cluso Infolink Team",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5;">
      <p>Dear ${safeCustomerName},</p>
      <p>
        Your invoice <strong>${safeInvoiceNumber}</strong> has been generated and is attached
        to this email as a PDF file.
      </p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; width: 100%; max-width: 560px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <tr>
          <td style="padding: 12px 14px; font-weight: 700; width: 160px; color: #334155;">Invoice Number</td>
          <td style="padding: 12px 14px;"><code style="font-family: Consolas, Menlo, monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${safeInvoiceNumber}</code></td>
        </tr>
        <tr>
          <td style="padding: 12px 14px; font-weight: 700; width: 160px; color: #334155; border-top: 1px solid #e2e8f0;">Generated</td>
          <td style="padding: 12px 14px; border-top: 1px solid #e2e8f0;">${escapeHtml(generatedAt)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 14px; font-weight: 700; width: 160px; color: #334155; border-top: 1px solid #e2e8f0;">Portal URL</td>
          <td style="padding: 12px 14px; border-top: 1px solid #e2e8f0;"><a href="${safePortalUrl}" style="color: #2563eb;">${safePortalUrl}</a></td>
        </tr>
      </table>
      <p style="margin-top: 14px;">
        You can also sign in to your customer portal to view previously generated invoices.
      </p>
      <p>
        Regards,<br />
        Cluso Infolink Team
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: payload.customerEmail,
      subject,
      text,
      html,
      attachments: [
        {
          filename: payload.invoicePdf.filename,
          content: payload.invoicePdf.content,
          contentType: "application/pdf",
        },
      ],
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}
