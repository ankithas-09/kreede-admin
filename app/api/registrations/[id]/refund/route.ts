// app/api/registrations/[id]/refund/route.ts
import { NextResponse } from "next/server";
import { RegistrationModel, type RegistrationDoc } from "@/models/Registrations";
import { EventModel, type EventDoc } from "@/models/Event";
import { EventRefundModel } from "@/models/EventRefund";

function cashfreeBase() {
  const env = (process.env.CASHFREE_ENV || "sandbox").toLowerCase();
  return env === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

type CashfreeRefundResult = {
  refundId: string;
  refundStatus: string;
  cfRefundId: string;
  cfPaymentId: string;
  statusDescription: string;
  raw: unknown;
};

async function createCashfreeRefund(params: { orderId: string; amount: number; note?: string }): Promise<CashfreeRefundResult> {
  const appId  = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  const apiVer = process.env.CASHFREE_API_VERSION || "2023-08-01";
  if (!appId || !secret) {
    throw new Error("Cashfree credentials missing (CASHFREE_APP_ID / CASHFREE_SECRET_KEY).");
  }

  const refundId = `evref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `${cashfreeBase()}/orders/${encodeURIComponent(params.orderId)}/refunds`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": appId,
      "x-client-secret": secret,
      "x-api-version": apiVer,
    },
    body: JSON.stringify({
      refund_amount: params.amount,
      refund_id: refundId,
      refund_note: params.note || "Admin cancel registration",
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

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const regId = params?.id;
    if (!regId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const Registration = await RegistrationModel();
    const Event        = await EventModel();
    const EventRefund  = await EventRefundModel();

    // Load the registration
    const reg = await Registration.findById(regId)
      .select({
        userId: 1,
        userEmail: 1,
        userName: 1,
        eventId: 1,
        eventTitle: 1,
        orderId: 1,      // may be undefined
        amount: 1,       // might exist on registration
        createdAt: 1,
      })
      .lean<RegistrationDoc | null>();

    if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

    // Load event (for entryFee)
    const ev = await Event.findById(reg.eventId)
      .select({ entryFee: 1, title: 1 })
      .lean<Pick<EventDoc, "entryFee" | "title"> | null>();

    // Determine refund amount:
    // Prefer the event's entryFee, fallback to reg.amount (if any), else 0
    const amountFromEvent = typeof ev?.entryFee === "number" ? ev.entryFee : undefined;
    const amountFromReg   = typeof reg.amount === "number" ? reg.amount : undefined;
    const amount = (amountFromEvent ?? amountFromReg ?? 0);
    const currency = "INR";

    let refundStatus = "NO_REFUND_REQUIRED";
    let refundId: string | undefined;
    let cfRefundId: string | undefined;
    let cfPaymentId: string | undefined;
    let statusDescription: string | undefined;
    let raw: unknown;

    const orderId = reg.orderId ? String(reg.orderId) : undefined;

    // If we have an orderId and a positive amount, attempt Cashfree refund
    if (orderId && amount > 0) {
      const cf = await createCashfreeRefund({
        orderId,
        amount,
        note: `Admin cancel registration ${regId}`,
      });
      refundId          = cf.refundId;
      cfRefundId        = cf.cfRefundId;
      cfPaymentId       = cf.cfPaymentId;
      refundStatus      = cf.refundStatus || "PENDING";
      statusDescription = cf.statusDescription;
      raw               = cf.raw;

      if (!["SUCCESS", "PENDING"].includes(refundStatus)) {
        // record failed attempt; do not delete registration
        await EventRefund.create({
          registrationId: regId,
          eventId: reg.eventId,
          eventTitle: reg.eventTitle,
          userId: reg.userId || "",
          userEmail: (reg.userEmail || "").toLowerCase(),
          userName: reg.userName,
          amount,
          currency,
          refundId,
          cfRefundId,
          cfPaymentId,
          status: "FAILED",
          statusDescription,
          gateway: "CASHFREE",
          meta: { raw, orderId },
        });
        return NextResponse.json(
          { error: `Cashfree refund not accepted: ${refundStatus}`, details: raw },
          { status: 502 }
        );
      }
    } else {
      // No orderId or zero fee -> informational row
      refundStatus = "NO_REFUND_REQUIRED";
    }

    // Persist refund record and delete the registration
    await EventRefund.create({
      registrationId: regId,
      eventId: reg.eventId,
      eventTitle: reg.eventTitle,
      userId: reg.userId || "",
      userEmail: (reg.userEmail || "").toLowerCase(),
      userName: reg.userName,
      amount,
      currency,
      refundId,
      cfRefundId,
      cfPaymentId,
      status:
        refundStatus === "SUCCESS"
          ? "SUCCESS"
          : refundStatus === "PENDING"
          ? "PENDING"
          : "NO_REFUND_REQUIRED",
      statusDescription: statusDescription || (orderId ? undefined : "No order id or zero fee"),
      gateway: orderId && amount > 0 ? "CASHFREE" : "NONE",
      meta: raw ? { raw, orderId } : orderId ? { orderId } : undefined,
    });

    await Registration.findByIdAndDelete(regId);

    return NextResponse.json({
      ok: true,
      deletedId: regId,
      refunded: amount,
      currency,
      refundStatus,
      cfRefundId,
      cfPaymentId,
    });
  } catch (e: unknown) {
    const errObj = e as { status?: number; message?: string; data?: unknown };
    const status = typeof errObj?.status === "number" ? errObj.status : 500;
    const message = typeof errObj?.message === "string" ? errObj.message : "Server error";
    const details = errObj?.data;
    console.error("Event registration refund error:", e);
    return NextResponse.json({ error: message, details }, { status });
  }
}
