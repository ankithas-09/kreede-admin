import { Schema, models, model } from "mongoose";


const AdminSchema = new Schema(
{
name: { type: String, required: true, trim: true },
email: { type: String, required: true, unique: true, lowercase: true, index: true },
passwordHash: { type: String, required: true },
},
{ timestamps: true, collection: "admins" }
);


export type AdminDoc = {
_id: string;
name: string;
email: string;
passwordHash: string;
};


export const Admin = models.Admin || model("Admin", AdminSchema);