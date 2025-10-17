import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Admin } from "@/models/Admin";
import { signupSchema } from "@/lib/validators";
import bcrypt from "bcryptjs";
import { signJwt } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await dbConnect();
    const json = await req.json();
    const parsed = signupSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { name, email, password } = parsed.data;

    const exists = await Admin.findOne({ email });
    if (exists) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ name, email, passwordHash });

    const token = signJwt({ sub: admin._id.toString(), email: admin.email, name: admin.name });

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
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
