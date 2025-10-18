// app/api/registrations/clear/route.ts
import { NextResponse } from "next/server";
import { RegistrationModel } from "@/models/Registrations";

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = (searchParams.get("eventId") || "").trim();
    if (!eventId) {
      return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
    }

    const Registration = await RegistrationModel();
    const r = await Registration.deleteMany({ eventId });

    return NextResponse.json({ ok: true, deleted: r.deletedCount || 0 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("clear registrations error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
