// app/api/bookings/admin/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";
import { MembershipModel } from "@/models/Membership";

const SLOT_PRICE = 500; // INR per slot for non-members

function genAdminOrderId() {
  return `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type Slot = { courtId: number; start: string; end: string };

type AdminCreateBody = {
  type?: "member" | "user" | "guest";
  date?: string;              // YYYY-MM-DD
  slots?: Slot[];             // [{ courtId, start, end }]
  markPaid?: boolean;         // admin pressed Paid button
  userId?: string;
  userName?: string;
  userEmail?: string;
  guestName?: string;
  guestPhone?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as AdminCreateBody;
    const {
      type,
      date,
      slots,
      markPaid,
      userId,
      userName,
      userEmail,
      guestName,
      guestPhone,
    } = body || {};

    // ---- validation ----
    if (!Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: "No slots selected" }, { status: 400 });
    }
    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

    const isMember = type === "member";
    const isUser   = type === "user";
    const isGuest  = type === "guest";

    if ((isMember || isUser) && !userEmail) {
      return NextResponse.json({ error: "User email is required" }, { status: 400 });
    }
    if (isGuest && (!guestName || !guestPhone)) {
      return NextResponse.json({ error: "Guest name and phone are required" }, { status: 400 });
    }

    // ---- models ----
    const Booking = await BookingModel();
    const GuestBooking = await GuestBookingModel();

    // ---- billing ----
    const totalAmount = isMember ? 0 : Number(slots.length * SLOT_PRICE);
    const currency = "INR";

    // adminPaid: members + “Create & Mark Paid” => true; “Create (Pending)” => false
    const adminPaid = isMember ? true : !!markPaid;

    // paymentRef:
    // - Member: MEMBERSHIP
    // - Non-member (user/guest):
    //     * markPaid -> PAID.CASH
    //     * pending  -> UNPAID.CASH
    const paymentRef =
      isMember ? "MEMBERSHIP" : (markPaid ? "PAID.CASH" : "UNPAID.CASH");

    // Always set a unique orderId for admin-created bookings
    const orderId = genAdminOrderId();

    // ---- create booking in the correct collection ----
    if (isGuest) {
      const created = await GuestBooking.create({
        orderId,
        userName: guestName || "Guest",
        date,
        slots,
        amount: totalAmount,
        currency,
        status: "PAID",        // stored as PAID (your admin flow)
        paymentRef,            // "PAID.CASH" or "UNPAID.CASH"
        adminPaid,             // false when pending, true when marked paid
      });
      return NextResponse.json({ ok: true, id: String(created._id) });
    }

    // regular (member/user) bookings go to main bookings collection
    const created = await Booking.create({
      orderId,
      userId:   isMember ? (userId || undefined) : (isUser ? userId || undefined : undefined),
      userName: userName || (isMember ? "—" : "—"),
      userEmail: (userEmail ? String(userEmail).toLowerCase() : undefined),
      date,
      slots,
      amount:   totalAmount,
      currency,
      status:   "PAID",        // stored as PAID; adminPaid governs paid/unpaid in UI
      paymentRef,              // "PAID.CASH" or "UNPAID.CASH" for non-members; "MEMBERSHIP" for members
      adminPaid,               // false when pending
    });

    // Members: consume credits = number of slots
    if (isMember && userId) {
      const Membership = await MembershipModel();
      await Membership.updateOne(
        { userId, status: "PAID" },
        { $inc: { gamesUsed: slots.length } }
      );
    }

    return NextResponse.json({ ok: true, id: String(created._id) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("admin bookings create error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
