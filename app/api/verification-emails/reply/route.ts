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

// POST: Reply to a specific email message
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

  const messageId = String(body.messageId ?? "").trim();
  const replyBody = String(body.body ?? "").trim();
  const requestId = String(body.requestId ?? "").trim();

  if (!messageId || !replyBody) {
    return NextResponse.json(
      { error: "Missing required fields: messageId, body." },
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

  try {
    const replyUrl = `https://graph.microsoft.com/v1.0/users/${senderEmail}/messages/${messageId}/reply`;

    const replyResponse = await fetch(replyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          body: {
            contentType: "HTML",
            content: replyBody,
          },
        },
      }),
    });

    if (!replyResponse.ok) {
      const errorText = await replyResponse.text();
      return NextResponse.json(
        { error: `Failed to reply: ${replyResponse.status} ${errorText}` },
        { status: 500 }
      );
    }

    // Track reply in MongoDB
    if (requestId) {
      await connectMongo();
      const db = mongoose.connection.db;
      if (db) {
        await db.collection("verificationEmails").insertOne({
          requestId,
          from: senderEmail,
          replyToMessageId: messageId,
          body: replyBody,
          sentBy: auth.userId,
          sentAt: new Date().toISOString(),
          direction: "outbound",
          type: "reply",
        });
      }
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error replying to email." },
      { status: 500 }
    );
  }
}
