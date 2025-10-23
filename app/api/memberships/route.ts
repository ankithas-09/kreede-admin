// app/api/memberships/route.ts
import { NextResponse } from "next/server";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User";
import { appendMembershipToSheet } from "@/lib/membershipSheets";


function planDefaults(planId: "1M" | "3M" | "6M") {
  switch (planId) {
    case "1M":
      return { durationMonths: 1, planName: "1 month", games: 25 };
    case "3M":
      return { durationMonths: 3, planName: "3 months", games: 75 };
    case "6M":
      return { durationMonths: 6, planName: "6 months", games: 150 };
    default:
      return { durationMonths: 1, planName: "1 month", games: 25 };
  }
}

type ListQuery = {
  $or?: Array<
    | { userEmail: { $regex: string; $options: string } }
    | { userName: { $regex: string; $options: string } }
    | { userId: { $regex: string; $options: string } }
    | { planId: { $regex: string; $options: string } }
  >;
};

// GET: list memberships
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  const Membership = await MembershipModel();

  const filter: ListQuery = {};
  if (q) {
    filter.$or = [
      { userEmail: { $regex: q, $options: "i" } },
      { userName: { $regex: q, $options: "i" } },
      { userId: { $regex: q, $options: "i" } },
      { planId: { $regex: q, $options: "i" } },
    ];
  }

  const rows = await Membership.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ memberships: rows });
}

// helper: generate memberId based on last 4 aadhar digits and next 3-digit sequence
async function generateMemberId(last4: string): Promise<string> {
  const User = await UserModel();
  const Membership = await MembershipModel();

  const re = new RegExp(`^${last4}\\d{3}$`);

  const [uTop] = await User.find({ memberId: re })
    .select({ memberId: 1 })
    .sort({ memberId: -1 })
    .limit(1)
    .lean();

  const [mTop] = await Membership.find({ memberId: re })
    .select({ memberId: 1 })
    .sort({ memberId: -1 })
    .limit(1)
    .lean();

  const candidates = [uTop?.memberId, mTop?.memberId].filter(Boolean) as string[];
  let maxSeq = 0;
  for (const mid of candidates) {
    const seq = parseInt(mid.slice(4), 10);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }

  const nextSeq = (maxSeq + 1).toString().padStart(3, "0");
  return `${last4}${nextSeq}`; // 7 digits total
}

// POST: create membership (supports both new purchase and restore/renewal)
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const userId = String(body.userId || "").trim();
    const userEmail = String(body.userEmail || "").trim().toLowerCase();
    const userName = String(body.userName || "").trim();
    const planId = String(body.planId || "1M").trim().toUpperCase() as "1M" | "3M" | "6M";
    const amount = Number(body.amount || 0);
    const paidNow = Boolean(body.paidNow);

    // Member identification:
    // - New purchase: provide `aadhar` (12 digits) → generate new memberId
    // - Restore/Renewal: provide `memberId` (7 digits) → reuse that ID; no aadhar required
    const aadharRaw: string = String(body.aadhar || "").trim();
    const memberIdFromBody: string = String(body.memberId || "").trim();

    const hasAadhar = /^\d{12}$/.test(aadharRaw);
    const hasMemberId = /^\d{7}$/.test(memberIdFromBody);

    // Optional hints from client to force append in Sheets
    const mode: "restore" | "new" | undefined = body.mode;
    const forceAppendFlag: boolean = Boolean(body.forceAppend);

    // Validation
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

    // Work out the memberId to persist
    let memberIdToSave: string | undefined;

    if (hasMemberId) {
      // Restore path: trust provided 7-digit memberId (already assigned / being reused)
      memberIdToSave = memberIdFromBody;
      // Do NOT touch aadhar on restore
    } else if (hasAadhar) {
      // New purchase path: generate a fresh memberId using last 4 of aadhar
      const last4 = aadharRaw.slice(-4);
      memberIdToSave = await generateMemberId(last4);

      // Upsert aadhar and memberId on the user
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            aadhar: aadharRaw,
            memberId: memberIdToSave,
          },
        }
      );
    }
    // else: neither provided → no memberId stored (legacy case)

    const Membership = await MembershipModel();
    const d = planDefaults(planId);

    const doc = await Membership.create({
      orderId: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount,
      currency: "INR",
      durationMonths: d.durationMonths,
      games: d.games,
      gamesUsed: 0,
      planId,
      planName: d.planName,
      status: paidNow ? "PAID" : "PENDING",
      userEmail,
      userId: String(user._id),
      userName,
      ...(memberIdToSave ? { memberId: memberIdToSave } : {}),
    });

    // Decide whether to always append a new row in Google Sheets (restore/renewal)
    const isRestore = hasMemberId || mode === "restore" || forceAppendFlag;

    // Sync to Google Sheets (append when restoring; normal upsert otherwise)
    try {
      await appendMembershipToSheet(String(doc._id));
    } catch (e) {
      console.error("Sheets sync (create) failed:", e);
      // Do not fail the API if Sheets is unreachable
    }

    return NextResponse.json(
      {
        ok: true,
        membershipId: String(doc._id),
        status: doc.status,
        ...(memberIdToSave ? { memberId: memberIdToSave } : {}),
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    console.error("Create membership error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE: remove ALL memberships (use with caution)
export async function DELETE() {
  try {
    const Membership = await MembershipModel();
    const r = await Membership.deleteMany({});
    return NextResponse.json({ ok: true, deletedCount: r.deletedCount ?? 0 });
  } catch (e) {
    console.error("Clear memberships error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
