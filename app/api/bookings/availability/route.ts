// app/api/bookings/availability/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";

type SlotLoose = { courtId: number | string; start: string; end: string };
type BookingSlotsOnly = { slots?: SlotLoose[] };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = (searchParams.get("date") || "").trim();
    if (!date) return NextResponse.json({ availability: {} });

    const Booking = await BookingModel();
    const GuestBooking = await GuestBookingModel();

    const [docsA, docsG] = await Promise.all([
      Booking.find({ date }).select({ slots: 1 }).lean<BookingSlotsOnly[]>(),
      GuestBooking.find({ date }).select({ slots: 1 }).lean<BookingSlotsOnly[]>(),
    ]);

    const all = [...docsA, ...docsG];

    const availability: Record<number, { start: string; end: string }[]> = {};
    for (const b of all) {
      const slots: SlotLoose[] = Array.isArray(b.slots) ? b.slots : [];
      for (const s of slots) {
        const courtIdNum = Number(s.courtId);
        if (!Number.isFinite(courtIdNum)) continue;
        if (!availability[courtIdNum]) availability[courtIdNum] = [];
        availability[courtIdNum].push({ start: s.start, end: s.end });
      }
    }

    return NextResponse.json({ availability });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("availability error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
