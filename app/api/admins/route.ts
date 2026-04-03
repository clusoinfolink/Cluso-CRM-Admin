import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromCookies } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import User from "@/lib/models/User";

export async function GET() {
  const auth = await getAdminAuthFromCookies();
  if (!auth || auth.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const admins = await User.find({ role: { $in: ["admin", "superadmin", "manager"] } })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    items: admins.map((item) => ({
      id: String(item._id),
      name: item.name,
      email: item.email,
      role: item.role,
      createdAt: item.createdAt,
    })),
  });
}

const createAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "superadmin", "manager"]).default("admin"),
});

export async function POST(req: Request) {
  const auth = await getAdminAuthFromCookies();
  if (!auth || auth.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createAdminSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await connectMongo();

  const existing = await User.findOne({ email: parsed.data.email.toLowerCase() }).lean();
  if (existing) {
    return NextResponse.json({ error: "User already exists with this email" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const newUser = await User.create({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash,
    role: parsed.data.role,
    parentCustomer: null,
  });

  return NextResponse.json({
    id: String(newUser._id),
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
  });
}
