// models/User.ts
import type mongoose from "mongoose";
import { Schema } from "mongoose";
import { bookingConnection } from "@/lib/dbBookings";

export interface UserDoc extends mongoose.Document {
  userId: string;
  name: string;
  email: string;
  phone: string;
  dob?: string;

  // NEW
  aadhar?: string;    // exactly 12 digits
  memberId?: string;  // exactly 7 digits: last4(aadhar)+NNN (e.g., "1234001")

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    userId:  { type: String, required: true, trim: true, index: { unique: true } },
    name:    { type: String, required: true, trim: true },
    email:   { type: String, required: true, lowercase: true, trim: true, index: { unique: true } },
    phone:   { type: String, required: true, trim: true },
    dob:     { type: String },

    // NEW: enforce formats; keep sparse so existing rows without these fields are fine
    aadhar:   { type: String, trim: true, match: [/^\d{12}$/, "Aadhar must be 12 digits"], index: true, sparse: true },
    memberId: { type: String, trim: true, match: [/^\d{7}$/,  "memberId must be 7 digits"], index: { unique: true, sparse: true } },
  },
  { timestamps: true, collection: "users", strict: true }
);

export async function UserModel() {
  const conn = await bookingConnection();
  return (conn.models.User as mongoose.Model<UserDoc>) ||
         conn.model<UserDoc>("User", UserSchema);
}
