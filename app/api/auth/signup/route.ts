// app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signupSchema } from "@/lib/validators";
import { signJwt } from "@/lib/auth";
import { AdminModel } from "@/models/Admin";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = signupSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { name, email, password } = parsed.data;

    const Admin = await AdminModel();

    const exists = await Admin.findOne({ email }).lean();
    if (exists) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // 👇 Explicitly type admin so _id is recognized
    const admin = (await Admin.create({ name, email, passwordHash })) as {
      _id: { toString: () => string };
      email: string;
      name: string;
    };

    const token = signJwt({
      sub: admin._id.toString(),
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
    console.error("signup error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
