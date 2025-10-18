// models/Registrations.ts
import mongoose, { Schema } from "mongoose";
import { bookingConnection } from "@/lib/dbBookings";

export interface RegistrationDoc extends mongoose.Document {
  eventId: string;
  eventTitle?: string;

  // Registered account (member/user)
  userId?: string;          // username/handle
  userEmail?: string;       // normalized to lowercase
  userName?: string;

  // Guest-only fields
  guestId?: string;         // synthetic unique id per guest (e.g., "guest_...")
  guestName?: string;
  guestPhone?: string;

  // Payment/order metadata
  orderId?: string;         // Cashfree order id (optional)
  amount?: number;          // entry fee amount
  currency?: string;        // "INR"
  adminPaid?: boolean;      // admin-marked payment flag

  // ❗ Allow "REFUNDED" so we can mark after a successful/manual refund
  status?: "PAID" | "REFUNDED";

  paymentRef?: string;      // e.g. "CASH" / "ONLINE" / "FREE"

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

    // Guest-only
    guestId: { type: String, index: true },
    guestName: { type: String },
    guestPhone: { type: String },

    // Order / payment
    orderId: { type: String }, // optional
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    adminPaid: { type: Boolean, default: true },

    // ❗ Now supports "REFUNDED"
    status: { type: String, enum: ["PAID", "REFUNDED"], default: "PAID" },

    paymentRef: { type: String },
  },
  { timestamps: true, collection: "registrations", strict: true }
);

/**
 * ✅ Correct indexes
 * - Allow multiple registrations per event when userId/userEmail are missing (guest case)
 * - Enforce uniqueness for a given event only when identifiers are present
 */
RegistrationSchema.index(
  { eventId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $type: "string", $ne: "" } },
    name: "uniq_event_userId",
  }
);

RegistrationSchema.index(
  { eventId: 1, userEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { userEmail: { $type: "string", $ne: "" } },
    name: "uniq_event_userEmail",
  }
);

RegistrationSchema.index(
  { eventId: 1, guestId: 1 },
  {
    unique: true,
    partialFilterExpression: { guestId: { $type: "string", $ne: "" } },
    name: "uniq_event_guestId",
  }
);

// ---------------------------------------------------------------------------
/**
 * One-time migration to drop legacy non-partial unique indexes that caused
 * E11000 on { eventId, userId: null } or { eventId, userEmail: null }.
 * Safe to keep at runtime; guarded and will only run once per process.
 */
// ---------------------------------------------------------------------------
let didMigrateIndexes = false;

export async function RegistrationModel() {
  const conn = await bookingConnection();
  const Model =
    (conn.models.Registration as mongoose.Model<RegistrationDoc>) ||
    conn.model<RegistrationDoc>("Registration", RegistrationSchema);

  if (!didMigrateIndexes) {
    try {
      // TS-safe access to the native driver DB, with runtime guard
      const dbAny = (conn as unknown as { db?: { collection: (name: string) => any } }).db;
      if (dbAny && typeof dbAny.collection === "function") {
        const coll = dbAny.collection("registrations");
        const existing = await coll.indexes();

        // legacy indexes to remove (no partialFilterExpression)
        const legacyNames = new Set<string>([
          "eventId_1_userId_1",
          "eventId_1_userEmail_1",
        ]);

        for (const idx of existing) {
          // legacy if same name and NO partial filter
          if (legacyNames.has(idx.name) && !("partialFilterExpression" in idx)) {
            try {
              await coll.dropIndex(idx.name);
              console.warn(`[registrations] Dropped legacy index: ${idx.name}`);
            } catch (e) {
              console.warn(`[registrations] Could not drop index ${idx.name}:`, e);
            }
          }
        }
      } else {
        console.warn("[registrations] Skipping legacy index drop: conn.db unavailable");
      }

      // Ensure the correct (partial unique) indexes are present
      await Model.syncIndexes();
      didMigrateIndexes = true;
    } catch (e) {
      console.warn("[registrations] Index migration skipped/failed:", e);
    }
  }

  return Model;
}
