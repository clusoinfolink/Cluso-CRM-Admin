import { NextResponse } from "next/server";
import { adminCookieName } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ message: "Logged out" });
  res.cookies.set(adminCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
