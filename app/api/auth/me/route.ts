import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminCookieName, verifyAdminToken } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import User from "@/lib/models/User";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName())?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const user = await User.findById(payload.userId).lean();

  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}
