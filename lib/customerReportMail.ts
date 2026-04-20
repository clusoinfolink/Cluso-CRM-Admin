import nodemailer from "nodemailer";

type CustomerReportMailPayload = {
  customerName: string;
  customerEmail: string;
  candidateName: string;
  requestId: string;
  reportPdf?: {
    filename: string;
    content: Buffer;
  };
  supplementalAttachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

export type CustomerReportMailResult = {
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

export async function sendCustomerReportSharedEmail(
  payload: CustomerReportMailPayload,
): Promise<CustomerReportMailResult> {
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
  const safeCandidateName = escapeHtml(payload.candidateName);
  const safeRequestId = escapeHtml(payload.requestId);
  const safePortalUrl = escapeHtml(portalUrl);

  const fromAddress =
    process.env.CUSTOMER_REPORT_MAIL_FROM?.trim() ||
    process.env.VERIFICATION_MAIL_FROM?.trim() ||
    `Cluso Infolink Team <${smtpUser}>`;

  const subject = `Verification report shared for ${payload.candidateName}`;
  const supplementalAttachmentCount = payload.supplementalAttachments?.length ?? 0;

  const text = [
    `Dear ${payload.customerName},`,
    "",
    `The verification report for candidate ${payload.candidateName} is now available in your customer portal.`,
    payload.reportPdf ? "The generated verification report PDF is attached to this email." : "",
    supplementalAttachmentCount > 0
      ? `${supplementalAttachmentCount} verification screenshot attachment${supplementalAttachmentCount > 1 ? "s are" : " is"} included with this email.`
      : "",
    "",
    `Request ID: ${payload.requestId}`,
    `Portal URL: ${portalUrl}`,
    "",
    "Regards,",
    "Cluso Infolink Team",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5;">
      <p>Dear ${safeCustomerName},</p>
      <p>
        The verification report for candidate <strong>${safeCandidateName}</strong>
        is now available in your customer portal.
      </p>
      ${payload.reportPdf ? "<p><strong>The generated verification report PDF is attached to this email.</strong></p>" : ""}
      ${supplementalAttachmentCount > 0 ? `<p><strong>${supplementalAttachmentCount} verification screenshot attachment${supplementalAttachmentCount > 1 ? "s are" : " is"} included with this email.</strong></p>` : ""}
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; width: 100%; max-width: 560px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <tr>
          <td style="padding: 12px 14px; font-weight: 700; width: 160px; color: #334155;">Request ID</td>
          <td style="padding: 12px 14px;"><code style="font-family: Consolas, Menlo, monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${safeRequestId}</code></td>
        </tr>
        <tr>
          <td style="padding: 12px 14px; font-weight: 700; width: 160px; color: #334155; border-top: 1px solid #e2e8f0;">Portal URL</td>
          <td style="padding: 12px 14px; border-top: 1px solid #e2e8f0;"><a href="${safePortalUrl}" style="color: #2563eb;">${safePortalUrl}</a></td>
        </tr>
      </table>
      <p style="margin-top: 14px;">
        Please sign in to review the shared report.
      </p>
      <p>
        Regards,<br />
        Cluso Infolink Team
      </p>
    </div>
  `;

  try {
    const attachments = [
      ...(payload.reportPdf
        ? [
            {
              filename: payload.reportPdf.filename,
              content: payload.reportPdf.content,
              contentType: "application/pdf",
            },
          ]
        : []),
      ...((payload.supplementalAttachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType || "application/octet-stream",
      }))),
    ];

    await transporter.sendMail({
      from: fromAddress,
      to: payload.customerEmail,
      subject,
      text,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}
