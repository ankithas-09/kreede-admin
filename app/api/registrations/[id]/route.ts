// app/api/registrations/[id]/route.ts
import { NextResponse } from "next/server";
import { RegistrationModel } from "@/models/Registrations";
import { EventRefundModel } from "@/models/EventRefund";

type RegLean = {
  _id: string | { toString?: () => string };
  amount?: number;
  entryFee?: number;
  currency?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  eventId?: string | { toString?: () => string };
  eventTitle?: string;
};

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const Registration = await RegistrationModel();
    const EventRefund = await EventRefundModel();

    // Load the registration we’re cancelling
    const reg = (await Registration.findById(id).lean()) as RegLean | null;
    if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

    // Determine amount (your schema may use entryFee or amount)
    const amtSource = reg.amount ?? reg.entryFee ?? 0;
    const amt = Number(amtSource);
    const currency = reg.currency || "INR";

    // Write to event_refunds
    await EventRefund.create({
      registrationId: typeof reg._id === "string" ? reg._id : reg._id?.toString?.(),
      userId: reg.userId,
      userEmail: reg.userEmail,
      userName: reg.userName,
      eventId: typeof reg.eventId === "string" ? reg.eventId : reg.eventId?.toString?.(),
      eventTitle: reg.eventTitle || "Event",
      amount: Number.isFinite(amt) ? Math.max(0, amt) : 0,
      currency,
      reason: "Admin cancel registration",
      refundStatus: "RECORDED",
      meta: { original: reg },
    });

    // Delete from registrations
    await Registration.findByIdAndDelete(id);

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    console.error("Cancel registration error:", e);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: err?.status || 500 }
    );
  }
}
