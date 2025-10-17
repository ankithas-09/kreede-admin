// app/api/bookings/[id]/slot/route.ts
import { NextResponse } from "next/server";
import { BookingModel, type BookingDoc } from "@/models/Booking";
import { RefundModel } from "@/models/Refund";
import { MembershipModel } from "@/models/Membership";

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

// GET refund status (preferred + fallback)
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

/* ---------------- Utility helpers ---------------- */

type Slot = { courtId: number; start: string; end: string };

type BookingLean = Pick<
  BookingDoc,
  "_id" | "orderId" | "userId" | "userEmail" | "userName" | "amount" | "currency" | "paymentRef" | "date" | "slots"
> & { _id: string; slots: Slot[] | unknown[] };

function isMembershipBooking(b: { amount?: number; paymentRef?: string; orderId?: string } | null | undefined): boolean {
  const amount = Number(b?.amount ?? 0);
  const pr = String(b?.paymentRef ?? "").toUpperCase();
  const orderId = String(b?.orderId ?? "");
  return amount <= 0 || pr === "MEMBERSHIP" || !orderId;
}

// Decrement gamesUsed by exactly 1 (clamped at 0) atomically
async function restoreOneCreditAtomic(userId: string) {
  const Membership = await MembershipModel();
  const res = await Membership.updateOne(
    { userId, status: "PAID" },
    [
      {
        $set: {
          gamesUsed: {
            $max: [0, { $subtract: ["$gamesUsed", 1] }],
          },
        },
      },
    ]
  );
  return res.modifiedCount > 0;
}

/* ---------------- Route ---------------- */

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
    const Refund = await RefundModel(); // declare ONCE

    const booking = await Booking.findById(id).lean<BookingLean | null>();
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const slots: Slot[] = Array.isArray(booking.slots)
      ? (booking.slots as Slot[])
      : [];
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

    // Billing info
    const rawAmount = Number(booking.amount);
    const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
    const currency = booking.currency || "INR";
    const orderId = String(booking.orderId || "");
    const paymentRef = String(booking.paymentRef || "");
    const membership = isMembershipBooking(booking);

    // Target slot (we remove later on success)
    const targetSlot = slots[targetIdx];

    /* ---------------- MEMBERSHIP FLOW ---------------- */
    if (membership) {
      const sig = `${targetSlot.courtId}_${targetSlot.start}_${targetSlot.end}`;

      // Idempotency: avoid double-credit and double-ledger
      const exists = await Refund.findOne({
        kind: "booking_slot",
        bookingId: String(booking._id),
        "meta.slotSignature": sig,
      }).lean();
      if (!exists) {
        const created = await Refund.create({
          kind: "booking_slot",
          bookingId: String(booking._id),
          userId: (booking as unknown as { userId?: string }).userId,
          userEmail: (booking as unknown as { userEmail?: string }).userEmail,
          userName: (booking as unknown as { userName?: string }).userName,
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
            date: (booking as unknown as { date?: string | Date }).date,
            slot: targetSlot,
            slotSignature: sig,
            paymentRef,
            totalSlotsBefore: totalSlots,
          },
        });

        const ok = await restoreOneCreditAtomic(String((booking as unknown as { userId?: string }).userId || ""));
        if (ok) {
          await Refund.updateOne({ _id: created._id }, { $set: { membershipCreditRestored: true } });
        }
      }

      // Remove only this slot; delete booking if empty
      await Booking.updateOne(
        { _id: booking._id },
        {
          $pull: {
            slots: {
              courtId: targetSlot.courtId,
              start: targetSlot.start,
              end: targetSlot.end,
            },
          },
        }
      );

      const after = await Booking.findById(id).select({ slots: 1 }).lean<{ slots?: Slot[] } | null>();
      const noSlotsLeft = !after || !Array.isArray(after.slots) || after.slots.length === 0;
      if (noSlotsLeft) await Booking.findByIdAndDelete(id);

      return NextResponse.json({
        ok: true,
        action: "slot_cancelled",
        refundStatus: "NO_REFUND_REQUIRED",
      });
    }

    /* ---------------- PAID FLOW ---------------- */
    // Compute per-slot refund; do NOT mutate DB yet.
    const perSlotRefund = amount > 0 && totalSlots > 0 ? Number((amount / totalSlots).toFixed(2)) : 0;
    if (perSlotRefund <= 0) {
      return NextResponse.json({ error: "Calculated refund amount is zero or invalid" }, { status: 400 });
    }

    // 1) Create refund
    const cf = await createCashfreeRefund({
      orderId,
      amount: perSlotRefund,
      note: `Admin cancel booking slot for booking ${id}`,
    });

    // 2) If Cashfree replied PENDING, poll status a few times before giving up
    let finalStatus = (cf.refundStatus || "").toUpperCase();
    const refundId = cf.refundId;

    if (finalStatus !== "SUCCESS") {
      const delays = [500, 900, 1300]; // quick retries (ms)
      for (const d of delays) {
        await sleep(d);
        const s = await fetchCashfreeRefundStatus(orderId, refundId);
        finalStatus = (s || "PENDING").toUpperCase();
        if (finalStatus === "SUCCESS") break;
      }
    }

    if (finalStatus !== "SUCCESS") {
      // Still not success → do not mutate booking
      return NextResponse.json(
        {
          error: "Refund not successful yet",
          status: finalStatus,
        },
        { status: 409 }
      );
    }

    // 3) Write refund row (SUCCESS) → refunds collection
    await Refund.create({
      kind: "booking_slot",
      bookingId: String(booking._id),
      userId: (booking as unknown as { userId?: string }).userId,
      userEmail: (booking as unknown as { userEmail?: string }).userEmail,
      userName: (booking as unknown as { userName?: string }).userName,
      amount: perSlotRefund,
      currency,
      reason: "Admin cancel slot",
      refundId: refundId,
      cfRefundId: cf.cfRefundId || undefined,
      cfPaymentId: cf.cfPaymentId || undefined,
      orderId,
      refundStatus: "SUCCESS", // ✅ now allowed in schema
      status: "SUCCESS",
      statusDescription: cf.statusDescription,
      gateway: "CASHFREE",
      membershipCreditRestored: false,
      meta: {
        date: (booking as unknown as { date?: string | Date }).date,
        slot: targetSlot,
        totalSlotsBefore: totalSlots,
      },
    });

    // 4) Remove only this slot and decrement amount; delete doc if empty
    await Booking.updateOne(
      { _id: booking._id },
      {
        $pull: {
          slots: {
            courtId: targetSlot.courtId,
            start: targetSlot.start,
            end: targetSlot.end,
          },
        },
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
