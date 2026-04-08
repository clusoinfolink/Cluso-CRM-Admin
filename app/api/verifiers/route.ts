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
  managerId: z.string().trim().optional().default(""),
});

const updateTeamCompanyAccessSchema = z
  .object({
    userId: z.string().min(1).optional(),
    verifierId: z.string().min(1).optional(),
    targetRole: z.enum(["verifier", "manager"]).optional().default("verifier"),
    companyIds: z.array(z.string().min(1)).optional().default([]),
    promoteToManager: z.boolean().optional().default(false),
  })
  .refine((value) => Boolean(value.userId || value.verifierId), {
    message: "User id is required.",
  });

const updateVerifierManagersSchema = z.object({
  managerId: z.string().trim().optional().default(""),
  verifierIds: z.array(z.string().min(1)).optional().default([]),
});

type TeamCompany = {
  _id: unknown;
  name: string;
  email: string;
};

type TeamManager = {
  _id: unknown;
  name: string;
  email: string;
  assignedCompanies?: unknown[];
};

type TeamVerifier = {
  _id: unknown;
  name: string;
  email: string;
  role: "verifier";
  manager?: unknown;
  assignedCompanies?: unknown[];
  createdAt?: unknown;
};

function dedupeIds(ids: string[]) {
  return [...new Set(ids.map((item) => item.trim()).filter(Boolean))];
}

