// app/api/users/route.ts
import { NextResponse } from "next/server";
import { UserModel } from "@/models/User";

// Basic (lightweight) validation
function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function isPhone(v: string) {
  return /^[0-9+\-\s]{7,15}$/.test(v);
}

type UserQuery = {
  $or?: Array<
    | { name: { $regex: string; $options: string } }
    | { email: { $regex: string; $options: string } }
    | { phone: { $regex: string; $options: string } }
    | { userId: { $regex: string; $options: string } }
  >;
};

export async function GET(req: Request) {
  const User = await UserModel();

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  const filter: UserQuery = {};
  if (q) {
    filter.$or = [
      { name:   { $regex: q, $options: "i" } },
      { email:  { $regex: q, $options: "i" } },
      { phone:  { $regex: q, $options: "i" } },
      { userId: { $regex: q, $options: "i" } },
    ];
  }

  const users = await User.find(filter)
    .select({ userId: 1, name: 1, email: 1, phone: 1, dob: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = String(body.userId || "").trim();   // “username”
    const name   = String(body.name   || "").trim();
    const email  = String(body.email  || "").trim().toLowerCase();
    const phone  = String(body.phone  || "").trim();
    const dobRaw = body.dob != null ? String(body.dob).trim() : ""; // optional

    if (!userId || !name || !email || !phone) {
      return NextResponse.json({ error: "All fields except DOB are required." }, { status: 400 });
    }
    if (!isEmail(email)) return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    if (!isPhone(phone)) return NextResponse.json({ error: "Invalid phone." }, { status: 400 });

    // Normalize DOB to YYYY-MM-DD if provided
    let dob: string | undefined = undefined;
    if (dobRaw) {
      const d = new Date(dobRaw);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid DOB." }, { status: 400 });
      }
      const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
      dob = iso;
    }

    const User = await UserModel();

    // Unique checks
    const existing = await User.findOne({ $or: [{ userId }, { email }] }).lean();
    if (existing) {
      const conflict =
        (existing as { userId?: string })?.userId === userId ? "username (userId)" :
        (existing as { email?: string })?.email  === email  ? "email" : "record";
      return NextResponse.json({ error: `A user with this ${conflict} already exists.` }, { status: 409 });
    }

    const doc = await User.create({ userId, name, email, phone, dob });
    return NextResponse.json({ ok: true, user: { _id: doc._id, userId, name, email, phone, dob } }, { status: 201 });
  } catch (e: unknown) {
    // Handle duplicate key (race)
    const err = e as { code?: number; keyPattern?: Record<string, unknown> };
    if (err?.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0] || "field";
      return NextResponse.json({ error: `Duplicate ${key}.` }, { status: 409 });
    }
    console.error("Create user error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
