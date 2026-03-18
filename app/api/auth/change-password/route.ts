import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import User from "@/lib/models/User";
import { getAdminAuthFromRequest } from "@/lib/auth";

const schema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return NextResponse.json(
      { error: "New password must be different from current password." },
      { status: 400 },
    );
  }

  await connectMongo();

  const user = await User.findById(auth.userId);
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!isCurrentPasswordValid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await user.save();

  return NextResponse.json({ message: "Password changed successfully." });
}
