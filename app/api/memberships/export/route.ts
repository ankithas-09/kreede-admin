// app/api/memberships/export/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { MembershipModel } from "@/models/Membership";

function fmtISO(d?: Date | string) {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
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
      planId: 1,
      amount: 1,
      currency: 1,
      durationMonths: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  // Build workbook
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Memberships");

  sheet.columns = [
    { header: "User Name", key: "userName", width: 26 },
    { header: "User Email", key: "userEmail", width: 30 },
    { header: "Plan ID", key: "planId", width: 10 },
    { header: "Amount Paid", key: "amountPaid", width: 16 },
    { header: "Start Date", key: "startDate", width: 14 },
    { header: "End Date", key: "endDate", width: 14 },
  ];

  for (const m of items) {
    const createdAt = (m as { createdAt?: Date | string }).createdAt;
    const start = createdAt ? new Date(createdAt as Date | string) : undefined;
    const durationMonths = (m as { durationMonths?: unknown }).durationMonths;
    const end = start && durationMonths != null ? addMonths(start, Number(durationMonths)) : undefined;

    const amountVal = (m as { amount?: unknown }).amount;
    const currency = (m as { currency?: string }).currency || "";
    const amountPaid =
      typeof amountVal === "number"
        ? `${currency} ${amountVal}`.trim()
        : String((amountVal as unknown) ?? "");

    sheet.addRow({
      userName: (m as { userName?: string }).userName || "",
      userEmail: (m as { userEmail?: string }).userEmail || "",
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
