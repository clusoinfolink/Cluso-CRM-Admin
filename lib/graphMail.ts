export const sendMsGraphEmail = async (
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
): Promise<{ sent: boolean; reason?: string }> => {
  const TENANT_ID = process.env.MS_GRAPH_TENANT_ID?.trim();
  const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID?.trim();
  const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET?.trim();
  const SENDER_EMAIL = process.env.MS_GRAPH_SENDER_EMAIL?.trim();

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !SENDER_EMAIL) {
    return {
      sent: false,
      reason: "Microsoft Graph credentials are not fully configured in environment.",
    };
  }

  try {
    // 1. Get Access Token
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        scope: "https://graph.microsoft.com/.default",
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return { sent: false, reason: `Failed to get access token: ${errorText}` };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. Send Email
    const mailResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: subject,
          body: {
            contentType: "HTML",
            content: htmlContent || textContent || ""
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ],
          hasAttachments: attachments && attachments.length > 0,
          attachments: attachments?.map(att => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: att.filename,
            contentType: att.contentType,
            contentBytes: att.content.toString("base64")
          }))
        },
        saveToSentItems: "true"
      }),
    });

    if (!mailResponse.ok) {
      const errorText = await mailResponse.text();
      return { sent: false, reason: `Failed to send email: ${mailResponse.status} ${errorText}` };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Unknown MS Graph email error",
    };
  }
};
