// models/Admin.ts
import type mongoose from "mongoose";
import { Schema } from "mongoose";
import { getDb } from "@/lib/db";

export interface AdminDoc extends mongoose.Document {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema = new Schema<AdminDoc>(
  {
    name: { type: String, required: true, trim: true },
    // Use a single unique index (avoid `unique: true` + separate `index: true` combo)
    email: { type: String, required: true, lowercase: true, trim: true, index: { unique: true } },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true, collection: "admins", strict: true }
);

const MODEL_NAME = "Admin";

export async function AdminModel(): Promise<mongoose.Model<AdminDoc>> {
  const db = await getDb("kreede"); // same DB your app logs as [mongo:kreede]
  return (db.models[MODEL_NAME] as mongoose.Model<AdminDoc>) 
      || db.model<AdminDoc>(MODEL_NAME, AdminSchema);
}
