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
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    userId: { type: String, required: true, trim: true, index: { unique: true } },
    name:   { type: String, required: true, trim: true },
    email:  { type: String, required: true, lowercase: true, trim: true, index: { unique: true } },
    phone:  { type: String, required: true, trim: true },
    dob:    { type: String },
  },
  { timestamps: true, collection: "users", strict: true }
);

export async function UserModel() {
  const conn = await bookingConnection();
  return (conn.models.User as mongoose.Model<UserDoc>) ||
         conn.model<UserDoc>("User", UserSchema);
}
