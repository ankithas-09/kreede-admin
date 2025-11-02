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

    // Pull fields if present; allow empty string for email/dob to "clear"
    const userId: string | undefined =
      typeof body.userId === "string" ? body.userId.trim() : undefined;
    const name: string | undefined =
      typeof body.name === "string" ? body.name.trim() : undefined;
    const rawEmail: string | undefined =
      typeof body.email === "string" ? body.email.trim() : undefined; // may be "" to clear
    const phone: string | undefined =
      typeof body.phone === "string" ? body.phone.trim() : undefined;
    const dobRaw: string | undefined =
      body.dob != null ? String(body.dob).trim() : undefined; // may be "" to clear

    // Nothing to update?
    if (
      userId === undefined &&
      name === undefined &&
      rawEmail === undefined &&
      phone === undefined &&
      dobRaw === undefined
    ) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    // Validate optional fields only if provided (and non-empty in case of email)
    if (rawEmail && !isEmail(rawEmail.toLowerCase())) {
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

    // Uniqueness checks (exclude current)
    if (userId) {
      const clash = await User.findOne({ _id: { $ne: id }, userId }).lean();
      if (clash) {
        return NextResponse.json(
          { error: "A user with this username (userId) already exists." },
          { status: 409 }
        );
      }
    }
    // Only check email uniqueness if provided and non-empty (clearing is allowed)
    if (rawEmail && rawEmail !== "") {
      const email = rawEmail.toLowerCase();
      const clash = await User.findOne({ _id: { $ne: id }, email }).lean();
      if (clash) {
        return NextResponse.json(
          { error: "A user with this email already exists." },
          { status: 409 }
        );
      }
    }

    // Build update operators
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, unknown> = {};

    if (userId !== undefined) $set.userId = userId;
    if (name !== undefined) $set.name = name;

    if (rawEmail !== undefined) {
      if (rawEmail === "") {
        // Clear the email field
        $unset.email = "";
      } else {
        $set.email = rawEmail.toLowerCase();
      }
    }

    if (phone !== undefined) $set.phone = phone;

    if (dobRaw !== undefined) {
      if (dobRaw === "") {
        // Clear DOB
        $unset.dob = "";
      } else {
        const d = new Date(dobRaw);
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: "Invalid DOB." }, { status: 400 });
        }
        $set.dob = d.toISOString().slice(0, 10); // YYYY-MM-DD
      }
    }

    const updateDoc: Record<string, unknown> = {};
    if (Object.keys($set).length) updateDoc.$set = $set;
    if (Object.keys($unset).length) updateDoc.$unset = $unset;

    // Update and return the fresh document
    const updated = await User.findByIdAndUpdate(id, updateDoc, { new: true }).lean();
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
