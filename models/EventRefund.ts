// models/EventRefund.ts
import { Schema, type Model, type Types } from "mongoose";
import type mongoose from "mongoose";
import { bookingConnection } from "@/lib/dbBookings";

export interface EventRefundDoc extends mongoose.Document {
  _id: Types.ObjectId;
  registrationId?: string;
  eventId?: string;
  eventTitle?: string;

  userId?: string;
  userEmail?: string;
  userName?: string;

  amount: number;
  currency: "INR";

  // Gateway info (if applicable)
  refundId?: string;
  cfRefundId?: string;
  cfPaymentId?: string;

  status: "NO_REFUND_REQUIRED" | "PENDING" | "SUCCESS" | "FAILED";
  statusDescription?: string;
  gateway?: "CASHFREE" | "NONE";

  meta?: Record<string, unknown>; // was `any` (no logic change)
  createdAt: Date;
  updatedAt: Date;
}

const EventRefundSchema = new Schema<EventRefundDoc>(
  {
    registrationId: { type: String, index: true },
    eventId: { type: String, index: true },
    eventTitle: { type: String, index: true },

    userId: { type: String, index: true },
    userEmail: { type: String, lowercase: true, index: true },
    userName: { type: String },

    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },

    refundId: { type: String },
    cfRefundId: { type: String },
    cfPaymentId: { type: String },

    status: {
      type: String,
      enum: ["NO_REFUND_REQUIRED", "PENDING", "SUCCESS", "FAILED"],
      default: "NO_REFUND_REQUIRED",
      index: true,
    },
    statusDescription: { type: String },
    gateway: { type: String, enum: ["CASHFREE", "NONE"], default: "NONE" },

    meta: Schema.Types.Mixed, // storage stays flexible
  },
  {
    timestamps: true,
    collection: "event_refunds",
    strict: true,
  }
);

const MODEL_NAME = "EventRefund";

export async function EventRefundModel(): Promise<Model<EventRefundDoc>> {
  const conn = await bookingConnection();
  return (conn.models[MODEL_NAME] as Model<EventRefundDoc>) ||
    conn.model<EventRefundDoc>(MODEL_NAME, EventRefundSchema);
}
