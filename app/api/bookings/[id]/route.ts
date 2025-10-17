// app/api/bookings/[id]/route.ts
import { NextResponse } from "next/server";
import { BookingModel, type BookingDoc } from "@/models/Booking";
import { RefundModel } from "@/models/Refund";

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
    // Try to read a reasonable message from the returned payload
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

/* ---------------- Types for lean booking shape ---------------- */

type BookingLean = Pick<
  BookingDoc,
  "_id" | "orderId" | "userId" | "userEmail" | "userName" | "amount" | "currency" | "paymentRef" | "date" | "slots"
> & { _id: string };

/* ---------------- DELETE: cancel entire booking ---------------- */

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const Booking = await BookingModel();
    const Refund = await RefundModel();

    const booking = await Booking.findById(id)
      .select({
        orderId: 1,
        userId: 1,
        userEmail: 1,
        userName: 1,
        amount: 1,
        currency: 1,
        paymentRef: 1, // e.g. "MEMBERSHIP"
        date: 1,
        slots: 1,
      })
      .lean<BookingLean | null>();

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const rawAmount = Number(booking.amount);
    const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
    const currency = booking.currency || "INR";
    const orderId = String(booking.orderId || "");
    const paymentRef = String(booking.paymentRef || "");

    // Membership / free booking: no gateway refund
    if (!orderId || amount <= 0 || paymentRef.toUpperCase() === "MEMBERSHIP") {
      await Refund.create({
        kind: "booking_slot", // ✅ matches Refund schema enum
        bookingId: String(booking._id),
        userId: String(booking.userId || ""),
        userEmail: String(booking.userEmail || ""),
        userName: String(booking.userName || ""),
        amount, // likely 0
        currency,
        reason: paymentRef.toUpperCase() === "MEMBERSHIP" ? "Membership booking cancel" : "No payment captured",
        orderId: orderId || undefined,
        refundId: undefined,
        cfRefundId: undefined,
        cfPaymentId: undefined,
        refundStatus: "NO_REFUND_REQUIRED", // ✅ legacy field
        status: "NO_REFUND_REQUIRED", // ✅ unified field used by UI
        statusDescription: "No payment associated with this booking",
        gateway: "NONE",
        meta: {
          paymentRef,
          date: booking.date as unknown as string, // shape preserved; no logic change
          slots: booking.slots as unknown as string[],
          mode: "full_booking_cancel",
        },
      });

      await Booking.findByIdAndDelete(id);

      return NextResponse.json({
        ok: true,
        deletedId: id,
        refunded: amount,
        currency,
        refundStatus: "NO_REFUND_REQUIRED",
        status: "NO_REFUND_REQUIRED",
      });
    }

    // Paid booking → attempt Cashfree refund for full amount
    const cf = await createCashfreeRefund({
      orderId,
      amount, // must be > 0 here
      note: `Admin cancel booking ${id}`,
    });

    const legacy = toLegacyRefundStatus(cf.refundStatus);
    const unified = toUnifiedStatus(cf.refundStatus);

    // Record the refund attempt/result first
    await Refund.create({
      kind: "booking_slot", // ✅ uses allowed enum
      bookingId: String(booking._id),
      userId: String(booking.userId || ""),
      userEmail: String(booking.userEmail || ""),
      userName: String(booking.userName || ""),
      amount,
      currency,
      reason: "Admin cancel (full booking)",
      refundId: cf.refundId,
      cfRefundId: cf.cfRefundId,
      cfPaymentId: cf.cfPaymentId,
      orderId,
      refundStatus: legacy, // ✅ matches schema enum
      status: unified, // ✅ new normalized field
      statusDescription: cf.statusDescription,
      gateway: "CASHFREE",
      meta: {
        raw: cf.raw,
        date: booking.date as unknown as string,
        slots: booking.slots as unknown as string[],
        mode: "full_booking_cancel",
      },
    });

    // If Cashfree didn’t accept (e.g., FAILED), keep the booking for manual follow-up.
    if (legacy === "REFUND_FAILED") {
      return NextResponse.json({ error: "Cashfree refund failed", details: cf.raw }, { status: 502 });
    }

    // For SUCCESS or PENDING we remove the booking (your earlier behavior)
    await Booking.findByIdAndDelete(id);

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
    // Preserve your original behavior: read message, data, and status if present
    const errObj = e as { message?: string; status?: number; data?: unknown };
    const status = typeof errObj?.status === "number" ? errObj.status : 500;
    const message = typeof errObj?.message === "string" ? errObj.message : "Server error";
    const details = errObj?.data;
    console.error("Cancel booking error:", e);
    return NextResponse.json({ error: message, details }, { status });
  }
}

/* ---------------- (Optional) PATCH: mark booking as PAID ---------------- */

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = String(body.action || "").toLowerCase();

    if (action !== "markpaid") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const Booking = await BookingModel();
    const doc = await Booking.findByIdAndUpdate(id, { $set: { status: "PAID" } }, { new: true }).lean<BookingDoc | null>();
    if (!doc) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("PATCH booking error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
