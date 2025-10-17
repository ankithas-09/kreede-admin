// app/api/bookings/[id]/mark-paid/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";

type PaidDoc = {
  _id: string;
  adminPaid?: boolean;
  paymentRef?: string;
};

function toPaidRef(current?: string): string | undefined {
  const ref = String(current || "").toUpperCase().trim();
  if (!ref) return undefined;

  // If already PAID.*, keep as-is.
  if (ref.startsWith("PAID.")) return ref;

  // If UNPAID.X -> PAID.X
  if (ref.startsWith("UNPAID.")) return `PAID.${ref.slice("UNPAID.".length)}`;

  // Normalize common values
  if (ref === "CASH") return "PAID.CASH";
  if (ref === "ONLINE") return "PAID.ONLINE";

  // Membership is always paid, do not prefix
  if (ref === "MEMBERSHIP") return "MEMBERSHIP";

  // Otherwise prefix with PAID.
  return `PAID.${ref}`;
}

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // 1) Try regular bookings first
    {
      const Booking = await BookingModel();
      const found = await Booking.findById(id)
        .select({ _id: 1, adminPaid: 1, paymentRef: 1 })
        .lean<PaidDoc | null>();

      if (found) {
        const alreadyPaid =
          found.adminPaid === true ||
          String(found.paymentRef || "").toUpperCase().startsWith("PAID.") ||
          String(found.paymentRef || "").toUpperCase() === "MEMBERSHIP";

        if (alreadyPaid) {
          // Idempotent success
          return NextResponse.json({ ok: true, already: true, source: "bookings" });
        }

        const nextRef = toPaidRef(found.paymentRef);

        await Booking.updateOne(
          { _id: id },
          { $set: { adminPaid: true, ...(nextRef ? { paymentRef: nextRef } : {}) } }
        );

        return NextResponse.json({ ok: true, source: "bookings" });
      }
    }

    // 2) If not found in bookings, try guest_bookings
    {
      const GuestBooking = await GuestBookingModel();
      const foundGuest = await GuestBooking.findById(id)
        .select({ _id: 1, adminPaid: 1, paymentRef: 1 })
        .lean<PaidDoc | null>();

      if (foundGuest) {
        const ref = String(foundGuest.paymentRef || "").toUpperCase();
        const alreadyPaid =
          foundGuest.adminPaid === true || ref.startsWith("PAID.");

        if (alreadyPaid) {
          // Idempotent success
          return NextResponse.json({ ok: true, already: true, source: "guest_bookings" });
        }

        // Guest pending should be UNPAID.CASH → mark to PAID.CASH
        const nextRef = toPaidRef(foundGuest.paymentRef) || "PAID.CASH";

        await GuestBooking.updateOne(
          { _id: id },
          { $set: { adminPaid: true, paymentRef: nextRef } }
        );

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
