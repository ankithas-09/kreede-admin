// app/api/registrations/admin/route.ts
import { NextResponse } from "next/server";
import { RegistrationModel } from "@/models/Registrations";
import { EventModel } from "@/models/Event";

type EventLean = { entryFee?: number; title?: string };

function genGuestId() {
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      eventId,
      eventTitle,
      type,                 // "member" | "user" | "guest"
      markPaid,             // boolean (admin pressed Paid button or free event)
      userId,
      userName,
      userEmail,
      guestName,
      guestPhone,
    } = body || {};

    if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

    const Event = await EventModel();
    const ev = await Event.findById(eventId).select({ title: 1, entryFee: 1 }).lean<EventLean | null>();
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const fee = Number(ev.entryFee || 0);
    const isFree = fee <= 0;

    const isMember = type === "member";
    const isUser   = type === "user";
    const isGuest  = type === "guest";

    if ((isMember || isUser) && !userEmail) {
      return NextResponse.json({ error: "User email is required" }, { status: 400 });
    }
    if (isGuest && (!guestName || !guestPhone)) {
      return NextResponse.json({ error: "Guest name and phone are required" }, { status: 400 });
    }

    const Registration = await RegistrationModel();

    const adminPaid = isFree ? true : !!markPaid;
    const paymentRef = isFree ? "FREE" : "CASH";

    // Generate guestId if this is a guest
    const guestId = isGuest ? genGuestId() : undefined;

    const doc = await Registration.create({
      eventId: String(eventId),
      eventTitle: eventTitle || ev.title || "",

      // identified user
      userId:    isGuest ? undefined : userId,
      userName:  isGuest ? undefined : (userName || "—"),
      userEmail: isGuest ? undefined : (userEmail ? String(userEmail).toLowerCase() : undefined),

      // guest fields
      guestId:   isGuest ? guestId : undefined,
      guestName: isGuest ? guestName : undefined,
      guestPhone:isGuest ? guestPhone : undefined,

      amount: fee,
      currency: "INR",
      status: "PAID",
      adminPaid,
      paymentRef,
    });

    return NextResponse.json({
      ok: true,
      id: String(doc._id),
      guestId: doc.guestId, // handy for the UI if you want to show it / copy it
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("admin registrations create error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
