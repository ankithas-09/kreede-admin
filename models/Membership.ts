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

  // 7-digit member id (last 4 of aadhar + 3-digit sequence)
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

    // enforce 7 digits; unique+sparse so older rows without memberId are fine
    memberId:       {
      type: String,
      trim: true,
      match: [/^\d{7}$/, "memberId must be 7 digits"],
      index: { unique: true, sparse: true },
    },

    paymentRaw:     { type: Schema.Types.Mixed },
  },
  { collection: "memberships", timestamps: true, strict: true }
);

// helpful compound indexes
MembershipSchema.index({ userId: 1, status: 1, createdAt: -1 });
MembershipSchema.index({ orderId: 1 }, { unique: true });

/* -------------------------- SHEETS SYNC MIDDLEWARE -------------------------- */

// Detect if an update object/pipeline touches `gamesUsed`
function didTouchGamesUsed(update: any): boolean {
  if (!update) return false;

  // Classic modifier updates
  if (typeof update === "object" && !Array.isArray(update)) {
    if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, "gamesUsed")) return true;
    if (update.$inc && Object.prototype.hasOwnProperty.call(update.$inc, "gamesUsed")) return true;
    if (Object.prototype.hasOwnProperty.call(update, "gamesUsed")) return true;
  }

  // Aggregation pipeline updates (array form)
  if (Array.isArray(update)) {
    return update.some((stage) => {
      const setter = stage?.$set || stage?.$addFields;
      return setter && Object.prototype.hasOwnProperty.call(setter, "gamesUsed");
    });
  }

  return false;
}

// After CREATE/SAVE — keep sheet in sync for newly created or fully saved docs
MembershipSchema.post("save", async function (doc: MembershipDoc) {
  try {
    const { upsertMembershipToSheet } = await import("@/lib/membershipSheets");
    await upsertMembershipToSheet(String(doc._id));
  } catch (e) {
    console.error("Sheets sync (post save) failed:", e);
  }
});

// For findOneAndUpdate — we have the updated doc, so sync if gamesUsed was touched
MembershipSchema.post("findOneAndUpdate", async function (this: any, doc: MembershipDoc | null) {
  try {
    if (!doc) return;
    const update = this.getUpdate?.();
    if (!didTouchGamesUsed(update)) return;

    const { upsertMembershipToSheet } = await import("@/lib/membershipSheets");
    await upsertMembershipToSheet(String(doc._id));
  } catch (e) {
    console.error("Sheets sync (post findOneAndUpdate) failed:", e);
  }
});

// For updateOne / updateMany — we may not have docs returned; fetch affected docs and sync
async function postGenericUpdateSync(this: any) {
  try {
    const update = this.getUpdate?.();
    if (!didTouchGamesUsed(update)) return;

    const Model = this.model as Model<MembershipDoc>;
    const q = this.getQuery?.() || {};
    // Find affected docs (ids only); in practice this is small since you usually update the latest PAID membership
    const ids = await Model.find(q).select({ _id: 1 }).lean();
    if (!ids?.length) return;

    const { upsertMembershipToSheet } = await import("@/lib/membershipSheets");
    for (const id of ids) {
      await upsertMembershipToSheet(String(id._id));
    }
  } catch (e) {
    console.error("Sheets sync (post generic update) failed:", e);
  }
}

MembershipSchema.post("updateOne", postGenericUpdateSync);
MembershipSchema.post("updateMany", postGenericUpdateSync);

/* ----------------------------- MODEL + HELPERS ----------------------------- */

const MODEL_NAME = "Membership";

export async function MembershipModel(): Promise<Model<MembershipDoc>> {
  const db = await getDb("kreede_booking");
  return (db.models[MODEL_NAME] as Model<MembershipDoc>) || db.model<MembershipDoc>(MODEL_NAME, MembershipSchema);
}

/**
 * Consume N membership credits for the user's most-recent PAID membership.
 * Also upserts the corresponding row in Google Sheets.
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

  if (updated?._id) {
    try {
      const { upsertMembershipToSheet } = await import("@/lib/membershipSheets");
      await upsertMembershipToSheet(String(updated._id));
    } catch (e) {
      console.error("Sheets sync (use credits) failed:", e);
    }
  }

  return !!updated;
}

/**
 * Restore N membership credits for the user's most-recent PAID membership.
 * Also upserts the corresponding row in Google Sheets.
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

  if (updated?._id) {
    try {
      const { upsertMembershipToSheet } = await import("@/lib/membershipSheets");
      await upsertMembershipToSheet(String(updated._id));
    } catch (e) {
      console.error("Sheets sync (restore credits) failed:", e);
    }
  }

  return !!updated;
}

export async function restoreOneMembershipCredit(userId: string): Promise<boolean> {
  return restoreMembershipCredits(userId, 1);
}
