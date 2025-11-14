// app/api/bookings/admin/route.ts
import { NextResponse } from "next/server";
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User";
import { bookingToRows, appendRows } from "@/lib/googleSheets"; // ⬅️ Sheets helper

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
  guestPhone?: string;        // phone collected in UI for guest

  // Existing pricing selector
  pricingMode?: "court" | "individual" | "individual2"; // ⬅️ NEW

  // 🔵 Offer booking (optional)
  offerId?: string;                 // selected offer _id
  offerName?: string;               // label (for UI/export context)
  offerConditionKeys?: string[];    // ids/keys of checked conditions
  offerUnitPrice?: number;          // per-slot price for this offer
  offerTotal?: number;              // explicit total (bundle) if applicable
};

/**
 * Parse "YYYY-MM-DD" to a UTC Date (midnight) and return the day of week using UTC (0=Sun, 6=Sat).
 */
function getUTCDayFromYMD(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  if (!y || !m || !d) return NaN;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay(); // 0 (Sun) .. 6 (Sat)
}

/** Weekend pricing: Sat/Sun = 700, otherwise 500 */
function getCourtSlotPrice(dateYMD: string): number {
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
      pricingMode = "court",

      // Offer inputs (optional)
      offerId,
      offerName,
      offerConditionKeys,
      offerUnitPrice,
      offerTotal,
    } = body || {};

    // ---- validation ----
    if (!Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: "No slots selected" }, { status: 400 });
    }
    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

    // ✅ Narrow once, then only use dateStr below
    const dateStr: string = date;

    const isMember = type === "member";
    const isUser   = type === "user";
    const isGuest  = type === "guest";
    const isOffer  = Boolean(offerId);

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
    const slotsCount = Math.max(1, slots.length);

    function computeNonMemberTotal(): number {
      // Offer branch
      if (isOffer) {
        if (typeof offerTotal === "number" && Number.isFinite(offerTotal)) {
          return Math.max(0, Math.round(offerTotal));
        }
        if (typeof offerUnitPrice === "number" && Number.isFinite(offerUnitPrice)) {
          return Math.max(0, Math.round(offerUnitPrice * slotsCount));
        }
        // If offer provided without numbers, gracefully fall back
      }

      // Fallback to normal modes
      const perSlot =
        pricingMode === "individual"
          ? 150
          : pricingMode === "individual2"
            ? 300
            : getCourtSlotPrice(dateStr);
      return Math.max(0, Math.round(perSlot * slotsCount));
    }

    const totalAmount = isMember ? 0 : computeNonMemberTotal();
    const currency = "INR";

    // adminPaid: members + “Create & Mark Paid” => true; “Create (Pending)” => false
    const adminPaid = isMember ? true : !!markPaid;

    // paymentRef:
    // - Member: MEMBERSHIP
    // - Offer (non-member):  PAID.OFFER / UNPAID.OFFER
    // - Otherwise (non-member): PAID.CASH / UNPAID.CASH
    const paymentRef = isMember
      ? "MEMBERSHIP"
      : isOffer
        ? (markPaid ? "PAID.OFFER" : "UNPAID.OFFER")
        : (markPaid ? "PAID.CASH" : "UNPAID.CASH");

    // Always set a unique orderId for admin-created bookings
    // If an offer is used, append a suffix to help traceability without schema changes.
    let orderId = genAdminOrderId();
    if (isOffer && offerId) {
      orderId = `${orderId}__offer_${offerId}`;
    }

    // -----------------------------------------------------------------------
    // MEMBERSHIP CREDIT GUARD (1 per slot) — Block if not enough credits
    // -----------------------------------------------------------------------
    let reservedCredits = false;
    let memberUserObjectId = "";

    let phoneForSheet: string = ""; // we’ll try to fill this for member/user

    if (isMember) {
      const User = await UserModel();
      const userDoc = await User.findOne({
        $or: [
          { email: String(userEmail || "").toLowerCase() },
          { userId: userId || "" },
        ],
      }).lean();

      if (!userDoc?._id) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }
      memberUserObjectId = String(userDoc._id);
      phoneForSheet = String(userDoc.phone || "");

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
        return NextResponse.json(
          { error: "Membership credits are over. Book as a user." },
          { status: 400 }
        );
      }

      reservedCredits = true;
    } else if (isUser) {
      // Try to resolve phone via User collection for regular users
      try {
        const User = await UserModel();
        const u = await User.findOne({
          $or: [
            { email: String(userEmail || "").toLowerCase() },
            ...(userId ? [{ userId }] : []),
          ],
        }).select({ phone: 1 }).lean();
        phoneForSheet = String(u?.phone || "");
      } catch { /* ignore */ }
    }

    // ⬇️ NEW: derive bookingType + who for persistence
    const bookingType: "Normal" | "Individual" | "Special" =
      isOffer
        ? "Special"
        : (pricingMode === "individual" || pricingMode === "individual2" ? "Individual" : "Normal");

    const whoField: "member" | "user" | "guest" =
      isMember ? "member" : (isUser ? "user" : "guest");

    // ---- create booking in the correct collection ----
    try {
      if (isGuest) {
        const created = await GuestBooking.create({
          orderId,
          userName: guestName || "Guest",
          phone_number: guestPhone,
          date: dateStr,
          slots,
          amount: totalAmount,
          currency,
          status: "PAID",
          paymentRef,
          adminPaid,

          // ⬇️ NEW metadata
          bookingType,
          who: whoField,
        });

        // ---- Google Sheets append (guest) ----
        try {
          const rows = bookingToRows({
            userName: created.userName || "Guest",
            phone: String(created.phone_number || ""),
            date: dateStr,
            paymentRef,
            adminPaid,
            totalAmount,
            slots: slots || [],
            bookingType,
            who: whoField,
            bookingId: orderId, // ⬅️ store orderId in "Booking ID" column
          });
          await appendRows(rows);
        } catch (sheetErr) {
          console.error("Sheets append (guest admin) failed:", sheetErr);
        }

        return NextResponse.json({ ok: true, id: String(created._id) });
      }

      const created = await Booking.create({
        orderId,
        userId:   isMember ? (userId || undefined) : (isUser ? userId || undefined : undefined),
        userName: userName || (isMember ? "—" : "—"),
        userEmail: (userEmail ? String(userEmail).toLowerCase() : undefined),
        date: dateStr,
        slots,
        amount:   totalAmount,
        currency,
        status:   "PAID",
        paymentRef,
        adminPaid,

        // ⬇️ NEW metadata
        bookingType,
        who: whoField,
      });

      // ---- Google Sheets append (member/user) ----
      try {
        const rows = bookingToRows({
          userName: created.userName || "—",
          phone: phoneForSheet, // may be blank if not found
          date: dateStr,
          paymentRef,
          adminPaid,
          totalAmount,
          slots: slots || [],
          bookingType,
          who: whoField,
          bookingId: orderId, // ⬅️ store orderId here
        });
        await appendRows(rows);
      } catch (sheetErr) {
        console.error("Sheets append (admin user/member) failed:", sheetErr);
      }

      return NextResponse.json({ ok: true, id: String(created._id) });
    } catch (createErr) {
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
