// app/api/offers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOfferModel } from "@/models/Offer";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function isHHmm(v: string) {
  return /^\d{2}:\d{2}$/.test(v);
}

function validateBody(b: any) {
  const required = ["title", "type", "dateFrom", "dateTo", "timeFrom", "timeTo"];
  for (const k of required) if (!b?.[k]) return `Missing field: ${k}`;

  if (!["flat", "conditional"].includes(b.type)) return "Invalid type";
  if (!isHHmm(b.timeFrom) || !isHHmm(b.timeTo)) return "timeFrom/timeTo must be HH:mm";

  const df = new Date(b.dateFrom);
  const dt = new Date(b.dateTo);
  if (isNaN(+df) || isNaN(+dt)) return "Invalid dateFrom/dateTo";
  if (df > dt) return "dateFrom must be <= dateTo";

  if (b.type === "flat") {
    if (typeof b.flatPrice !== "number") return "flatPrice is required for flat type";
    if (b.flatPrice < 0) return "flatPrice must be >= 0";
  } else {
    if (!Array.isArray(b.rules) || b.rules.length === 0) {
      return "rules[] is required for conditional type";
    }
  for (const r of b.rules) {
    if (!r?.label || typeof r.price !== "number") return "Each rule needs label & price";
    if (r.price < 0) return "Rule price must be >= 0";
  // r.criteria (if present) can be any text — no validation needed
  }
  }
  return null;
}

export async function GET() {
  const OfferModel = await getOfferModel();
  const items = await OfferModel.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const err = validateBody(body);
    if (err) return bad(err);

    const OfferModel = await getOfferModel();
    const doc = await OfferModel.create({
      title: body.title,
      description: body.description || "",
      type: body.type,
      dateFrom: new Date(body.dateFrom),
      dateTo: new Date(body.dateTo),
      timeFrom: body.timeFrom,
      timeTo: body.timeTo,
      flatPrice: body.type === "flat" ? body.flatPrice : undefined,
      rules: body.type === "conditional" ? body.rules : [],
      active: body.active ?? true,
    });

    return NextResponse.json({ ok: true, item: doc });
  } catch (e: any) {
    return bad(e?.message || "Failed to create offer", 500);
  }
}
