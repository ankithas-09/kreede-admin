// app/api/auth/signin/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signinSchema } from "@/lib/validators";
import { signJwt } from "@/lib/auth";
import { AdminModel } from "@/models/Admin";

type AdminLean = {
  _id: unknown;
  name: string;
  email: string;
  passwordHash: string;
};

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = signinSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // Use the scoped Admin model (per-DB connection)
    const Admin = await AdminModel();

    // Lean object is fine here (we just read fields)
    const admin = await Admin.findOne({ email })
      .select({ name: 1, email: 1, passwordHash: 1 })
      .lean<AdminLean | null>();

    if (!admin) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signJwt({
      sub: String(admin._id),
      email: admin.email,
      name: admin.name,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set("auth", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Number(process.env.JWT_EXPIRES_DAYS ?? 180) * 24 * 60 * 60,
    });
    return res;
  } catch (e) {
    console.error("signin error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
