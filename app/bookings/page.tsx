// app/bookings/page.tsx
import { BookingModel } from "@/models/Booking";
import CancelButton from "./CancelButton";
import MarkPaidButton from "./MarkPaidButton";

type SearchParams = {
  q?: string;   // search by name/email
  date?: string; // YYYY-MM-DD
};

type MongoQuery = {
  $or?: Array<
    | { userName: { $regex: string; $options: string } }
    | { userEmail: { $regex: string; $options: string } }
  >;
  date?: string;
};

type BookingLean = {
  _id: string | { toString?: () => string };
  userName?: string;
  userEmail?: string;
  date?: string;
  slots?: Array<{ courtId?: number; start?: string; end?: string }>;
  amount?: number;
  currency?: string;
  paymentRef?: string;   // e.g., "CASH" | "MEMBERSHIP" | "ONLINE" | "PAID.CASH" | "UNPAID.CASH"
  adminPaid?: boolean;   // true -> PAID.<ref>, false -> UNPAID.<ref>
  createdAt?: Date | string;
};

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const Booking = await BookingModel();

  const q = (searchParams.q || "").trim();
  const date = (searchParams.date || "").trim();

  // Build Mongo query
  const query: MongoQuery = {};
  if (q) {
    query.$or = [
      { userName: { $regex: q, $options: "i" } },
      { userEmail: { $regex: q, $options: "i" } },
    ];
  }
  if (date) query.date = date;

  // Fetch bookings (newest first) including amount/currency/paymentRef/adminPaid
  const bookings = (await Booking.find(query)
    .select({
      userName: 1,
      userEmail: 1,
      date: 1,
      slots: 1,
      amount: 1,
      currency: 1,
      paymentRef: 1,
      adminPaid: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean()) as BookingLean[];

  type Row = {
    bookingId: string;
    userName: string;
    userEmail: string;
    date: string;
    amount: number | null;
    currency?: string;
    paymentRef?: string;
    adminPaid?: boolean;
    courtId: number | null;
    start: string;
    end: string;
    slotIndex: number;
  };

  const toIdString = (v: BookingLean["_id"]) =>
    typeof v === "string" ? v : v?.toString?.() || "";

  const rows: Row[] = [];
  for (const b of bookings) {
    const base = {
      bookingId: toIdString(b._id),
      userName: b.userName || "—",
      userEmail: b.userEmail || "—",
      date: b.date || "—",
      amount: typeof b.amount === "number" ? b.amount : null,
      currency: b.currency || undefined,
      paymentRef: b.paymentRef || undefined,
      adminPaid: b.adminPaid === true,
    };
    if (Array.isArray(b.slots) && b.slots.length) {
      b.slots.forEach((s, idx: number) => {
        rows.push({
          ...base,
          courtId: typeof s?.courtId === "number" ? s.courtId : null,
          start: s?.start || "—",
          end: s?.end || "—",
          slotIndex: idx,
        });
      });
    } else {
      rows.push({ ...base, courtId: null, start: "—", end: "—", slotIndex: -1 });
    }
  }

  // Export URL with current filters
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (date) params.set("date", date);
  const exportHref = `/api/bookings/export${params.toString() ? `?${params.toString()}` : ""}`;

  const amountDisplay = (a: number | null, cur?: string) =>
    a == null ? "—" : `${cur ? cur + " " : ""}${a}`;

  // ✅ Normalize paymentRef and infer paid state from adminPaid OR "PAID." prefix in the ref.
  // This ensures guest bookings created with "Create & Mark Paid" (paymentRef="PAID.CASH") show as PAID.CASH.
  const paymentBadge = (paid?: boolean, ref?: string) => {
    const raw = (ref || "").toUpperCase().trim();
    const normalizedRef = raw.replace(/^PAID\./, "").replace(/^UNPAID\./, "");
    const isPaid = paid === true || raw.startsWith("PAID.");
    const text = `${isPaid ? "PAID" : "UNPAID"}${normalizedRef ? `.${normalizedRef}` : ""}`;

    return (
      <span
        className="badge"
        style={
          isPaid
            ? undefined
            : { background: "#fff0f0", borderColor: "rgba(176,0,32,0.35)", color: "#b00020" }
        }
      >
        {text}
      </span>
    );
  };

  return (
    <div className="card" style={{ maxWidth: "100%" }}>
      <div
        className="card__header"
        style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <div>
          <h1 className="card__title" style={{ marginBottom: 6 }}>Court Bookings</h1>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/dashboard" className="btn" style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}>
            ← Back to Dashboard
          </a>
          <a className="btn btn--primary" href={exportHref} aria-label="Export bookings to Excel">
            Export to Excel
          </a>
        </div>
      </div>

      <div className="card__body">
        {/* Toolbar: search + date filter */}
        <form className="toolbar" method="get">
          <input
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or email…"
            aria-label="Search bookings by name or email"
            style={{ flex: 2, minWidth: 160 }}
          />
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="input"
            aria-label="Filter by date"
            style={{ flex: 1, minWidth: 160 }}
          />
          <button className="btn btn--primary" type="submit">Apply</button>
          <a href="/bookings" className="btn" style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}>
            Reset
          </a>
        </form>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>User Name</th>
                <th style={{ minWidth: 260 }}>User Email</th>
                <th style={{ minWidth: 120 }}>Date</th>
                <th style={{ minWidth: 140 }}>Payment</th>
                <th style={{ minWidth: 120 }}>Amount (total)</th>
                <th style={{ minWidth: 90 }}>Court ID</th>
                <th style={{ minWidth: 110 }}>Start</th>
                <th style={{ minWidth: 110 }}>End</th>
                <th style={{ minWidth: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.bookingId}-${idx}`}>
                  <td>{r.userName}</td>
                  <td>{r.userEmail}</td>
                  <td>{r.date}</td>
                  <td>{paymentBadge(r.adminPaid, r.paymentRef)}</td>
                  <td>{amountDisplay(r.amount, r.currency)}</td>
                  <td>{r.courtId == null ? "—" : r.courtId}</td>
                  <td>{r.start}</td>
                  <td>{r.end}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {r.slotIndex >= 0 && (
                        <CancelButton
                          bookingId={r.bookingId}
                          slotIndex={r.slotIndex}
                          courtId={r.courtId ?? undefined}
                          start={r.start}
                          end={r.end}
                        />
                      )}
                      {!r.adminPaid && (
                        <MarkPaidButton bookingId={r.bookingId} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "18px" }}>
                    No bookings found{q ? ` for “${q}”` : ""}{date ? ` on ${date}` : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
