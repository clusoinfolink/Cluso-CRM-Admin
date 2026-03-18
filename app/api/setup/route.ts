import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import Service from "@/lib/models/Service";
import User from "@/lib/models/User";

const defaultServices = [
  "Identity check (India)",
  "NRIC (Singapore)",
  "SSN (USA)",
  "Address Check (India)",
  "Education Check (India)",
  "Education Check (International)",
  "India DB Check",
  "Employment Check (India)",
  "Employment Check (International)",
  "Bankruptcy check (India)",
  "Bankruptcy check (Singapore)",
  "Criminal Record Check",
  "Education Verification",
  "Employment Verification",
  "India Criminal DB Check",
  "International Criminal Check",
  "GLOBAL WATCH LIST",
  "Drug Test",
  "Prohibited Party Check",
  "Anti-Money Laundering (AML) Check",
  "Gap Check (Verifying employment and education gaps)",
  "Criminal Record Verification (Police)",
  "Court Record Search (District / High Court)",
  "Employment Verification (Past employers)",
  "Education Verification (Board / University)",
  "Identity Verification (Aadhaar, PAN, Voter ID)",
  "Address Verification (Physical / Digital)",
  "Professional Reference Check",
  "License / Certification Verification",
  "Credit / CIBIL Check",
  "Global Watchlist / Sanctions Check",
  "Social Media Screening",
  "Drug Test (as per applicable panel)",
  "Driving Licence Verification (RTO)",
  "Directorship / Company Association Check",
];

const setupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  setupKey: z.string().min(6),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = setupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid setup payload." }, { status: 400 });
  }

  if (!process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Missing ADMIN_SETUP_KEY env." }, { status: 500 });
  }

  if (parsed.data.setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Invalid setup key." }, { status: 403 });
  }

  await connectMongo();

  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email }).lean();

  const existingServices = await Service.find({}, { name: 1 }).lean();
  const existingNames = new Set(
    existingServices
      .map((item) => item.name)
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.trim().toLowerCase()),
  );

  const servicesToInsert = defaultServices
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !existingNames.has(name.toLowerCase()))
    .map((name) => ({
      name,
      description: "",
      defaultPrice: 10,
      defaultCurrency: "INR" as const,
    }));

  if (servicesToInsert.length > 0) {
    await Service.insertMany(servicesToInsert);
  }

  await Service.updateMany(
    {},
    {
      $set: {
        defaultPrice: 10,
        defaultCurrency: "INR",
      },
    },
  );

  if (existing) {
    return NextResponse.json(
      {
        message:
          servicesToInsert.length > 0
            ? "Admin already exists. Service catalog synced."
            : "Admin already exists. Service catalog already up to date.",
      },
      { status: 200 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await User.create({
    name: parsed.data.name,
    email,
    passwordHash,
    role: "superadmin",
    parentCustomer: null,
  });

  return NextResponse.json({ message: "Admin setup completed." }, { status: 201 });
}
