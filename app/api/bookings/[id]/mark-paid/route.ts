// app/api/bookings/[id]/mark-paid/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";

type PaidDoc = {
  _id: string;
  adminPaid?: boolean;
};

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const Booking = await BookingModel();

    const doc = await Booking.findById(id)
      .select({ _id: 1, adminPaid: 1 })
      .lean<PaidDoc>();

    if (!doc) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    if (doc.adminPaid === true) {
      // Already paid → idempotent success
      return NextResponse.json({ ok: true, already: true });
    }

    await Booking.updateOne({ _id: id }, { $set: { adminPaid: true } });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("mark-paid error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
