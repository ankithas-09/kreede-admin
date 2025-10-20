// models/GuestBooking.ts
import type mongoose from "mongoose";
import { Schema } from "mongoose";
import { getDb } from "@/lib/db";

export interface GuestBookingDoc extends mongoose.Document {
  orderId?: string;
  userName?: string;

  // ⬇️ NEW: persist guest phone in the canonical field
  phone_number?: string;
  // (optional legacy mirror, if any old code still touches it)
  guestPhone?: string;

  date: string; // YYYY-MM-DD
  slots: { courtId: number; start: string; end: string }[];

  amount: number;
  currency: string; // "INR"
  status: "PAID";   // admin flow keeps this as PAID; adminPaid reflects paid/unpaid UI state
  paymentRef: "PAID.CASH" | "UNPAID.CASH" | "CASH"; // include CASH for backward compatibility
  adminPaid?: boolean; // false when pending (UNPAID.CASH), true after mark-paid (PAID.CASH)

  createdAt: Date;
  updatedAt: Date;
}

const SlotSchema = new Schema(
  {
    courtId: { type: Number, required: true },
    start:   { type: String, required: true }, // "HH:MM"
    end:     { type: String, required: true }, // "HH:MM"
  },
  { _id: false }
);

const GuestBookingSchema = new Schema<GuestBookingDoc>(
  {
    orderId:    { type: String, index: true }, // unique when present
    userName:   { type: String },

    // ⬇️ NEW fields
    phone_number: { type: String, trim: true, index: true },
    guestPhone:   { type: String, trim: true }, // optional legacy alias

    date:       { type: String, required: true, index: true },
    slots:      { type: [SlotSchema], default: [] },

    amount:     { type: Number, required: true, default: 0 },
    currency:   { type: String, default: "INR" },

    status:     { type: String, enum: ["PAID"], default: "PAID" },
    paymentRef: { type: String, enum: ["PAID.CASH", "UNPAID.CASH", "CASH"], required: true },
    adminPaid:  { type: Boolean, default: false },
  },
  { collection: "guest_bookings", timestamps: true, strict: true }
);

// Make orderId unique only if it's a string (admin-created always has one)
GuestBookingSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: "string" } } }
);

export async function GuestBookingModel() {
  const db = await getDb("kreede_booking");
  return (db.models.GuestBooking as mongoose.Model<GuestBookingDoc>) ||
         db.model<GuestBookingDoc>("GuestBooking", GuestBookingSchema);
}
