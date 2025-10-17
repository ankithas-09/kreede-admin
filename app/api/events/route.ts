// app/api/events/route.ts
import { NextResponse } from "next/server";
import { EventModel } from "@/models/Event";

function isValidUrl(s: string) {
  try { new URL(s); return true; } catch { return false; }
}

type Query = {
  $or?: Array<
    | { title: { $regex: string; $options: string } }
    | { description: { $regex: string; $options: string } }
  >;
  startDate?: string;
};

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { title, startDate, endDate, startTime, endTime, entryFee, link, description, tags, createdBy } = json || {};

    if (!title || !startDate || !endDate || !link) {
      return NextResponse.json({ error: "title, startDate, endDate and link are required" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: "dates must be YYYY-MM-DD" }, { status: 400 });
    }

    if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
      return NextResponse.json({ error: "startTime must be HH:mm" }, { status: 400 });
    }
    if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
      return NextResponse.json({ error: "endTime must be HH:mm" }, { status: 400 });
    }

    if (!isValidUrl(link)) {
      return NextResponse.json({ error: "link must be a valid URL" }, { status: 400 });
    }

    const Event = await EventModel();
    const doc = await Event.create({
      title: String(title).trim(),
      startDate,
      endDate,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      entryFee: entryFee !== undefined && entryFee !== "" ? Number(entryFee) : undefined,
      link: String(link).trim(),
      description: (typeof description === "string" ? description.trim() : undefined),
      tags: Array.isArray(tags)
        ? (tags as unknown[]).map((t) => String(t).trim()).filter(Boolean)
        : (typeof tags === "string" ? tags.split(",").map((s) => s.trim()).filter(Boolean) : []),
      createdBy: createdBy || undefined,
    });

    return NextResponse.json({ ok: true, id: doc._id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const filterStart = (searchParams.get("start") || "").trim();

    const Event = await EventModel();
    const query: Query = {};
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
    if (filterStart) {
      query.startDate = filterStart;  // ✅ only filter by start date
    }

    const items = await Event.find(query)
      .select({
        title: 1,
        startDate: 1,
        endDate: 1,
        startTime: 1,
        endTime: 1,
        entryFee: 1,
        link: 1,
        description: 1,
        tags: 1,
        createdAt: 1,
      })
      .sort({ startDate: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
