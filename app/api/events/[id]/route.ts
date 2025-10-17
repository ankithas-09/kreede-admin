// app/api/events/[id]/route.ts
import { NextResponse } from "next/server";
import { EventModel } from "@/models/Event";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const Event = await EventModel();
    const doc = await Event.findByIdAndDelete(id);
    if (!doc) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
