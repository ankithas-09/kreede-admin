// app/api/offers/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOfferModel } from "@/models/Offer";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();

    // allow partial updates
    const updates: any = {};
    const keys = [
      "title",
      "description",
      "type",
      "dateFrom",
      "dateTo",
      "timeFrom",
      "timeTo",
      "flatPrice",
      "rules",
      "active",
    ];
    for (const k of keys) if (k in body) updates[k] = body[k];

    if ("dateFrom" in updates) updates.dateFrom = new Date(updates.dateFrom);
    if ("dateTo" in updates) updates.dateTo = new Date(updates.dateTo);

    const OfferModel = await getOfferModel();
    const item = await OfferModel.findByIdAndUpdate(params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!item) return bad("Offer not found", 404);

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return bad(e?.message || "Failed to update offer", 500);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const OfferModel = await getOfferModel();
    const res = await OfferModel.findByIdAndDelete(params.id);
    if (!res) return bad("Offer not found", 404);
    return NextResponse.json({ ok: true, deletedId: params.id });
  } catch (e: any) {
    return bad(e?.message || "Failed to delete offer", 500);
  }
}
