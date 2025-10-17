// models/Membership.ts (ADMIN)
import { Schema, type Model, type Types } from "mongoose";
import { getDb } from "@/lib/db";

export type PlanId = "1M" | "3M" | "6M";
export type MembershipStatus = "PENDING" | "PAID" | "FAILED";

export interface MembershipDoc {
  _id: Types.ObjectId;
  orderId: string;
  amount: number;
  currency: "INR";
  durationMonths: number;
  games: number;         // total games
  gamesUsed: number;     // consumed
  planId: PlanId;        // "1M" | "3M" | "6M"
  planName: string;      // e.g., "1 Month"
  status: MembershipStatus;

  userId: string;        // users._id as string
  userEmail: string;
  userName?: string;

  paymentRaw?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<MembershipDoc>(
  {
    // ⬇️ Removed inline index to avoid duplicate with the unique index below
    orderId:        { type: String, required: true },
    amount:         { type: Number, required: true },
    currency:       { type: String, default: "INR" },

    durationMonths: { type: Number, required: true },

    games:          { type: Number, required: true },
    gamesUsed:      { type: Number, required: true, default: 0 },

    planId:         { type: String, enum: ["1M", "3M", "6M"], required: true },
    planName:       { type: String, required: true },

    status:         { type: String, enum: ["PENDING", "PAID", "FAILED"], default: "PENDING", index: true },

    userId:         { type: String, required: true, index: true },
    userEmail:      { type: String, required: true, lowercase: true, index: true },
    userName:       { type: String },

    paymentRaw:     { type: Schema.Types.Mixed },
  },
  { collection: "memberships", timestamps: true, strict: true }
);

// helpful compound indexes
MembershipSchema.index({ userId: 1, status: 1, createdAt: -1 });
// keep the unique index for orderId here (no inline index above)
MembershipSchema.index({ orderId: 1 }, { unique: true });

const MODEL_NAME = "Membership";

export async function MembershipModel(): Promise<Model<MembershipDoc>> {
  const db = await getDb("kreede_booking");
  return (db.models[MODEL_NAME] as Model<MembershipDoc>) || db.model<MembershipDoc>(MODEL_NAME, MembershipSchema);
}

/**
 * Restore a single membership credit for the user's most-recent PAID membership.
 * Atomically does: gamesUsed = max(0, gamesUsed - 1)
 * Returns true if a document was updated.
 */
export async function restoreOneMembershipCredit(userId: string): Promise<boolean> {
  if (!userId) return false;
  const Membership = await MembershipModel();

  // Aggregation pipeline update (typed via UpdateWithAggregationPipeline)
  const pipeline = [
    {
      $set: {
        gamesUsed: {
          $max: [0, { $subtract: ["$gamesUsed", 1] }],
        },
      },
    },
  ] as unknown as import("mongoose").UpdateWithAggregationPipeline;

  const updated = await Membership.findOneAndUpdate(
    { userId, status: "PAID" },
    pipeline,
    { new: true, sort: { createdAt: -1 } }
  );

  return !!updated;
}
