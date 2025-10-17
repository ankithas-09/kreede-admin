// app/api/refunds/clear/route.ts
import { NextResponse } from "next/server";
import { RefundModel } from "@/models/Refund";
import { EventRefundModel } from "@/models/EventRefund";

export async function DELETE() {
  try {
    const Refund = await RefundModel();
    const EventRefund = await EventRefundModel();
    await Refund.deleteMany({});
    await EventRefund.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to clear refunds";
    console.error("Failed to clear refunds:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
