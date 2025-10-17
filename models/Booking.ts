// models/Booking.ts
import mongoose, { Schema } from "mongoose";
import { getDb } from "@/lib/db";

export interface BookingDoc extends mongoose.Document {
  orderId?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  date: string;
  slots: { courtId: number; start: string; end: string }[];
  amount: number;
  currency: string;
  status: "PAID";
  paymentRef?: string;
  adminPaid?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SlotSchema = new Schema(
  {
    courtId: { type: Number, required: true },
    start:   { type: String, required: true },
    end:     { type: String, required: true },
  },
  { _id: false }
);

const BookingSchema = new Schema<BookingDoc>(
  {
    // 🔧 removed inline index to avoid duplicate with schema.index below
    orderId:    { type: String }, 
    userId:     { type: String, index: true },
    userName:   { type: String },
    userEmail:  { type: String, lowercase: true, index: true },
    date:       { type: String, required: true, index: true },
    slots:      { type: [SlotSchema], default: [] },
    amount:     { type: Number, default: 0 },
    currency:   { type: String, default: "INR" },
    status:     { type: String, enum: ["PAID"], default: "PAID" },
    paymentRef: { type: String },
    adminPaid:  { type: Boolean, default: true },
  },
  { timestamps: true, collection: "bookings" }
);

// ✅ keep this partial unique index
BookingSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: "string" } } }
);

export async function BookingModel() {
  const conn = await getDb("kreede_booking");
  return (conn.models.Booking as mongoose.Model<BookingDoc>) ||
         conn.model<BookingDoc>("Booking", BookingSchema);
}
