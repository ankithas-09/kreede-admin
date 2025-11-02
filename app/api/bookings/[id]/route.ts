// app/api/bookings/[id]/route.ts
import { NextResponse } from "next/server";
import { BookingModel, type BookingDoc } from "@/models/Booking";
import { GuestBookingModel, type GuestBookingDoc } from "@/models/GuestBooking";
import { RefundModel } from "@/models/Refund";
import { appendCancellations, type CancelRowIn } from "@/lib/googleSheets";

/* ---------------- Cashfree helpers ---------------- */
function cashfreeBase() {
  const env = (process.env.CASHFREE_ENV || "sandbox").toLowerCase();
  return env === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

type CashfreeRefundResponse = {
  refundId: string;
  refundStatus: string;
  cfRefundId: string;
  cfPaymentId: string;
  statusDescription: string;
  raw: unknown;
};

async function createCashfreeRefund(params: { orderId: string; amount: number; note?: string }): Promise<CashfreeRefundResponse> {
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
      refund_amount: params.amount, // must be > 0
      refund_id: refundId,
      refund_note: params.note || "Admin cancel",
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

/* ---------------- Mapping helpers ---------------- */
function toLegacyRefundStatus(cf: string): "REFUND_SUCCESS" | "REFUND_FAILED" | "PENDING" {
  const up = cf.toUpperCase();
  if (up.includes("SUCCESS")) return "REFUND_SUCCESS";
  if (up.includes("FAIL")) return "REFUND_FAILED";
  return "PENDING";
}
function toUnifiedStatus(cf: string): "SUCCESS" | "FAILED" | "PENDING" {
  const up = cf.toUpperCase();
  if (up.includes("SUCCESS")) return "SUCCESS";
  if (up.includes("FAIL")) return "FAILED";
  return "PENDING";
}

/* ---------------- Helpers ---------------- */
function isNonGatewayBooking(b: { amount?: number; paymentRef?: string; orderId?: string } | null | undefined): boolean {
  const amount  = Number(b?.amount ?? 0);
  const ref     = String(b?.paymentRef ?? "").toUpperCase();
  const orderId = String(b?.orderId ?? "");
  return amount <= 0 || ref === "MEMBERSHIP" || ref === "CASH" || !orderId || orderId.startsWith("admin_");
}

type BookingLean = Pick<
  BookingDoc,
  "_id" | "orderId" | "userId" | "userEmail" | "userName" | "amount" | "currency" | "paymentRef" | "date" | "slots"
> & { _id: string };
type GuestLean = Pick<
  GuestBookingDoc,
  "_id" | "orderId" | "userName" | "amount" | "currency" | "paymentRef" | "date" | "slots"
> & { _id: string };

/** Derive "who" for Sheets logging without relying on schema extras */
function deriveWho(isGuest: boolean, paymentRef?: string): "member" | "user" | "guest" {
  if (isGuest) return "guest";
  const refUp = String(paymentRef || "").toUpperCase();
  if (refUp === "MEMBERSHIP") return "member";
  return "user";
}

/** Compute per-slot amount for logging rows */
function computePerSlotAmount(total?: number, slotsCount?: number): number | null {
  const t = Number(total);
  if (!Number.isFinite(t)) return null;
  const c = Number(slotsCount);
  if (!Number.isFinite(c) || c <= 0) return t;
  return Math.round(t / c);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const Booking = await BookingModel();
    const GuestBooking = await GuestBookingModel();
    const Refund = await RefundModel();

    const booking = await Booking.findById(id)
      .select({ orderId: 1, userId: 1, userEmail: 1, userName: 1, amount: 1, currency: 1, paymentRef: 1, date: 1, slots: 1 })
      .lean<BookingLean | null>();

    const guest = booking
      ? null
      : await GuestBooking.findById(id)
          .select({ orderId: 1, userName: 1, amount: 1, currency: 1, paymentRef: 1, date: 1, slots: 1 })
          .lean<GuestLean | null>();

    if (!booking && !guest) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const doc = (booking ?? guest)!;
    const isGuest = !!guest;

    const rawAmount = Number(doc.amount);
    const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
    const currency = doc.currency || "INR";
    const orderId = String(doc.orderId || "");
    const dateStr = (doc as { date?: string }).date || "—";
    const slots = (doc as { slots?: { courtId?: number; start?: string; end?: string }[] }).slots || [];
    const perSlot = computePerSlotAmount(doc.amount, slots.length);
    const paymentRef = (doc as { paymentRef?: string }).paymentRef || "—";
    const who = deriveWho(isGuest, paymentRef);

    // Direct cancel path (admin/member/guest)
    if (isNonGatewayBooking(doc)) {
      await Refund.create({
        kind: "booking_slot",
        bookingId: String(doc._id),
        userId: booking ? String(booking.userId || "") : undefined,
        userEmail: booking ? String(booking.userEmail || "") : undefined,
        userName: booking ? String(booking.userName || "") : (guest ? guest.userName : ""),
        amount,
        currency,
        reason: isGuest ? "Guest booking cancel (offline refund)" : "Admin/membership booking cancel",
        orderId,
        refundStatus: "NO_REFUND_REQUIRED",
        status: "NO_REFUND_REQUIRED",
        statusDescription: "No payment gateway refund required",
        gateway: "NONE",
        meta: {
          isGuest,
          date: dateStr,
          slots,
          mode: "full_booking_cancel",
        },
      });

      // Append one cancellation row per slot to Sheet 2 (NO_REFUND_REQUIRED)
      try {
        const rows: CancelRowIn[] = (slots.length ? slots : [{ courtId: null as number | null, start: "—", end: "—" }]).map((s): CancelRowIn => {
          const base: CancelRowIn = {
            date: dateStr,
            courtId: typeof s.courtId === "number" ? s.courtId : null,
            start: s.start || "—",
            end: s.end || "—",
            userName: booking ? (booking.userName || "—") : (guest?.userName || "Guest"),
            who,                          // "member" | "user" | "guest"
            bookingType: "Normal",        // literal union
            paymentRef,
            amount: perSlot,
            currency,
            refundStatus: "NO_REFUND_REQUIRED",
            note: "Full booking cancel (offline/membership)",
          };
          // Optional phone enrichment can be added here in future
          return base;
        });
        await appendCancellations(rows);
      } catch (sheetErr) {
        console.error("Sheets append (full cancel / no-gateway) failed:", sheetErr);
      }

      if (booking) await Booking.findByIdAndDelete(id);
      else await GuestBooking.findByIdAndDelete(id);

      return NextResponse.json({
        ok: true,
        deletedId: id,
        refunded: amount,
        currency,
        refundStatus: "NO_REFUND_REQUIRED",
        status: "NO_REFUND_REQUIRED",
      });
    }

    // Customer online booking → Cashfree refund
    const cf = await createCashfreeRefund({
      orderId,
      amount, // full
      note: `Admin cancel booking ${id}`,
    });

    const legacy = toLegacyRefundStatus(cf.refundStatus);
    const unified = toUnifiedStatus(cf.refundStatus);

    await Refund.create({
      kind: "booking_slot",
      bookingId: String(doc._id),
      userId: booking ? String(booking.userId || "") : undefined,
      userEmail: booking ? String(booking.userEmail || "") : undefined,
      userName: booking ? String(booking.userName || "") : undefined,
      amount,
      currency,
      reason: "Admin cancel (full booking)",
      refundId: cf.refundId,
      cfRefundId: cf.cfRefundId,
      cfPaymentId: cf.cfPaymentId,
      orderId,
      refundStatus: legacy,
      status: unified,
      statusDescription: cf.statusDescription,
      gateway: "CASHFREE",
      meta: {
        raw: cf.raw,
        date: dateStr,
        slots,
        mode: "full_booking_cancel",
      },
    });

    // Append one cancellation row per slot to Sheet 2 with gateway status
    try {
      const rows: CancelRowIn[] = (slots.length ? slots : [{ courtId: null as number | null, start: "—", end: "—" }]).map((s): CancelRowIn => {
        const base: CancelRowIn = {
          date: dateStr,
          courtId: typeof s.courtId === "number" ? s.courtId : null,
          start: s.start || "—",
          end: s.end || "—",
          userName: booking ? (booking.userName || "—") : (guest?.userName || "Guest"),
          who,
          bookingType: "Normal",
          paymentRef,
          amount: perSlot,
          currency,
          refundStatus: legacy, // SUCCESS / FAILED / PENDING
          note: "Full booking cancel (gateway refund)",
        };
        return base;
      });
      await appendCancellations(rows);
    } catch (sheetErr) {
      console.error("Sheets append (full cancel / cashfree) failed:", sheetErr);
    }

    if (legacy === "REFUND_FAILED") {
      return NextResponse.json({ error: "Cashfree refund failed", details: cf.raw }, { status: 502 });
    }

    if (booking) await Booking.findByIdAndDelete(id);
    else await GuestBooking.findByIdAndDelete(id);

    return NextResponse.json({
      ok: true,
      deletedId: id,
      refunded: amount,
      currency,
      refundStatus: legacy,
      status: unified,
      cfRefundId: cf.cfRefundId,
      cfPaymentId: cf.cfPaymentId,
    });
  } catch (e: unknown) {
    const errObj = e as { message?: string; status?: number; data?: unknown };
    const status = typeof errObj?.status === "number" ? errObj.status : 500;
    const message = typeof errObj?.message === "string" ? errObj.message : "Server error";
    const details = errObj?.data;
    console.error("Cancel booking error:", e);
    return NextResponse.json({ error: message, details }, { status });
  }
}
