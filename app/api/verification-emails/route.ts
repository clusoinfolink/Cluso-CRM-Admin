import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import mongoose from "mongoose";

const TENANT_ID = () => process.env.MS_GRAPH_TENANT_ID?.trim() || "";
const CLIENT_ID = () => process.env.MS_GRAPH_CLIENT_ID?.trim() || "";
const CLIENT_SECRET = () => process.env.MS_GRAPH_CLIENT_SECRET?.trim() || "";
const SENDER_EMAIL = () => process.env.MS_GRAPH_SENDER_EMAIL?.trim() || "indiaops@cluso.in";

async function getGraphAccessToken(): Promise<string | null> {
  const tenantId = TENANT_ID();
  const clientId = CLIENT_ID();
  const clientSecret = CLIENT_SECRET();

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  try {
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          scope: "https://graph.microsoft.com/.default",
          client_secret: clientSecret,
          grant_type: "client_credentials",
        }),
      }
    );

    if (!tokenResponse.ok) {
      return null;
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token || null;
  } catch {
    return null;
  }
}

function buildRequestSubjectTag(requestId: string): string {
  return `[CLUSO-VRF-${requestId}]`;
}

// POST: Send an email for a verification request
export async function POST(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestId = String(body.requestId ?? "").trim();
  const toEmail = String(body.to ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const htmlContent = String(body.body ?? "").trim();
  const serviceInstanceKey = String(body.serviceInstanceKey ?? "").trim();

  if (!requestId || !toEmail || !subject || !htmlContent) {
    return NextResponse.json(
      { error: "Missing required fields: requestId, to, subject, body." },
      { status: 400 }
    );
  }

  const senderEmail = SENDER_EMAIL();
  const accessToken = await getGraphAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Microsoft Graph credentials not configured." },
      { status: 500 }
    );
  }

  const subjectTag = buildRequestSubjectTag(requestId);
  const taggedSubject = `${subject} ${subjectTag}`;

  try {
    const mailResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: taggedSubject,
            body: {
              contentType: "HTML",
              content: htmlContent,
            },
            toRecipients: [{ emailAddress: { address: toEmail } }],
          },
          saveToSentItems: "true",
        }),
      }
    );

    if (!mailResponse.ok) {
      const errorText = await mailResponse.text();
      return NextResponse.json(
        { error: `Failed to send email: ${mailResponse.status} ${errorText}` },
        { status: 500 }
      );
    }

    // Store the email record in MongoDB for tracking
    await connectMongo();
    const db = mongoose.connection.db;
    if (db) {
      await db.collection("verificationEmails").insertOne({
        requestId,
        serviceInstanceKey: serviceInstanceKey || null,
        from: senderEmail,
        to: toEmail,
        subject: taggedSubject,
        body: htmlContent,
        sentBy: auth.userId,
        sentAt: new Date().toISOString(),
        direction: "outbound",
      });
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error sending email." },
      { status: 500 }
    );
  }
}

// GET: Fetch email conversations for a specific verification request
export async function GET(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get("requestId")?.trim() || "";

  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId parameter." }, { status: 400 });
  }

  const senderEmail = SENDER_EMAIL();
  const accessToken = await getGraphAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Microsoft Graph credentials not configured." },
      { status: 500 }
    );
  }

  const subjectTag = buildRequestSubjectTag(requestId);

  try {
    // Search messages in the mailbox that contain our request-specific subject tag
    const searchFilter = encodeURIComponent(`"${subjectTag}"`);
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${senderEmail}/messages?$search=${searchFilter}&$top=100&$select=id,subject,from,toRecipients,body,receivedDateTime,sentDateTime,isRead,conversationId,isDraft`;

    const messagesResponse = await fetch(messagesUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      return NextResponse.json(
        { error: `Failed to fetch messages: ${messagesResponse.status} ${errorText}` },
        { status: 500 }
      );
    }

    const messagesData = await messagesResponse.json();
    const rawMessages = (messagesData.value ?? []) as Array<Record<string, unknown>>;

    // Filter & map messages
    const messages = rawMessages
      .filter((msg) => {
        const msgSubject = String(msg.subject ?? "");
        return msgSubject.includes(subjectTag) && !msg.isDraft;
      })
      .map((msg) => {
        const fromAddr = (msg.from as Record<string, unknown>)?.emailAddress as
          | Record<string, string>
          | undefined;
        const toRecipients = (msg.toRecipients as Array<Record<string, unknown>>) ?? [];
        const bodyObj = msg.body as Record<string, string> | undefined;

        return {
          id: msg.id,
          subject: String(msg.subject ?? ""),
          from: {
            name: fromAddr?.name ?? "",
            email: fromAddr?.address ?? "",
          },
          to: toRecipients.map((recipient) => {
            const recipientAddr = recipient.emailAddress as
              | Record<string, string>
              | undefined;
            return {
              name: recipientAddr?.name ?? "",
              email: recipientAddr?.address ?? "",
            };
          }),
          body: bodyObj?.content ?? "",
          bodyType: bodyObj?.contentType ?? "HTML",
          receivedAt: String(msg.receivedDateTime ?? msg.sentDateTime ?? ""),
          isRead: Boolean(msg.isRead),
          conversationId: String(msg.conversationId ?? ""),
          isSent:
            (fromAddr?.address ?? "").toLowerCase() === senderEmail.toLowerCase(),
        };
      });

    // Group by conversation
    const conversationMap = new Map<
      string,
      {
        conversationId: string;
        subject: string;
        participants: Array<{ name: string; email: string }>;
        messages: typeof messages;
        lastMessageAt: string;
        unreadCount: number;
      }
    >();

    for (const message of messages) {
      const convId = message.conversationId || message.id;
      const existing = conversationMap.get(convId);

      if (existing) {
        existing.messages.push(message);
        if (message.receivedAt > existing.lastMessageAt) {
          existing.lastMessageAt = message.receivedAt;
        }
        if (!message.isRead && !message.isSent) {
          existing.unreadCount += 1;
        }
        // Track unique participants
        const allParticipants = [message.from, ...message.to];
        for (const participant of allParticipants) {
          if (
            participant.email &&
            !existing.participants.some(
              (p) => p.email.toLowerCase() === participant.email.toLowerCase()
            )
          ) {
            existing.participants.push(participant);
          }
        }
      } else {
        conversationMap.set(convId, {
          conversationId: convId,
          subject: message.subject.replace(` ${subjectTag}`, "").replace(subjectTag, "").replace(/^Re:\s*/i, "").trim(),
          participants: [message.from, ...message.to].filter(
            (p, i, arr) =>
              p.email && arr.findIndex((x) => x.email.toLowerCase() === p.email.toLowerCase()) === i
          ),
          messages: [message],
          lastMessageAt: message.receivedAt,
          unreadCount: !message.isRead && !message.isSent ? 1 : 0,
        });
      }
    }

    // Sort messages within each conversation chronologically
    for (const conversation of conversationMap.values()) {
      conversation.messages.sort(
        (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
      );
    }

    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

    return NextResponse.json({
      conversations,
      totalMessages: messages.length,
      totalConversations: conversations.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error fetching emails." },
      { status: 500 }
    );
  }
}
