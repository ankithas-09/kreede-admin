// models/Event.ts
import mongoose, { Schema, type Model, type Types } from "mongoose";
import { getDb } from "@/lib/db";

export interface EventDoc extends mongoose.Document {
  _id: Types.ObjectId;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  entryFee?: number;
  link: string;
  description?: string;
  tags?: string[];
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<EventDoc>(
  {
    title: { type: String, required: true, trim: true },
    // date range
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate:   { type: String, required: true }, // YYYY-MM-DD
    // optional times
    startTime: { type: String },
    endTime:   { type: String },
    // entry fee
    entryFee:  { type: Number },
    // link + extras
    link:        { type: String, required: true },
    description: { type: String },
    tags:        { type: [String], default: [] },
    createdBy:   { type: String },
  },
  { collection: "events_and_announcements", timestamps: true }
);

// Keep a stable, single model name to avoid duplicate model compilation.
const MODEL_NAME = "EventV3";

export async function EventModel(): Promise<Model<EventDoc>> {
  const db = await getDb("kreede_booking");
  return (db.models[MODEL_NAME] as Model<EventDoc>) || db.model<EventDoc>(MODEL_NAME, EventSchema);
}