function toTeamVerifier(user: {
  _id: unknown;
  name: string;
  email: string;
  manager?: unknown;
  assignedCompanies?: unknown[];
  createdAt?: unknown;
}): TeamVerifier {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: "verifier",
    manager: user.manager,
    assignedCompanies: user.assignedCompanies,
    createdAt: user.createdAt,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin" && auth.role !== "manager")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();

  let verifiers: TeamVerifier[] = [];
  let companies: TeamCompany[] = [];
  let managers: TeamManager[] = [];

  if (auth.role === "manager") {
    const manager = await User.findOne({ _id: auth.userId, role: "manager" }).lean();
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const managerCompanyIds = (manager.assignedCompanies ?? []).map((item) => String(item));

    const [managedVerifiers, managerCompanies] = await Promise.all([
      User.find({ role: "verifier", manager: manager._id }).sort({ createdAt: -1 }).lean(),
      managerCompanyIds.length > 0
        ? User.find({ _id: { $in: managerCompanyIds }, role: "customer" })
            .sort({ name: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

    verifiers = managedVerifiers.map((user) => toTeamVerifier(user));
    companies = managerCompanies;
    managers = [manager];
  } else {
    const result = await Promise.all([
      User.find({ role: "verifier" }).sort({ createdAt: -1 }).lean(),
      User.find({ role: "customer" }).sort({ name: 1 }).lean(),
      User.find({ role: "manager" }).sort({ name: 1 }).lean(),
    ]);

    verifiers = result[0].map((user) => toTeamVerifier(user));
    companies = result[1];
    managers = result[2];
  }

  const companyMap = new Map(
    companies.map((company) => [String(company._id), company]),
  );
  const managerMap = new Map(
    managers.map((manager) => [String(manager._id), manager]),
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

      const managerId = verifier.manager ? String(verifier.manager) : "";
      const manager = managerId ? managerMap.get(managerId) : null;

      return {
        id: String(verifier._id),
        name: verifier.name,
        email: verifier.email,
        role: verifier.role,
        manager: manager
          ? {
              id: managerId,
              name: manager.name,
              email: manager.email,
            }
          : null,
        assignedCompanies,
        createdAt: verifier.createdAt,
      };
    }),
    companies: companies.map((company) => ({
      id: String(company._id),
      name: company.name,
      email: company.email,
    })),
    managers: managers.map((manager) => {
      const assignedCompanies = (manager.assignedCompanies ?? [])
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
        id: String(manager._id),
        name: manager.name,
        email: manager.email,
        assignedCompanies,
      };
    }),
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

  const managerId = parsed.data.managerId.trim();
  if (managerId) {
    const manager = await User.findOne({ _id: managerId, role: "manager" }).lean();
    if (!manager) {
      return NextResponse.json({ error: "Selected manager is invalid." }, { status: 400 });
    }
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
    manager: managerId || null,
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
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin" && auth.role !== "manager")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateTeamCompanyAccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const targetRole = parsed.data.targetRole ?? "verifier";
  const targetUserId = parsed.data.userId ?? parsed.data.verifierId ?? "";
  const promoteToManager = parsed.data.promoteToManager === true;

  if (promoteToManager && auth.role === "manager") {
    return NextResponse.json(
      { error: "Only admin or superadmin can promote a verifier to manager." },
      { status: 403 },
    );
  }

  if (auth.role === "manager" && targetRole !== "verifier") {
    return NextResponse.json(
      { error: "Managers can only update verifier company access." },
      { status: 403 },
    );
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

  if (auth.role === "manager") {
    const manager = await User.findOne({ _id: auth.userId, role: "manager" }).lean();
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowedCompanyIds = new Set(
      (manager.assignedCompanies ?? []).map((item) => String(item)),
    );
    const hasDisallowedCompany = companyIds.some((companyId) => !allowedCompanyIds.has(companyId));
    if (hasDisallowedCompany) {
      return NextResponse.json(
        { error: "You can only grant companies assigned to your manager account." },
        { status: 403 },
      );
    }

    const managedVerifier = await User.findOne({
      _id: targetUserId,
      role: "verifier",
      manager: manager._id,
    }).lean();

    if (!managedVerifier) {
      return NextResponse.json(
        { error: "Verifier not found for this manager." },
        { status: 404 },
      );
    }
  } else {
    const user = await User.findOne({ _id: targetUserId, role: targetRole }).lean();
    if (!user) {
      return NextResponse.json(
        { error: targetRole === "manager" ? "Manager not found." : "Verifier not found." },
        { status: 404 },
      );
    }
  }

  if (promoteToManager) {
    const verifier = await User.findOne({ _id: targetUserId, role: "verifier" }).lean();
    if (!verifier) {
      return NextResponse.json({ error: "Verifier not found." }, { status: 404 });
    }

    await User.findByIdAndUpdate(targetUserId, {
      role: "manager",
      manager: null,
      assignedCompanies: companyIds,
    });

    return NextResponse.json({
      message: "Verifier promoted to manager successfully.",
    });
  }

  await User.findByIdAndUpdate(targetUserId, {
    assignedCompanies: companyIds,
  });

  return NextResponse.json({
    message:
      targetRole === "manager"
        ? "Manager company access updated."
        : "Verifier company access updated.",
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateVerifierManagersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const verifierIds = dedupeIds(parsed.data.verifierIds);
  const managerId = parsed.data.managerId.trim();

  if (!managerId && verifierIds.length === 0) {
    return NextResponse.json({ error: "Select at least one verifier." }, { status: 400 });
  }

  if (managerId) {
    const manager = await User.findOne({ _id: managerId, role: "manager" }).lean();
    if (!manager) {
      return NextResponse.json({ error: "Selected manager is invalid." }, { status: 400 });
    }
  }

  if (verifierIds.length > 0) {
    const verifierCount = await User.countDocuments({
      _id: { $in: verifierIds },
      role: "verifier",
    });

    if (verifierCount !== verifierIds.length) {
      return NextResponse.json(
        { error: "One or more selected verifiers are invalid." },
        { status: 400 },
      );
    }
  }

  if (managerId) {
    const assignResult = verifierIds.length
      ? await User.updateMany(
          {
            _id: { $in: verifierIds },
            role: "verifier",
          },
          {
            $set: {
              manager: managerId,
            },
          },
        )
      : { modifiedCount: 0 };

    const clearFilter = verifierIds.length
      ? { role: "verifier", manager: managerId, _id: { $nin: verifierIds } }
      : { role: "verifier", manager: managerId };

    const clearResult = await User.updateMany(clearFilter, {
      $set: {
        manager: null,
      },
    });

    return NextResponse.json({
      message: "Manager assignment synced for the selected manager.",
      assignedCount: assignResult.modifiedCount,
      removedCount: clearResult.modifiedCount,
    });
  }

  const result = await User.updateMany(
    {
      _id: { $in: verifierIds },
      role: "verifier",
    },
    {
      $set: {
        manager: managerId || null,
      },
    },
  );

  return NextResponse.json({
    message: managerId
      ? "Manager assignment updated for selected verifiers."
      : "Manager assignment cleared for selected verifiers.",
    updatedCount: result.modifiedCount,
  });
}
