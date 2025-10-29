// app/api/offers/active/route.ts
import { NextResponse } from "next/server";
import { getOfferModel } from "@/models/Offer";

export const dynamic = "force-dynamic";

export async function GET() {
  const Offer = await getOfferModel();
  const now = new Date();

  const offers = await Offer.find({
    active: true,
    dateTo: { $gte: now },
  })
    .select({
      title: 1,
      description: 1,
      type: 1,
      dateFrom: 1,
      dateTo: 1,
      timeFrom: 1,
      timeTo: 1,
      flatPrice: 1,
      rules: 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ ok: true, offers });
}
