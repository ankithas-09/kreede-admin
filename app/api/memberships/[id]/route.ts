// app/api/memberships/[id]/route.ts
import { NextResponse } from "next/server";
import { MembershipModel } from "@/models/Membership";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toLowerCase();

    const Membership = await MembershipModel();

    if (action === "markpaid") {
      const doc = await Membership.findByIdAndUpdate(
        id,
        { $set: { status: "PAID" } },
        { new: true }
      ).lean();
      if (!doc) return NextResponse.json({ error: "Membership not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (e) {
    console.error("PATCH membership error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
