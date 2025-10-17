// app/api/users/export/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { UserModel } from "@/models/User";
import { MembershipModel } from "@/models/Membership";

type UserLean = {
  _id: string | { toString?: () => string };
  name?: string;
  email?: string;
  phone?: string;
  dob?: string | Date;
};

type MembershipLean = {
  userId?: string;
  userEmail?: string;
  userName?: string;
  planId?: string;
  planName?: string;
  status?: string;
  createdAt?: string | Date;
};

type UserQuery = {
  name?: { $regex: string; $options: string };
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const filter = (url.searchParams.get("filter") || "all") as
    | "all"
    | "members"
    | "nonmembers";

  const User = await UserModel();
  const Membership = await MembershipModel();

  const userQuery: UserQuery = {};
  if (q) {
    userQuery.name = { $regex: q, $options: "i" };
  }

  const users = (await User.find(userQuery)
    .select({ name: 1, email: 1, phone: 1, dob: 1 })
    .sort({ createdAt: -1 })
    .lean()) as UserLean[];

  const ids = users.map((u) =>
    typeof u._id === "string" ? u._id : u._id?.toString?.() || ""
  );
  const emails = users
    .map((u) => (u.email || "").toLowerCase())
    .filter(Boolean);
  const names = users.map((u) => (u.name || "").trim()).filter(Boolean);

  const members = (await Membership.find({
    $or: [
      { userId: { $in: ids } },
      { userEmail: { $in: emails } },
      { userName: { $in: names } },
    ],
  })
    .select({
      userId: 1,
      userEmail: 1,
      userName: 1,
      planId: 1,
      planName: 1,
      status: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean()) as MembershipLean[];

  const byId = new Map<string, MembershipLean>();
  const byEmail = new Map<string, MembershipLean>();
  const byName = new Map<string, MembershipLean>();
  for (const m of members) {
    if (m.userId && !byId.has(m.userId)) byId.set(m.userId, m);
    const em = (m.userEmail || "").toLowerCase();
    if (em && !byEmail.has(em)) byEmail.set(em, m);
    const nm = (m.userName || "").trim();
    if (nm && !byName.has(nm)) byName.set(nm, m);
  }

  const getMembershipForUser = (u: UserLean): MembershipLean | null => {
    const idKey = typeof u._id === "string" ? u._id : u._id?.toString?.() || "";
    return (
      byId.get(idKey) ||
      byEmail.get((u.email || "").toLowerCase()) ||
      byName.get((u.name || "").trim()) ||
      null
    );
  };

  // Apply the same filter logic
  const filtered = users.filter((u) => {
    const hasMembership = !!getMembershipForUser(u);
    if (filter === "members") return hasMembership;
    if (filter === "nonmembers") return !hasMembership;
    return true;
  });

  // Build workbook
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Users");

  sheet.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "DOB", key: "dob", width: 14 },
    { header: "Membership", key: "membership", width: 22 },
    { header: "Plan Name", key: "planName", width: 18 },
    { header: "Status", key: "status", width: 12 },
  ];

  for (const u of filtered) {
    const m = getMembershipForUser(u);
    sheet.addRow({
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      dob: u.dob ? new Date(u.dob).toISOString().slice(0, 10) : "",
      membership: m ? m.planId : "No membership",
      planName: m?.planName || "",
      status: m?.status || "",
    });
  }

  const buf = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="users.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
