// app/api/bookings/admin/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { MembershipModel } from "@/models/Membership";

const SLOT_PRICE = 500; // INR per slot for non-members

function genAdminOrderId() {
  // unique, human-readable order id for admin-created bookings
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
      type,               // "member" | "user" | "guest"
      date,               // YYYY-MM-DD
      slots,              // [{ courtId, start, end }]
      markPaid,           // boolean (admin pressed Paid button)
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

    const Booking = await BookingModel();

    // ---- billing ----
    const totalAmount = isMember ? 0 : Number(slots.length * SLOT_PRICE);
    const currency = "INR";

    // adminPaid: members and "Create & Mark Paid" => true; "Create (Pending)" => false
    const adminPaid = isMember ? true : !!markPaid;

    // paymentRef: MEMBERSHIP for members; otherwise CASH (admin handled)
    const paymentRef = isMember ? "MEMBERSHIP" : "CASH";

    // ✅ Always set a unique orderId for admin-created bookings to avoid E11000 on null
    const orderId = genAdminOrderId();

    // ---- create booking ----
    const created = await Booking.create({
      orderId,
      userId:   isGuest ? undefined : (userId || undefined),
      userName: isGuest ? (guestName || "Guest") : (userName || "—"),
      userEmail:isGuest ? undefined : (userEmail ? String(userEmail).toLowerCase() : undefined),
      date,
      slots,
      amount:   totalAmount,
      currency,
      status:   "PAID",     // stored as PAID as per your requirement
      paymentRef,
      adminPaid,            // admin-visible flag (true if marked paid)
    });

    // ---- members: increment gamesUsed by number of slots ----
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
