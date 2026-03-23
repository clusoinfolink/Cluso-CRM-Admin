import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import User from "@/lib/models/User";

const createVerifierSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  companyIds: z.array(z.string().min(1)).optional().default([]),
});

const updateVerifierAccessSchema = z.object({
  verifierId: z.string().min(1),
  companyIds: z.array(z.string().min(1)).optional().default([]),
});

function dedupeIds(ids: string[]) {
  return [...new Set(ids.map((item) => item.trim()).filter(Boolean))];
}

export async function GET(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();

  const [verifiers, companies] = await Promise.all([
    User.find({ role: "verifier" }).sort({ createdAt: -1 }).lean(),
    User.find({ role: "customer" }).sort({ name: 1 }).lean(),
  ]);

  const companyMap = new Map(
    companies.map((company) => [String(company._id), company]),
  );

  return NextResponse.json({
    verifiers: verifiers.map((verifier) => {
      const assignedCompanies = (verifier.assignedCompanies ?? [])
        .map((companyId) => {
          const id = String(companyId);
          const company = companyMap.get(id);
          if (!company) {
            return null;
          }

          return {
            id,
            name: company.name,
            email: company.email,
          };
        })
        .filter(Boolean);

      return {
        id: String(verifier._id),
        name: verifier.name,
        email: verifier.email,
        role: verifier.role,
        assignedCompanies,
        createdAt: verifier.createdAt,
      };
    }),
    companies: companies.map((company) => ({
      id: String(company._id),
      name: company.name,
      email: company.email,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createVerifierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    return NextResponse.json({ error: "Email already exists." }, { status: 409 });
  }

  const companyIds = dedupeIds(parsed.data.companyIds);
  if (companyIds.length > 0) {
    const companyCount = await User.countDocuments({
      _id: { $in: companyIds },
      role: "customer",
    });

    if (companyCount !== companyIds.length) {
      return NextResponse.json(
        { error: "One or more companies are invalid." },
        { status: 400 },
      );
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const verifier = await User.create({
    name: parsed.data.name,
    email,
    passwordHash,
    role: "verifier",
    parentCustomer: null,
    assignedCompanies: companyIds,
    selectedServices: [],
  });

  return NextResponse.json(
    {
      message: "Verifier account created successfully.",
      verifier: {
        id: String(verifier._id),
        name: verifier.name,
        email: verifier.email,
        role: verifier.role,
      },
    },
    { status: 201 },
  );
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateVerifierAccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const verifier = await User.findOne({ _id: parsed.data.verifierId, role: "verifier" }).lean();
  if (!verifier) {
    return NextResponse.json({ error: "Verifier not found." }, { status: 404 });
  }

  const companyIds = dedupeIds(parsed.data.companyIds);
  if (companyIds.length > 0) {
    const companyCount = await User.countDocuments({
      _id: { $in: companyIds },
      role: "customer",
    });

    if (companyCount !== companyIds.length) {
      return NextResponse.json(
        { error: "One or more companies are invalid." },
        { status: 400 },
      );
    }
  }

  await User.findByIdAndUpdate(parsed.data.verifierId, {
    assignedCompanies: companyIds,
  });

  return NextResponse.json({ message: "Verifier company access updated." });
}
