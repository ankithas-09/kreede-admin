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
  // NOT UNIQUE — renewals reuse the same memberId across rows
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

    // Plain (non-unique) index only — renewals reuse the same memberId across rows
    memberId: {
      type: String,
      trim: true,
      match: [/^\d{7}$/, "memberId must be 7 digits"],
      index: true,
    },

    paymentRaw:     { type: Schema.Types.Mixed },
  },
  { collection: "memberships", timestamps: true, strict: true }
);

// helpful indexes
MembershipSchema.index({ userId: 1, status: 1, createdAt: -1 });
MembershipSchema.index({ orderId: 1 }, { unique: true });
MembershipSchema.index({ memberId: 1, createdAt: -1 }); // speeds latest-by-memberId lookups

/* -------------------- GOOGLE SHEETS SYNC MIDDLEWARE -------------------- */

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

// ❌ Removed post("save") — API layer will append a new row on create/restore.
// (This prevents a second write that could overwrite historical rows.)

// For findOneAndUpdate — if gamesUsed changed, update the *latest* row in Sheets for this member
MembershipSchema.post("findOneAndUpdate", async function (this: any, doc: MembershipDoc | null) {
  try {
    if (!doc) return;
    const update = this.getUpdate?.();
    if (!didTouchGamesUsed(update)) return;

    const { updateLatestSheetRowForMembership } = await import("@/lib/membershipSheets");
    await updateLatestSheetRowForMembership(String(doc._id));
  } catch (e) {
    console.error("Sheets sync (post findOneAndUpdate) failed:", e);
  }
});

// For updateOne / updateMany — fetch affected docs and update the *latest* row in Sheets
async function postGenericUpdateSync(this: any) {
  try {
    const update = this.getUpdate?.();
    if (!didTouchGamesUsed(update)) return;

    const Model = this.model as Model<MembershipDoc>;
    const q = this.getQuery?.() || {};
    const ids = await Model.find(q).select({ _id: 1 }).lean();
    if (!ids?.length) return;

    const { updateLatestSheetRowForMembership } = await import("@/lib/membershipSheets");
    for (const id of ids) {
      await updateLatestSheetRowForMembership(String(id._id));
    }
  } catch (e) {
    console.error("Sheets sync (post generic update) failed:", e);
  }
}

MembershipSchema.post("updateOne", postGenericUpdateSync);
MembershipSchema.post("updateMany", postGenericUpdateSync);

/* ----------------- ONE-TIME FIX FOR OLD UNIQUE INDEX ----------------- */
/**
 * In some environments, a previous schema created a UNIQUE index on { memberId: 1 }.
 * This function detects that and replaces it with a non-unique index.
 */
async function ensureNonUniqueMemberIdIndex() {
  try {
    const db = await getDb("kreede_booking");
    const col = db.collection("memberships");

    // read indexes
    const indexes = await col.indexes();
    const memberIdx = indexes.find((i) => i.name === "memberId_1");

    // if index exists and is unique, drop and recreate as non-unique
    if (memberIdx?.unique) {
      console.warn("[Membership] Found UNIQUE index on memberId_1. Dropping and recreating as non-unique…");
      await col.dropIndex("memberId_1");
      await col.createIndex({ memberId: 1 }); // non-unique
      console.warn("[Membership] Recreated memberId_1 as non-unique.");
    }
  } catch (err) {
    // Don't crash app; just log. If it fails, you can still drop manually via mongosh.
    console.error("[Membership] ensureNonUniqueMemberIdIndex failed:", err);
  }
}

/* ----------------------------- MODEL + HELPERS ----------------------------- */

const MODEL_NAME = "Membership";

export async function MembershipModel(): Promise<Model<MembershipDoc>> {
  const db = await getDb("kreede_booking");
  const model =
    (db.models[MODEL_NAME] as Model<MembershipDoc>) ||
    db.model<MembershipDoc>(MODEL_NAME, MembershipSchema);

  // Run the self-healing index check (safe to call repeatedly)
  await ensureNonUniqueMemberIdIndex();

  return model;
}

/**
 * Consume N membership credits for the user's most-recent PAID membership.
 * Sheets sync is handled by the post-update middleware above.
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
 * Sheets sync is handled by the post-update middleware above.
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
