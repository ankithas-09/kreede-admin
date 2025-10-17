// app/api/registrations/[id]/mark-paid/route.ts
import { NextResponse } from "next/server";
import { RegistrationModel } from "@/models/Registrations";

type RegPaid = { _id: string; adminPaid?: boolean };

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const Registration = await RegistrationModel();
    const reg = (await Registration.findById(id)
      .select({ _id: 1, adminPaid: 1 })
      .lean()) as RegPaid | null;

    if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

    if (reg.adminPaid === true) {
      // Already paid → idempotent success
      return NextResponse.json({ ok: true, already: true });
    }

    await Registration.updateOne({ _id: id }, { $set: { adminPaid: true } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("mark registration paid error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
