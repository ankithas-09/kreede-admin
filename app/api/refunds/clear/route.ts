// app/api/refunds/clear/route.ts
import { NextResponse } from "next/server";
import { RefundModel } from "@/models/Refund";
import { EventRefundModel } from "@/models/EventRefund";

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "all").toLowerCase();

    const Refund = await RefundModel();
    const EventRefund = await EventRefundModel();

    if (type === "court") {
      await Refund.deleteMany({});
    } else if (type === "event") {
      await EventRefund.deleteMany({});
    } else {
      // default: clear both
      await Promise.all([Refund.deleteMany({}), EventRefund.deleteMany({})]);
    }

    return NextResponse.json({ ok: true, cleared: type });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to clear refunds";
    console.error("Failed to clear refunds:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
