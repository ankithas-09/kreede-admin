// models/Offer.ts
import mongoose, { Schema, type Model } from "mongoose";
import { bookingConnection } from "@/lib/dbBookings";

export type OfferType = "flat" | "conditional";
export type Criteria = "one_woman" | "all_women" | "mixed";

export interface ConditionalRule {
  label: string;
  price: number;
  criteria?: string;
}

export interface OfferDoc extends mongoose.Document {
  title: string;
  description?: string;
  type: OfferType;
  dateFrom: Date;
  dateTo: Date;
  timeFrom: string; // "HH:mm"
  timeTo: string;   // "HH:mm"
  flatPrice?: number;
  rules?: ConditionalRule[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConditionalRuleSchema = new Schema<ConditionalRule>(
  {
    label:   { type: String, required: true, trim: true },
    price:   { type: Number, required: true, min: 0 },
    criteria:{ type: String, required: false, trim: true },
  },
  { _id: false }
);

const OfferSchema = new Schema<OfferDoc>(
  {
    title:     { type: String, required: true, trim: true },
    description:{ type: String, trim: true },
    type:      { type: String, enum: ["flat", "conditional"], required: true },
    dateFrom:  { type: Date, required: true },
    dateTo:    { type: Date, required: true },
    timeFrom:  { type: String, required: true }, // "06:00"
    timeTo:    { type: String, required: true }, // "10:00"
    flatPrice: { type: Number, min: 0 },
    rules:     { type: [ConditionalRuleSchema], default: [] },
    active:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

OfferSchema.index({ active: 1, dateFrom: 1, dateTo: 1 });

export type OfferModelType = Model<OfferDoc>;

let _OfferModel: OfferModelType | null = null;

async function getBookingsConn(): Promise<mongoose.Connection> {
  const maybeFn = bookingConnection as unknown as (() => Promise<mongoose.Connection>) | mongoose.Connection;
  return typeof maybeFn === "function" ? await (maybeFn as any)() : (maybeFn as mongoose.Connection);
}

export async function getOfferModel(): Promise<OfferModelType> {
  if (_OfferModel) return _OfferModel;
  const conn = await getBookingsConn();
  _OfferModel = (conn.models.Offer as OfferModelType | undefined)
    ?? conn.model<OfferDoc>("Offer", OfferSchema, "offers"); // explicit collection
  return _OfferModel;
}
