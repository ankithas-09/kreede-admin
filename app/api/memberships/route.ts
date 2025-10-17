// app/api/memberships/route.ts
import { NextResponse } from "next/server";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User";

function planDefaults(planId: "1M" | "3M" | "6M") {
  switch (planId) {
    case "1M": return { durationMonths: 1, planName: "1 month", games: 30 };
    case "3M": return { durationMonths: 3, planName: "3 months", games: 90 };
    case "6M": return { durationMonths: 6, planName: "6 months", games: 180 };
    default:   return { durationMonths: 1, planName: "1 month", games: 30 };
  }
}

type ListQuery = {
  $or?: Array<
    | { userEmail: { $regex: string; $options: string } }
    | { userName:  { $regex: string; $options: string } }
    | { userId:    { $regex: string; $options: string } }
    | { planId:    { $regex: string; $options: string } }
  >;
};

// List memberships (unchanged style)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  const Membership = await MembershipModel();

  const filter: ListQuery = {};
  if (q) {
    filter.$or = [
      { userEmail: { $regex: q, $options: "i" } },
      { userName:  { $regex: q, $options: "i" } },
      { userId:    { $regex: q, $options: "i" } },
      { planId:    { $regex: q, $options: "i" } },
    ];
  }

  const rows = await Membership.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ memberships: rows });
}

// Create membership (optionally PAID immediately)
// Body: { userEmail, userName, userId?(username), planId: "1M"|"3M"|"6M", amount, paidNow?: boolean }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId   = (body.userId || "").trim();
    const userEmail= (body.userEmail || "").trim().toLowerCase();
    const userName = (body.userName || "").trim();
    const planId   = (body.planId || "1M").trim().toUpperCase();
    const amount   = Number(body.amount || 0);
    const paidNow  = Boolean(body.paidNow);

    if (!userEmail || !userName) {
      return NextResponse.json({ error: "userEmail and userName are required." }, { status: 400 });
    }
    if (!["1M", "3M", "6M"].includes(planId)) {
      return NextResponse.json({ error: "Invalid planId." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
    }

    const User = await UserModel();
    const user = await User.findOne({ $or: [{ userId }, { email: userEmail }] }).lean();
    if (!user) {
      return NextResponse.json({ error: "User not found. Please create the user first." }, { status: 404 });
    }

    const Membership = await MembershipModel();
    const d = planDefaults(planId as "1M" | "3M" | "6M");

    const doc = await Membership.create({
      orderId: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount,
      currency: "INR",
      durationMonths: d.durationMonths,
      games: d.games,
      gamesUsed: 0,
      planId,
      planName: d.planName,
      status: paidNow ? "PAID" : "PENDING",  // 👈 create as PAID if requested
      userEmail,
      userId: String(user._id),
      userName,
    });

    return NextResponse.json({ ok: true, membershipId: String(doc._id), status: doc.status }, { status: 201 });
  } catch (e: unknown) {
    console.error("Create membership error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
