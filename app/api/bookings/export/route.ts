// app/api/bookings/export/route.ts
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { BookingModel } from "@/models/Booking";

type Query = {
  $or?: Array<
    | { userName: { $regex: string; $options: string } }
    | { userEmail: { $regex: string; $options: string } }
  >;
  date?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const date = (url.searchParams.get("date") || "").trim();

  const Booking = await BookingModel();

  const query: Query = {};
  if (q) {
    query.$or = [
      { userName: { $regex: q, $options: "i" } },
      { userEmail: { $regex: q, $options: "i" } },
    ];
  }
  if (date) query.date = date;

  // 👇 Include amount & currency
  const bookings = await Booking.find(query)
    .select({
      userName: 1,
      userEmail: 1,
      date: 1,
      slots: 1,
      amount: 1,
      currency: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Bookings");

  sheet.columns = [
    { header: "User Name", key: "userName", width: 26 },
    { header: "User Email", key: "userEmail", width: 30 },
    { header: "Date", key: "date", width: 14 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Court ID", key: "courtId", width: 10 },
    { header: "Start", key: "start", width: 10 },
    { header: "End", key: "end", width: 10 },
  ];

  for (const b of bookings) {
    const base = {
      userName: (b as { userName?: string }).userName || "",
      userEmail: (b as { userEmail?: string }).userEmail || "",
      date: (b as { date?: string }).date || "",
      amount: typeof (b as { amount?: unknown }).amount === "number" ? (b as { amount: number }).amount : "",
      currency: (b as { currency?: string }).currency || "",
    };

    const slots = (b as { slots?: Array<{ courtId?: number | string; start?: string; end?: string }> }).slots || [];

    if (slots.length) {
      for (const s of slots) {
        sheet.addRow({
          ...base,
          courtId: s?.courtId ?? "",
          start: s?.start || "",
          end: s?.end || "",
        });
      }
    } else {
      sheet.addRow({
        ...base,
        courtId: "",
        start: "",
        end: "",
      });
    }
  }

  sheet.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="bookings.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
