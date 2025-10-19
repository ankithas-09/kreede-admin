// app/api/bookings/admin/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User";

// 🔁 Unique admin order ids
function genAdminOrderId() {
  return `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type Slot = { courtId: number; start: string; end: string };

type AdminCreateBody = {
  type?: "member" | "user" | "guest";
  date?: string;              // YYYY-MM-DD
  slots?: Slot[];             // [{ courtId, start, end }]
  markPaid?: boolean;         // admin pressed Paid button
  userId?: string;            // (often a username in your payload)
  userName?: string;
  userEmail?: string;
  guestName?: string;
  guestPhone?: string;
};

/**
 * Parse "YYYY-MM-DD" to a UTC Date (midnight) and return the day of week using UTC (0=Sun, 6=Sat).
 * This avoids timezone ambiguity from Date("YYYY-MM-DD") which can shift days based on server TZ.
 */
function getUTCDayFromYMD(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  if (!y || !m || !d) return NaN;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay(); // 0 (Sun) .. 6 (Sat)
}

/** Weekend pricing: Sat/Sun = 700, otherwise 500 */
function getSlotPrice(dateYMD: string): number {
  const dow = getUTCDayFromYMD(dateYMD);
  if (Number.isNaN(dow)) return 500; // safe fallback
  return dow === 0 || dow === 6 ? 700 : 500;
}

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
    const slotsCount = Math.max(1, slots.length); // credits to consume for members
    const perSlot = getSlotPrice(date);           // 500 weekdays, 700 weekends
    const totalAmount = isMember ? 0 : Number(slotsCount * perSlot);
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

    // -----------------------------------------------------------------------
    // MEMBERSHIP CREDIT GUARD (1 per slot) — Block if not enough credits
    // -----------------------------------------------------------------------
    // Reserve credits atomically; roll back if booking creation fails.
    let reservedCredits = false;
    let memberUserObjectId = "";

    if (isMember) {
      // Resolve users._id (Membership.userId stores users._id as string)
      const User = await UserModel();
      const userDoc = await User.findOne({
        $or: [
          { email: String(userEmail || "").toLowerCase() },
          { userId: userId || "" }, // username stored on User.userId
        ],
      }).lean();

      if (!userDoc?._id) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }
      memberUserObjectId = String(userDoc._id);

      // Conditionally increment gamesUsed ONLY if enough remaining credits exist.
      // Filter condition: gamesUsed <= (games - slotsCount)
      const Membership = await MembershipModel();
      const updated = await Membership.findOneAndUpdate(
        {
          userId: memberUserObjectId,
          status: "PAID",
          $expr: {
            $lte: ["$gamesUsed", { $subtract: ["$games", slotsCount] }],
          },
        },
        [
          {
            $set: {
              gamesUsed: { $add: ["$gamesUsed", slotsCount] },
            },
          },
        ] as unknown as import("mongoose").UpdateWithAggregationPipeline,
        { new: true, sort: { createdAt: -1 } }
      );

      if (!updated) {
        // Not enough credits OR no PAID membership found
        return NextResponse.json(
          { error: "Membership credits are over. Book as a user." },
          { status: 400 }
        );
      }

      reservedCredits = true;
    }

    // ---- create booking in the correct collection ----
    try {
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

      return NextResponse.json({ ok: true, id: String(created._id) });
    } catch (createErr) {
      // If booking creation fails AFTER reserving credits, roll back.
      if (reservedCredits && memberUserObjectId) {
        try {
          const Membership = await MembershipModel();
          await Membership.findOneAndUpdate(
            { userId: memberUserObjectId, status: "PAID" },
            [
              {
                $set: {
                  gamesUsed: {
                    $max: [0, { $subtract: ["$gamesUsed", slotsCount] }],
                  },
                },
              },
            ] as unknown as import("mongoose").UpdateWithAggregationPipeline,
            { new: true, sort: { createdAt: -1 } }
          );
        } catch (rollbackErr) {
          console.error("Rollback membership credits failed:", rollbackErr);
        }
      }
      throw createErr;
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("admin bookings create error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
