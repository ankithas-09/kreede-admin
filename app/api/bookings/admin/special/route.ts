// app/api/bookings/admin/special/route.ts
import { NextResponse } from "next/server";
import { getOfferModel } from "@/models/Offer";
import { BookingModel } from "@/models/Booking";

type SlotIn = { courtId: number; start: string; end: string };
type Body = {
  type: "member" | "user" | "guest";
  date: string;                 // "yyyy-mm-dd"
  slots: SlotIn[];
  offerId: string;
  selectedRuleLabel?: string;   // conditional offers
  paymentRef?: string;          // "MEMBERSHIP" or "PAID.CASH"

  // for member/user
  userId?: string;
  userName?: string;
  userEmail?: string;

  // for guest
  guestName?: string;
  guestPhone?: string;
};

function toMin(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}
function withinRange(hhmm: string, from: string, to: string) {
  const v = toMin(hhmm), f = toMin(from), t = toMin(to);
  return !Number.isNaN(v) && !Number.isNaN(f) && !Number.isNaN(t) && v >= f && v <= t;
}
function randId(n = 6) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body.offerId) return NextResponse.json({ ok: false, error: "offerId is required" }, { status: 400 });
    if (!body.type) return NextResponse.json({ ok: false, error: "type is required" }, { status: 400 });
    if (!body.date) return NextResponse.json({ ok: false, error: "date is required" }, { status: 400 });
    if (!Array.isArray(body.slots) || !body.slots.length)
      return NextResponse.json({ ok: false, error: "At least one slot is required" }, { status: 400 });

    if (body.type === "member" || body.type === "user") {
      if (!body.userName || !body.userEmail) {
        return NextResponse.json({ ok: false, error: "userName and userEmail are required for member/user" }, { status: 400 });
      }
    }
    if (body.type === "guest") {
      if (!body.guestName || !body.guestPhone) {
        return NextResponse.json({ ok: false, error: "guestName and guestPhone are required for guest" }, { status: 400 });
      }
    }

    const Offer = await getOfferModel();
    const Booking = await BookingModel();

    const offer = await Offer.findById(body.offerId).lean();
    if (!offer || !offer.active) {
      return NextResponse.json({ ok: false, error: "Offer not found or inactive" }, { status: 404 });
    }

    // Date within offer window
    const selectedDate = new Date(`${body.date}T00:00:00.000Z`);
    if (!(selectedDate >= new Date(offer.dateFrom) && selectedDate <= new Date(offer.dateTo))) {
      return NextResponse.json({ ok: false, error: "Selected date is outside offer range" }, { status: 400 });
    }

    // Time window validation
    for (const s of body.slots) {
      if (!withinRange(s.start, offer.timeFrom, offer.timeTo) || !withinRange(s.end, offer.timeFrom, offer.timeTo)) {
        return NextResponse.json({ ok: false, error: "One or more slot times are outside offer hours" }, { status: 400 });
      }
    }

    // Pricing
    let perSlot = 0;
    if (body.type === "member") {
      perSlot = 0; // MEMBERSHIP = free
    } else {
      if (offer.type === "flat") {
        if (typeof offer.flatPrice !== "number")
          return NextResponse.json({ ok: false, error: "Offer missing flatPrice" }, { status: 400 });
        perSlot = Math.max(0, Math.round(offer.flatPrice));
      } else {
        const rule = (offer.rules || []).find((r) => r.label === body.selectedRuleLabel);
        if (!rule) return NextResponse.json({ ok: false, error: "Please select a valid rule" }, { status: 400 });
        perSlot = Math.max(0, Math.round(rule.price));
      }
    }
    const totalAmount = perSlot * body.slots.length;

    // Build doc
    const orderId = `admin_${Date.now()}_${randId()}`;
    const common = {
      orderId,
      date: body.date,
      slots: body.slots.map((s) => ({
        courtId: Number(s.courtId),
        start: s.start,
        end: s.end,
      })),
      amount: totalAmount,
      currency: "INR",
      status: "PAID",
      paymentRef: body.paymentRef || (body.type === "member" ? "MEMBERSHIP" : "PAID.CASH"),
      adminPaid: true,
    } as const;

    const doc = await Booking.create({
      ...common,
      userId: body.type !== "guest" ? (body.userId || undefined) : undefined,
      userName:
        body.type === "guest"
          ? body.guestName
          : (body.userName || "—"),
      userEmail:
        body.type === "guest"
          ? undefined
          : (body.userEmail || undefined),
    });

    return NextResponse.json({ ok: true, bookingId: String(doc._id), orderId });
  } catch (err: any) {
    console.error("special booking error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
