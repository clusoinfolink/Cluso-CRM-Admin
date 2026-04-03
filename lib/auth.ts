import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const TOKEN_NAME = "cluso_admin_token";

type AdminPayload = {
  userId: string;
  role: "admin" | "superadmin" | "manager" | "verifier";
};

export function signAdminToken(payload: AdminPayload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET in environment variables.");
  }

  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyAdminToken(token: string): AdminPayload | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return null;
    }

    return jwt.verify(token, secret) as AdminPayload;
  } catch {
    return null;
  }
}

export async function getAdminAuthFromRequest(req: NextRequest) {
  const token = req.cookies.get(TOKEN_NAME)?.value;
  if (!token) {
    return null;
  }

  return verifyAdminToken(token);
}

export async function getAdminAuthFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) {
    return null;
  }

  return verifyAdminToken(token);
}

export function adminCookieName() {
  return TOKEN_NAME;
}
