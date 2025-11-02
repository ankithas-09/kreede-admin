// app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { UserModel } from "@/models/User";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function isPhone(v: string) {
  return /^[0-9+\-\s]{7,15}$/.test(v);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = typeof body.userId === "string" ? body.userId.trim() : undefined;
    const name: string | undefined   = typeof body.name === "string" ? body.name.trim() : undefined;
    const email: string | undefined  = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
    const phone: string | undefined  = typeof body.phone === "string" ? body.phone.trim() : undefined;
    const dobRaw: string | undefined = body.dob != null ? String(body.dob).trim() : undefined;

    if (!userId && !name && !email && !phone && dobRaw === undefined) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    if (email && !isEmail(email)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }
    if (phone && !isPhone(phone)) {
      return NextResponse.json({ error: "Invalid phone." }, { status: 400 });
    }

    const User = await UserModel();

    const existing = await User.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Uniqueness (exclude current)
    if (userId) {
      const clash = await User.findOne({ _id: { $ne: id }, userId }).lean();
      if (clash) return NextResponse.json({ error: "A user with this username (userId) already exists." }, { status: 409 });
    }
    if (email) {
      const clash = await User.findOne({ _id: { $ne: id }, email }).lean();
      if (clash) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }

    // Build update
    const update: Record<string, unknown> = {};
    if (userId !== undefined) update.userId = userId;
    if (name   !== undefined) update.name   = name;
    if (email  !== undefined) update.email  = email;
    if (phone  !== undefined) update.phone  = phone;

    if (dobRaw !== undefined) {
      if (dobRaw === "") {
        // allow clearing DOB
        update.dob = undefined;
      } else {
        const d = new Date(dobRaw);
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: "Invalid DOB." }, { status: 400 });
        }
        update.dob = d.toISOString().slice(0, 10); // YYYY-MM-DD
      }
    }

    // Update and return the fresh document
    const updated = await User.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!updated) {
      return NextResponse.json({ error: "User not found after update." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, user: updated });
  } catch (e: unknown) {
    const err = e as { code?: number; keyPattern?: Record<string, unknown> };
    if (err?.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0] || "field";
      return NextResponse.json({ error: `Duplicate ${key}.` }, { status: 409 });
    }
    console.error("Update user error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
