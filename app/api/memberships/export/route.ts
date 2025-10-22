// app/api/memberships/export/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { MembershipModel } from "@/models/Membership";
import { UserModel } from "@/models/User";

function fmtISO(d?: Date | string) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}-${month}-${year}`; // DD-MM-YYYY format
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

type PlanId = "1M" | "3M" | "6M";
type Query = {
  $or?: Array<
    | { userName: { $regex: string; $options: string } }
    | { userEmail: { $regex: string; $options: string } }
  >;
  planId?: PlanId;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const plan = (url.searchParams.get("plan") || "all") as "all" | PlanId;

  const Membership = await MembershipModel();
  const User = await UserModel();

  const query: Query = {};
  if (q) {
    query.$or = [
      { userName: { $regex: q, $options: "i" } },
      { userEmail: { $regex: q, $options: "i" } },
    ];
  }
  if (plan && plan !== "all") {
    query.planId = plan;
  }

  const items = await Membership.find(query)
    .select({
      userName: 1,
      userEmail: 1,
      userId: 1,
      planId: 1,
      amount: 1,
      currency: 1,
      durationMonths: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  // Fetch phone numbers for all users in one go
  const userIds = items.map((m) => m.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select({ phone: 1 })
    .lean();

  const phoneMap = new Map<string, string>();
  for (const u of users) {
    phoneMap.set(String(u._id), u.phone || "");
  }

  // Build workbook
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Memberships");

  sheet.columns = [
    { header: "User Name", key: "userName", width: 26 },
    { header: "User Email", key: "userEmail", width: 30 },
    { header: "Phone Number", key: "phoneNumber", width: 20 },
    { header: "Plan ID", key: "planId", width: 10 },
    { header: "Amount Paid", key: "amountPaid", width: 16 },
    { header: "Start Date", key: "startDate", width: 14 },
    { header: "End Date", key: "endDate", width: 14 },
  ];

  for (const m of items) {
    const createdAt = (m as { createdAt?: Date | string }).createdAt;
    const start = createdAt ? new Date(createdAt as Date | string) : undefined;
    const durationMonths = (m as { durationMonths?: unknown }).durationMonths;
    const end =
      start && durationMonths != null ? addMonths(start, Number(durationMonths)) : undefined;

    const amountVal = (m as { amount?: unknown }).amount;
    const currency = (m as { currency?: string }).currency || "";
    const amountPaid =
      typeof amountVal === "number"
        ? `${currency} ${amountVal}`.trim()
        : String((amountVal as unknown) ?? "");

    const phoneNumber = phoneMap.get(String(m.userId)) || "";

    sheet.addRow({
      userName: (m as { userName?: string }).userName || "",
      userEmail: (m as { userEmail?: string }).userEmail || "",
      phoneNumber,
      planId: (m as { planId?: string }).planId || "",
      amountPaid,
      startDate: fmtISO(start),
      endDate: fmtISO(end),
    });
  }

  sheet.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="memberships.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
