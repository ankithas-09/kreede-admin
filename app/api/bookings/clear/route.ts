// app/api/bookings/clear/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";

type StdQuery = {
  $or?: Array<
    | { userName: { $regex: string; $options: string } }
    | { userEmail: { $regex: string; $options: string } }
  >;
  date?: string;
};

type GuestQuery = {
  $or?: Array<{ userName: { $regex: string; $options: string } }>;
  date?: string;
};

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const date = (searchParams.get("date") || "").trim();

    const Booking = await BookingModel();
    const GuestBooking = await GuestBookingModel();

    // Build same filters as page
    const stdQuery: StdQuery = {};
    if (q) {
      stdQuery.$or = [
        { userName: { $regex: q, $options: "i" } },
        { userEmail: { $regex: q, $options: "i" } },
      ];
    }
    if (date) stdQuery.date = date;

    const guestQuery: GuestQuery = {};
    if (q) {
      guestQuery.$or = [{ userName: { $regex: q, $options: "i" } }];
    }
    if (date) guestQuery.date = date;

    // Delete matching docs — no membership credit restore
    const [delStd, delGuest] = await Promise.all([
      Booking.deleteMany(stdQuery),
      GuestBooking.deleteMany(guestQuery),
    ]);

    return NextResponse.json({
      ok: true,
      deletedBookings: delStd?.deletedCount ?? 0,
      deletedGuestBookings: delGuest?.deletedCount ?? 0,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("clear bookings error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
