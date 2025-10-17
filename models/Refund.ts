// models/Refund.ts
import type mongoose from "mongoose";
import { Schema } from "mongoose";
import { bookingConnection } from "@/lib/dbBookings";

export interface RefundDoc extends mongoose.Document {
  kind: "booking_slot" | "event_registration";
  bookingId?: string;
  registrationId?: string;

  // Optional to support guest bookings (no userId/userEmail)
  userId?: string;
  userEmail?: string;
  userName?: string;

  amount: number;
  currency: "INR";
  reason?: string;
  orderId?: string;

  // Cashfree metadata
  refundId?: string;
  cfRefundId?: string;
  cfPaymentId?: string;

  // legacy (kept for compat) — now includes "SUCCESS"
  refundStatus:
    | "NO_REFUND_REQUIRED"
    | "REFUND_REQUESTED"
    | "REFUND_INITIATED"
    | "REFUND_SUCCESS"
    | "REFUND_FAILED"
    | "PENDING"
    | "SUCCESS";

  // normalized status your UI should use
  status?: "NO_REFUND_REQUIRED" | "PENDING" | "SUCCESS" | "FAILED";

  statusDescription?: string;
  gateway?: "CASHFREE" | "NONE";

  membershipCreditRestored?: boolean;
  gatewayResponse?: Record<string, unknown>;
  meta?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<RefundDoc>(
  {
    kind: { type: String, enum: ["booking_slot", "event_registration"], required: true, index: true },

    bookingId: { type: String, index: true },
    registrationId: { type: String, index: true },

    // Not required (but still indexed for lookups)
    userId: { type: String, index: true },
    userEmail: { type: String, lowercase: true, index: true },
    userName: { type: String },

    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    reason: { type: String },

    orderId: { type: String, index: true },

    refundId: { type: String },
    cfRefundId: { type: String },
    cfPaymentId: { type: String },

    refundStatus: {
      type: String,
      enum: [
        "NO_REFUND_REQUIRED",
        "REFUND_REQUESTED",
        "REFUND_INITIATED",
        "REFUND_SUCCESS",
        "REFUND_FAILED",
        "PENDING",
        "SUCCESS",
      ],
      required: true,
      default: "PENDING",
    },

    status: {
      type: String,
      enum: ["NO_REFUND_REQUIRED", "PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },

    statusDescription: { type: String },
    gateway: { type: String, enum: ["CASHFREE", "NONE"], default: "NONE" },

    membershipCreditRestored: { type: Boolean, default: false },

    gatewayResponse: Schema.Types.Mixed,
    meta: Schema.Types.Mixed,
  },
  { timestamps: true, collection: "refunds", strict: true }
);

// IMPORTANT: use the bookings DB connection
export async function RefundModel() {
  const conn = await bookingConnection();
  return (conn.models.Refund as mongoose.Model<RefundDoc>) || conn.model<RefundDoc>("Refund", RefundSchema);
}
