// app/api/memberships/search/route.ts
import { NextResponse } from "next/server";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User";

/** Escape user text for safe regex */
function escRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanStr(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s.length ? s : undefined;
}

interface MergedRow {
  _id?: string;
  userId?: string;   // username
  name?: string;
  email?: string;
  phone?: string;
}

type MembershipLean = {
  _id?: { toString?: () => string };
  userId?: string;
  userName?: string;
  userEmail?: string;
  createdAt?: Date | string;
};

type UserLean = {
  _id?: { toString?: () => string };
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const qRaw = searchParams.get("q");
    const q = cleanStr(qRaw);
    if (!q) return NextResponse.json({ members: [] });

    const Membership = await MembershipModel();
    const User = await UserModel();

    // 1) Find PAID memberships by name/email (case-insensitive)
    const memberships = (await Membership.find({
      status: "PAID",
      $or: [
        { userName:  { $regex: q, $options: "i" } },
        { userEmail: { $regex: q, $options: "i" } },
      ],
    })
      .select({ userId: 1, userName: 1, userEmail: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(150)
      .lean()) as MembershipLean[];

    if (!memberships.length) {
      return NextResponse.json({ members: [] });
    }

    // 2) Join with Users by email (case-insensitive exact)
    const emails = Array.from(
      new Set(
        memberships
          .map((m: MembershipLean) => cleanStr(m.userEmail))
          .filter(Boolean) as string[]
      )
    );
    const emailRegexes = emails.map((e) => new RegExp(`^${escRe(e)}$`, "i"));

    const users = (await User.find({ email: { $in: emailRegexes } })
      .select({ userId: 1, name: 1, email: 1, phone: 1 })
      .lean()) as UserLean[];

    const byEmailLC = new Map<string, UserLean>();
    for (const u of users) {
      const key = cleanStr(u.email)?.toLowerCase();
      if (key) byEmailLC.set(key, u);
    }

    // 3) Merge and normalize: prefer User fields; fallback to Membership
    const merged: MergedRow[] = memberships.map((m: MembershipLean) => {
      const mEmail = cleanStr(m.userEmail);
      const key = mEmail?.toLowerCase();
      const u = key ? byEmailLC.get(key) : undefined;

      const name  = cleanStr(u?.name) ?? cleanStr(m.userName);
      const email = cleanStr(u?.email) ?? mEmail;
      const phone = cleanStr(u?.phone);

      return {
        _id: cleanStr(u?._id?.toString?.()) ?? cleanStr(m._id?.toString?.()),
        userId: cleanStr(u?.userId) ?? cleanStr(m.userId),
        name,
        email,
        phone,
      };
    });

    // 4) Dedupe by email (keep first = latest due to sorting)
    const seen = new Set<string>();
    const unique = merged.filter((row: MergedRow) => {
      const k = cleanStr(row.email)?.toLowerCase();
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return NextResponse.json({ members: unique });
  } catch (e: unknown) {
    console.error("memberships/search error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error", members: [] },
      { status: 500 }
    );
  }
}
