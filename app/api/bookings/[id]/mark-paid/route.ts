// app/api/bookings/[id]/mark-paid/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";

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

    // Try regular bookings first
    {
      const Booking = await BookingModel();
      const found = await Booking.findById(id).select({ _id: 1, adminPaid: 1 }).lean<PaidDoc | null>();
      if (found) {
        if (found.adminPaid === true) {
          // idempotent success
          return NextResponse.json({ ok: true, already: true, source: "bookings" });
        }
        await Booking.updateOne({ _id: id }, { $set: { adminPaid: true } });
        return NextResponse.json({ ok: true, source: "bookings" });
      }
    }

    // If not in bookings, try guest_bookings
    {
      const GuestBooking = await GuestBookingModel();
      const foundGuest = await GuestBooking.findById(id).select({ _id: 1, adminPaid: 1 }).lean<PaidDoc | null>();
      if (foundGuest) {
        if (foundGuest.adminPaid === true) {
          // idempotent success
          return NextResponse.json({ ok: true, already: true, source: "guest_bookings" });
        }
        await GuestBooking.updateOne({ _id: id }, { $set: { adminPaid: true } });
        return NextResponse.json({ ok: true, source: "guest_bookings" });
      }
    }

    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("mark-paid error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
