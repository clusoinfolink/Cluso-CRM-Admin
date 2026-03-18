import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import Service from "@/lib/models/Service";
import User from "@/lib/models/User";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  selectedServices: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        price: z.coerce.number().min(0),
        currency: z.enum(["INR", "USD"]),
      }),
    )
    .optional()
    .default([]),
});

const updateSchema = z.object({
  customerId: z.string().min(1),
  selectedServices: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        price: z.coerce.number().min(0),
        currency: z.enum(["INR", "USD"]),
      }),
    )
    .optional()
    .default([]),
});

export async function GET(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const items = await User.find({ role: "customer" }).sort({ createdAt: -1 }).lean();

  return NextResponse.json({
    items: items.map((item) => ({
      id: String(item._id),
      name: item.name,
      email: item.email,
      selectedServices: (item.selectedServices ?? []).map((service) => ({
        serviceId: String(service.serviceId),
        serviceName: service.serviceName,
        price: service.price,
        currency: service.currency,
      })),
    })),
  });
}

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

  await connectMongo();

  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    return NextResponse.json({ error: "Email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const selectedServiceIds = parsed.data.selectedServices.map((item) => item.serviceId);
  const serviceDocs =
    selectedServiceIds.length > 0
      ? await Service.find({ _id: { $in: selectedServiceIds } }).lean()
      : [];

  if (serviceDocs.length !== selectedServiceIds.length) {
    return NextResponse.json(
      { error: "One or more selected services are invalid." },
      { status: 400 },
    );
  }

  const serviceMap = new Map(serviceDocs.map((item) => [String(item._id), item]));
  const selectedServices = parsed.data.selectedServices.map((item) => {
    const service = serviceMap.get(item.serviceId);
    return {
      serviceId: item.serviceId,
      serviceName: service?.name ?? "",
      price: item.price,
      currency: item.currency,
    };
  });

  await User.create({
    name: parsed.data.name,
    email,
    passwordHash,
    role: "customer",
    parentCustomer: null,
    selectedServices,
  });

  return NextResponse.json({ message: "Customer login issued successfully." }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth || (auth.role !== "admin" && auth.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  await connectMongo();

  const customer = await User.findOne({ _id: parsed.data.customerId, role: "customer" }).lean();
  if (!customer) {
    return NextResponse.json({ error: "Customer company not found." }, { status: 404 });
  }

  const selectedServiceIds = parsed.data.selectedServices.map((item) => item.serviceId);
  const serviceDocs =
    selectedServiceIds.length > 0
      ? await Service.find({ _id: { $in: selectedServiceIds } }).lean()
      : [];

  if (serviceDocs.length !== selectedServiceIds.length) {
    return NextResponse.json(
      { error: "One or more selected services are invalid." },
      { status: 400 },
    );
  }

  const serviceMap = new Map(serviceDocs.map((item) => [String(item._id), item]));
  const selectedServices = parsed.data.selectedServices.map((item) => {
    const service = serviceMap.get(item.serviceId);
    return {
      serviceId: item.serviceId,
      serviceName: service?.name ?? "",
      price: item.price,
      currency: item.currency,
    };
  });

  await User.findByIdAndUpdate(parsed.data.customerId, { selectedServices });

  return NextResponse.json({ message: "Company services updated." });
}
