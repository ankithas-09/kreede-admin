// app/api/bookings/availability/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";

type SlotLoose = { courtId: number | string; start: string; end: string };
type BookingSlotsOnly = { slots?: SlotLoose[] };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = (searchParams.get("date") || "").trim(); // YYYY-MM-DD
    if (!date) return NextResponse.json({ availability: {} });

    const Booking = await BookingModel();

    // Find bookings for the date; we only need slots & court ids
    const docs = await Booking.find({ date })
      .select({ slots: 1 })
      .lean<BookingSlotsOnly[]>();

    const availability: Record<number, { start: string; end: string }[]> = {};

    for (const b of docs) {
      const slots: SlotLoose[] = Array.isArray(b.slots) ? b.slots : [];
      for (const s of slots) {
        const courtIdNum = Number((s as SlotLoose).courtId);
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
