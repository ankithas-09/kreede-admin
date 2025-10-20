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

  // NEW: 7-digit member id (last 4 digits of aadhar + 3-digit sequence)
  memberId?: string;

  paymentRaw?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<MembershipDoc>(
  {
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

    // NEW: enforce 7 digits and keep unique+sparse so older rows without memberId are fine
    memberId:       { type: String, trim: true, match: [/^\d{7}$/, "memberId must be 7 digits"], index: { unique: true, sparse: true } },

    paymentRaw:     { type: Schema.Types.Mixed },
  },
  { collection: "memberships", timestamps: true, strict: true }
);

// helpful compound indexes
MembershipSchema.index({ userId: 1, status: 1, createdAt: -1 });
MembershipSchema.index({ orderId: 1 }, { unique: true });

const MODEL_NAME = "Membership";

export async function MembershipModel(): Promise<Model<MembershipDoc>> {
  const db = await getDb("kreede_booking");
  return (db.models[MODEL_NAME] as Model<MembershipDoc>) || db.model<MembershipDoc>(MODEL_NAME, MembershipSchema);
}

/**
 * Consume N membership credits for the user's most-recent PAID membership.
 */
export async function useMembershipCredits(userId: string, count = 1): Promise<boolean> {
  if (!userId) return false;
  const n = Math.max(1, Math.floor(count));
  const Membership = await MembershipModel();

  const pipeline = [
    {
      $set: {
        gamesUsed: {
          $min: ["$games", { $add: ["$gamesUsed", n] }],
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

/**
 * Restore N membership credits for the user's most-recent PAID membership.
 */
export async function restoreMembershipCredits(userId: string, count = 1): Promise<boolean> {
  if (!userId) return false;
  const n = Math.max(1, Math.floor(count));
  const Membership = await MembershipModel();

  const pipeline = [
    {
      $set: {
        gamesUsed: {
          $max: [0, { $subtract: ["$gamesUsed", n] }],
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

export async function restoreOneMembershipCredit(userId: string): Promise<boolean> {
  return restoreMembershipCredits(userId, 1);
}
