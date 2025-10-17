// models/Registrations.ts
import mongoose, { Schema } from "mongoose";
import { bookingConnection } from "@/lib/dbBookings";

export interface RegistrationDoc extends mongoose.Document {
  eventId: string;
  eventTitle?: string;

  userId?: string;
  userEmail?: string;
  userName?: string;

  // Optional payment/order metadata (present for paid events)
  orderId?: string;           // Cashfree order id (optional)
  amount?: number;            // entry fee amount captured at registration time
  currency?: string;          // "INR" default
  adminPaid?: boolean;        // admin-marked payment flag
  status?: "PAID";            // we store "PAID" per your admin flow
  paymentRef?: string;        // e.g., "CASH" / "ONLINE" (optional)

  createdAt: Date;
  updatedAt: Date;
}

const RegistrationSchema = new Schema<RegistrationDoc>(
  {
    eventId: { type: String, required: true, index: true },
    eventTitle: { type: String },

    userId: { type: String, index: true },
    userEmail: { type: String, lowercase: true, index: true },
    userName: { type: String },

    // Remove field-level index to avoid duplicate index warnings on { orderId: 1 }
    orderId: { type: String }, // optional, no index here
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    adminPaid: { type: Boolean, default: true },
    status: { type: String, enum: ["PAID"], default: "PAID" },
    paymentRef: { type: String },
  },
  { timestamps: true, collection: "registrations", strict: true }
);

// If you need an index on orderId, define it only once like this (uncomment one line below):
// RegistrationSchema.index({ orderId: 1 });

export async function RegistrationModel() {
  const conn = await bookingConnection();
  return (
    (conn.models.Registration as mongoose.Model<RegistrationDoc>) ||
    conn.model<RegistrationDoc>("Registration", RegistrationSchema)
  );
}
