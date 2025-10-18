// app/api/bookings/[id]/slot/route.ts
import { NextResponse } from "next/server";
import { BookingModel, type BookingDoc } from "@/models/Booking";
import { GuestBookingModel, type GuestBookingDoc } from "@/models/GuestBooking";
import { RefundModel } from "@/models/Refund";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User"; // ⬅️ added

/* ---------------- Cashfree helpers ---------------- */
function cashfreeBase() {
  const env = (process.env.CASHFREE_ENV || "sandbox").toLowerCase();
  return env === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}
type CashfreeCreatedRefund = {
  refundId: string;
  refundStatus: string;
  cfRefundId: string;
  cfPaymentId: string;
  statusDescription: string;
  raw: unknown;
};
async function createCashfreeRefund(params: { orderId: string; amount: number; note?: string }): Promise<CashfreeCreatedRefund> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  const apiVersion = process.env.CASHFREE_API_VERSION || "2023-08-01";
  if (!appId || !secretKey) throw new Error("Cashfree credentials missing.");

  const refundId = `refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `${cashfreeBase()}/orders/${encodeURIComponent(params.orderId)}/refunds`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": appId,
      "x-client-secret": secretKey,
      "x-api-version": apiVersion,
    },
    body: JSON.stringify({
      refund_amount: params.amount,
      refund_id: refundId,
      refund_note: params.note || "Admin cancel (slot)",
      refund_speed: "STANDARD",
    }),
    cache: "no-store",
  });

  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      (typeof data === "object" && data && "message" in data && String((data as Record<string, unknown>).message)) ||
      (typeof data === "object" && data && "error" in data && String((data as Record<string, unknown>).error)) ||
      `Cashfree refund failed (HTTP ${res.status})`;
    const err = new Error(message) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }

  const node: Record<string, unknown> =
    Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null
      ? (data[0] as Record<string, unknown>)
      : (data as Record<string, unknown>);

  return {
    refundId,
    refundStatus: String(node?.refund_status ?? "PENDING"),
    cfRefundId: String(node?.cf_refund_id ?? ""),
    cfPaymentId: String(node?.cf_payment_id ?? ""),
    statusDescription: String(node?.status_description ?? ""),
    raw: data,
  };
}
async function fetchCashfreeRefundStatus(orderId: string, refundId: string): Promise<string> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  const apiVersion = process.env.CASHFREE_API_VERSION || "2023-08-01";
  const headers = {
    "x-client-id": appId || "",
    "x-client-secret": secretKey || "",
    "x-api-version": apiVersion,
  };
  const base = cashfreeBase();

  // Preferred
  let res = await fetch(`${base}/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (res.ok) {
    const d: unknown = await res.json().catch(() => ({}));
    const node =
      Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null
        ? (d[0] as Record<string, unknown>)
        : (d as Record<string, unknown>);
    return String(node?.refund_status ?? "PENDING");
  }

  // Fallback
  res = await fetch(`${base}/refunds/${encodeURIComponent(refundId)}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (res.ok) {
    const d: unknown = await res.json().catch(() => ({}));
    const node =
      Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null
        ? (d[0] as Record<string, unknown>)
        : (d as Record<string, unknown>);
    return String(node?.refund_status ?? "PENDING");
  }

  return "PENDING";
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Helpers ---------------- */
type Slot = { courtId: number; start: string; end: string };
type BookingLean = Pick<
  BookingDoc,
  "_id" | "orderId" | "userId" | "userEmail" | "userName" | "amount" | "currency" | "paymentRef" | "date" | "slots"
> & { _id: string; slots: Slot[] | unknown[] };
type GuestLean = Pick<
  GuestBookingDoc,
  "_id" | "orderId" | "userName" | "amount" | "currency" | "paymentRef" | "date" | "slots"
> & { _id: string; slots: Slot[] | unknown[] };

function isNonGatewayBooking(b: { amount?: number; paymentRef?: string; orderId?: string } | null | undefined): boolean {
  const amount  = Number(b?.amount ?? 0);
  const ref     = String(b?.paymentRef ?? "").toUpperCase();
  const orderId = String(b?.orderId ?? "");
  return amount <= 0 || ref === "MEMBERSHIP" || ref === "CASH" || !orderId || orderId.startsWith("admin_");
}

// ⬇️ NEW: resolve users._id from email or username, then restore exactly 1 credit atomically
async function restoreOneCreditAtomicByEmailOrUsername(userEmail?: string, usernameHint?: string) {
  const User = await UserModel();
  const userDoc = await User.findOne({
    $or: [
      ...(userEmail ? [{ email: String(userEmail).toLowerCase() }] : []),
      ...(usernameHint ? [{ userId: usernameHint }] : []),
    ],
  }).lean();

  if (!userDoc?._id) return false;

  const Membership = await MembershipModel();
  const res = await Membership.updateOne(
    { userId: String(userDoc._id), status: "PAID" },
    [
      {
        $set: {
          gamesUsed: {
            $max: [0, { $subtract: ["$gamesUsed", 1] }],
          },
        },
      },
    ] as unknown as import("mongoose").UpdateWithAggregationPipeline
  );
  return res.modifiedCount > 0;
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const payload = (await req.json().catch(() => ({}))) as Partial<{
      slotIndex: number;
      courtId: number;
      start: string;
      end: string;
    }>;
    const slotIndex = Number.isInteger(payload.slotIndex) ? Number(payload.slotIndex) : -1;
    const courtId = typeof payload.courtId === "number" ? payload.courtId : undefined;
    const start = typeof payload.start === "string" ? payload.start : undefined;
    const end = typeof payload.end === "string" ? payload.end : undefined;

    if (slotIndex < 0 && (!courtId || !start || !end)) {
      return NextResponse.json({ error: "Provide slotIndex or (courtId, start, end)" }, { status: 400 });
    }

    const Booking = await BookingModel();
    const GuestBooking = await GuestBookingModel();
    const Refund = await RefundModel();

    const booking = await Booking.findById(id).lean<BookingLean | null>();
    const guest = booking ? null : await GuestBooking.findById(id).lean<GuestLean | null>();
    if (!booking && !guest) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const doc = (booking ?? guest)!;
    const isGuest = !!guest;

    const slots: Slot[] = Array.isArray(doc.slots) ? (doc.slots as Slot[]) : [];
    const totalSlots = slots.length;

    let targetIdx = slotIndex;
    if (targetIdx < 0) {
      targetIdx = slots.findIndex(
        (s) =>
          (courtId == null || s.courtId === courtId) &&
          (start == null || s.start === start) &&
          (end == null || s.end === end)
      );
    }
    if (targetIdx < 0 || targetIdx >= totalSlots) {
      return NextResponse.json({ error: "Slot not found in booking" }, { status: 404 });
    }

    const rawAmount = Number(doc.amount);
    const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
    const currency = doc.currency || "INR";
    const orderId = String(doc.orderId || "");
    const paymentRef = String((booking ? booking.paymentRef : guest?.paymentRef) || "");

    const targetSlot = slots[targetIdx];

    // Membership / free (no gateway) → restore 1 credit
    if (!isGuest && (amount <= 0 || paymentRef.toUpperCase() === "MEMBERSHIP" || !orderId)) {
      const sig = `${targetSlot.courtId}_${targetSlot.start}_${targetSlot.end}`;
      const exists = await Refund.findOne({
        kind: "booking_slot",
        bookingId: String((doc as { _id: string })._id),
        "meta.slotSignature": sig,
      }).lean();
      if (!exists) {
        const created = await Refund.create({
          kind: "booking_slot",
          bookingId: String((doc as { _id: string })._id),
          userId: booking ? (booking as { userId?: string }).userId : undefined,
          userEmail: booking ? (booking as { userEmail?: string }).userEmail : undefined,
          userName: booking ? (booking as { userName?: string }).userName : undefined,
          amount: 0,
          currency,
          reason: "Membership slot cancel",
          refundStatus: "NO_REFUND_REQUIRED",
          status: "NO_REFUND_REQUIRED",
          statusDescription: "Membership/free booking slot cancellation",
          orderId: orderId || undefined,
          gateway: "NONE",
          membershipCreditRestored: false,
          meta: {
            date: (doc as { date?: string }).date,
            slot: targetSlot,
            slotSignature: sig,
            paymentRef,
            totalSlotsBefore: totalSlots,
          },
        });

        // ⬇️ Restore 1 credit to the correct membership using email/username -> users._id
        const ok = await restoreOneCreditAtomicByEmailOrUsername(
          booking ? (booking as { userEmail?: string }).userEmail : undefined,
          booking ? (booking as { userId?: string }).userId : undefined
        );
        if (ok) {
          await Refund.updateOne({ _id: created._id }, { $set: { membershipCreditRestored: true } });
        }
      }

      await Booking.updateOne(
        { _id: (doc as { _id: string })._id },
        { $pull: { slots: { courtId: targetSlot.courtId, start: targetSlot.start, end: targetSlot.end } } }
      );
      const after = await Booking.findById(id).select({ slots: 1 }).lean<{ slots?: Slot[] } | null>();
      const noSlotsLeft = !after || !Array.isArray(after.slots) || after.slots.length === 0;
      if (noSlotsLeft) await Booking.findByIdAndDelete(id);

      return NextResponse.json({ ok: true, action: "slot_cancelled", refundStatus: "NO_REFUND_REQUIRED" });
    }

    // Guest or Admin CASH (non-gateway)
    if (isNonGatewayBooking(doc)) {
      const perSlotRefund = amount > 0 && totalSlots > 0 ? Number((amount / totalSlots).toFixed(2)) : 0;

      await Refund.create({
        kind: "booking_slot",
        bookingId: String((doc as { _id: string })._id),
        userName: booking ? (booking as { userName?: string }).userName : (guest as { userName: string }).userName,
        userId: booking ? (booking as { userId?: string }).userId : undefined,
        userEmail: booking ? (booking as { userEmail?: string }).userEmail : undefined,
        amount: perSlotRefund,
        currency,
        reason: isGuest ? "Guest booking slot cancel (offline refund)" : "Admin CASH slot cancel",
        refundStatus: "NO_REFUND_REQUIRED",
        status: "NO_REFUND_REQUIRED",
        statusDescription: "No payment gateway refund required",
        orderId,
        gateway: "NONE",
        membershipCreditRestored: false,
        meta: {
          isGuest,
          date: (doc as { date?: string }).date,
          slot: targetSlot,
          totalSlotsBefore: totalSlots,
        },
      });

      if (isGuest) {
        await GuestBooking.updateOne(
          { _id: (doc as { _id: string })._id },
          {
            $pull: { slots: { courtId: targetSlot.courtId, start: targetSlot.start, end: targetSlot.end } },
            ...(amount > 0 && totalSlots > 0 ? { $inc: { amount: -Number((amount / totalSlots).toFixed(2)) } } : {}),
          }
        );
        const after = await GuestBooking.findById(id).select({ slots: 1 }).lean<{ slots?: Slot[] } | null>();
        const noSlotsLeft = !after || !Array.isArray(after.slots) || after.slots.length === 0;
        if (noSlotsLeft) await GuestBooking.findByIdAndDelete(id);
      } else {
        await Booking.updateOne(
          { _id: (doc as { _id: string })._id },
          {
            $pull: { slots: { courtId: targetSlot.courtId, start: targetSlot.start, end: targetSlot.end } },
            ...(amount > 0 && totalSlots > 0 ? { $inc: { amount: -Number((amount / totalSlots).toFixed(2)) } } : {}),
          }
        );
        const after = await Booking.findById(id).select({ slots: 1 }).lean<{ slots?: Slot[] } | null>();
        const noSlotsLeft = !after || !Array.isArray(after.slots) || after.slots.length === 0;
        if (noSlotsLeft) await Booking.findByIdAndDelete(id);
      }

      return NextResponse.json({
        ok: true,
        action: "slot_cancelled",
        refunded: amount > 0 && totalSlots > 0 ? Number((amount / totalSlots).toFixed(2)) : 0,
        currency,
        refundStatus: "NO_REFUND_REQUIRED",
      });
    }

    // Customer online booking → Cashfree (per-slot refund)
    const perSlotRefund = amount > 0 && totalSlots > 0 ? Number((amount / totalSlots).toFixed(2)) : 0;
    if (perSlotRefund <= 0) {
      return NextResponse.json({ error: "Calculated refund amount is zero or invalid" }, { status: 400 });
    }

    const cf = await createCashfreeRefund({
      orderId,
      amount: perSlotRefund,
      note: `Admin cancel booking slot for booking ${id}`,
    });

    // If not success, do quick poll
    let finalStatus = (cf.refundStatus || "").toUpperCase();
    const refundId = cf.refundId;
    if (finalStatus !== "SUCCESS") {
      const delays = [500, 900, 1300];
      for (const d of delays) {
        await sleep(d);
        const s = await fetchCashfreeRefundStatus(orderId, refundId);
        finalStatus = (s || "PENDING").toUpperCase();
        if (finalStatus === "SUCCESS") break;
      }
    }

    if (finalStatus !== "SUCCESS") {
      return NextResponse.json({ error: "Refund not successful yet", status: finalStatus }, { status: 409 });
    }

    await Refund.create({
      kind: "booking_slot",
      bookingId: String((doc as { _id: string })._id),
      userId: booking ? (booking as { userId?: string }).userId : undefined,
      userEmail: booking ? (booking as { userEmail?: string }).userEmail : undefined,
      userName: booking ? (booking as { userName?: string }).userName : undefined,
      amount: perSlotRefund,
      currency,
      reason: "Admin cancel slot",
      refundId,
      cfRefundId: cf.cfRefundId || undefined,
      cfPaymentId: cf.cfPaymentId || undefined,
      orderId,
      refundStatus: "SUCCESS",
      status: "SUCCESS",
      statusDescription: cf.statusDescription,
      gateway: "CASHFREE",
      membershipCreditRestored: false,
      meta: {
        date: (doc as { date?: string }).date,
        slot: targetSlot,
        totalSlotsBefore: totalSlots,
      },
    });

    // Pull the slot and decrement amount; delete if empty
    await Booking.updateOne(
      { _id: (doc as { _id: string })._id },
      {
        $pull: { slots: { courtId: targetSlot.courtId, start: targetSlot.start, end: targetSlot.end } },
        $inc: { amount: -perSlotRefund },
      }
    );
    const after = await Booking.findById(id).select({ slots: 1 }).lean<{ slots?: Slot[] } | null>();
    const noSlotsLeft = !after || !Array.isArray(after.slots) || after.slots.length === 0;
    if (noSlotsLeft) await Booking.findByIdAndDelete(id);

    return NextResponse.json({
      ok: true,
      action: "slot_cancelled",
      refunded: perSlotRefund,
      currency,
      refundStatus: "SUCCESS",
    });
  } catch (e: unknown) {
    const errObj = e as { message?: string; status?: number; data?: unknown };
    const status = typeof errObj?.status === "number" ? errObj.status : 500;
    const message = typeof errObj?.message === "string" ? errObj.message : "Server error";
    const details = errObj?.data;
    console.error("Cancel booking SLOT error:", e);
    return NextResponse.json({ error: message, details }, { status });
  }
}
