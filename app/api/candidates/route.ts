import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import User from "@/lib/models/User";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAdminAuthFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["superadmin", "admin", "manager", "verifier"].includes(auth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectMongo();

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const candidate = await User.findOne({ _id: id, role: "candidate" })
        .select("-passwordHash")
        .lean();

      if (!candidate) {
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      }

      return NextResponse.json({ candidate });
    }

    // List all candidates
    const candidates = await User.find({ role: "candidate" })
      .select("_id name email digilockerProfile createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("Error fetching candidates:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
