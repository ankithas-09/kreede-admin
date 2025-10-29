// app/api/bookings/member/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User";

type Slot = { courtId: number; start: string; end: string };
type Body = {
  date: string;          // "YYYY-MM-DD"
  slots: Slot[];         // [{ courtId, start, end }, ...]
  userEmail?: string;    // for lookup
  userId?: string;       // your username field on User (fallback lookup)
  userName?: string;     // optional display name to store on booking row
};

function genMemFreeOrderId() {
  return `memfree_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const { date, slots, userEmail, userId, userName } = body || {};

    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });
    if (!Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: "No slots selected" }, { status: 400 });
    }
    if (!userEmail && !userId) {
      return NextResponse.json({ error: "Need userEmail or userId to resolve membership" }, { status: 400 });
    }

    // Resolve users._id (memberships store users._id as string in membership.userId)
    const User = await UserModel();
    const userDoc = await User.findOne({
      $or: [
        ...(userEmail ? [{ email: String(userEmail).toLowerCase() }] : []),
        ...(userId ? [{ userId }] : []), // your username field
      ],
    }).lean();

    if (!userDoc?._id) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    const userObjectIdStr = String(userDoc._id);

    // Atomically consume credits: require enough remaining (games - gamesUsed >= slots.length)
    const slotsCount = Math.max(1, slots.length);
    const Membership = await MembershipModel();
    const updated = await Membership.findOneAndUpdate(
      {
        userId: userObjectIdStr,
        status: "PAID",
        $expr: { $lte: ["$gamesUsed", { $subtract: ["$games", slotsCount] }] },
      },
      [
        { $set: { gamesUsed: { $add: ["$gamesUsed", slotsCount] } } },
      ] as unknown as import("mongoose").UpdateWithAggregationPipeline,
      { new: true, sort: { createdAt: -1 } }
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Membership credits are over. Book as a user." },
        { status: 400 }
      );
    }

    // Create PAID membership booking
    const Booking = await BookingModel();
    const created = await Booking.create({
      orderId: genMemFreeOrderId(),     // e.g., "memfree_1760949124241_4jicdh"
      userId: userId || undefined,      // store your username if you keep it
      userName: userName || userDoc.name || "—",
      userEmail: userEmail ? String(userEmail).toLowerCase() : (userDoc.email || undefined),
      date,
      slots,
      amount: 0,
      currency: "INR",
      status: "PAID",
      paymentRef: "MEMBERSHIP",         // 🔴 key piece
      adminPaid: true,                  // hide "Mark Paid" button in UI

      // NEW metadata for table columns/filters
      bookingType: "Normal",            // member flow = normal (not special/individual)
      who: "member",
    });

    return NextResponse.json({ ok: true, id: String(created._id) });
  } catch (e) {
    console.error("member booking create error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
