// app/bookings/page.tsx
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";
import CancelButton from "./CancelButton";
import MarkPaidButton from "./MarkPaidButton";
import AddBookingButton from "./AddBookingButton";

type SearchParams = {
  q?: string;   // search by name/email (for guest, only name)
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
  paymentRef?: string;   // e.g., "CASH" | "MEMBERSHIP" | "ONLINE"
  adminPaid?: boolean;   // for admin-created
  createdAt?: Date | string;
};

type GuestBookingLean = {
  _id: string | { toString?: () => string };
  userName?: string;     // guest name
  date?: string;
  slots?: Array<{ courtId?: number; start?: string; end?: string }>;
  amount?: number;
  currency?: string;
  paymentRef?: string;   // "UNPAID.CASH" | "PAID.CASH"
  adminPaid?: boolean;   // for display guard
  createdAt?: Date | string;
};

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const Booking = await BookingModel();
  const GuestBooking = await GuestBookingModel();

  const q = (searchParams.q || "").trim();
  const date = (searchParams.date || "").trim();

  // Build query for normal bookings
  const query: MongoQuery = {};
  if (q) {
    query.$or = [
      { userName: { $regex: q, $options: "i" } },
      { userEmail: { $regex: q, $options: "i" } },
    ];
  }
  if (date) query.date = date;

  // Fetch standard bookings
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

  // Fetch guest bookings (search only by name + date)
  const guestQuery: { $or?: Array<{ userName: { $regex: string; $options: string } }>; date?: string } = {};
  if (q) {
    guestQuery.$or = [{ userName: { $regex: q, $options: "i" } }];
  }
  if (date) guestQuery.date = date;

  const guestBookings = (await GuestBooking.find(guestQuery)
    .select({
      userName: 1,
      date: 1,
      slots: 1,
      amount: 1,
      currency: 1,
      paymentRef: 1,
      adminPaid: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean()) as GuestBookingLean[];

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
    createdAt: number; // for merged sorting desc
  };

  const toIdString = (v: string | { toString?: () => string }) =>
    typeof v === "string" ? v : v?.toString?.() || "";

  const rows: Row[] = [];

  // Normal bookings → rows
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
      createdAt: new Date(b.createdAt ?? Date.now()).getTime(),
    };
    if (Array.isArray(b.slots) && b.slots.length) {
      b.slots.forEach((s, idx) => {
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

  // Guest bookings → rows (no email)
  for (const g of guestBookings) {
    const isPaid = String(g.paymentRef || "").toUpperCase().startsWith("PAID.");
    const base = {
      bookingId: toIdString(g._id),
      userName: g.userName || "—",
      userEmail: "—",
      date: g.date || "—",
      amount: typeof g.amount === "number" ? g.amount : null,
      currency: g.currency || undefined,
      paymentRef: g.paymentRef || undefined, // "UNPAID.CASH" | "PAID.CASH"
      adminPaid: isPaid,                      // for button visibility
      createdAt: new Date(g.createdAt ?? Date.now()).getTime(),
    };
    if (Array.isArray(g.slots) && g.slots.length) {
      g.slots.forEach((s, idx) => {
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

  // Sort merged rows newest first (by createdAt desc)
  rows.sort((a, b) => b.createdAt - a.createdAt);

  // Export URL with current filters (still only standard bookings are exported)
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (date) params.set("date", date);
  const exportHref = `/api/bookings/export${params.toString() ? `?${params.toString()}` : ""}`;

  const amountDisplay = (a: number | null, cur?: string) =>
    a == null ? "—" : `${cur ? cur + " " : ""}${a}`;

  // Robust payment badge:
  // - If ref already like "UNPAID.CASH"/"PAID.CASH", show as-is and color by prefix
  // - If ref is "MEMBERSHIP", always PAID.MEMBERSHIP
  // - Else show UNPAID.<REF> or PAID.<REF> based on adminPaid
  const paymentBadge = (paid?: boolean, ref?: string) => {
    const refUpper = (ref || "").toUpperCase().trim();
    const hasPrefix = refUpper.startsWith("UNPAID.") || refUpper.startsWith("PAID.");
    let text: string;
    let isPaid: boolean;

    if (hasPrefix) {
      text = refUpper;
      isPaid = refUpper.startsWith("PAID.");
    } else if (refUpper === "MEMBERSHIP") {
      text = "PAID.MEMBERSHIP";
      isPaid = true;
    } else if (refUpper) {
      isPaid = paid === true;
      text = `${isPaid ? "PAID" : "UNPAID"}.${refUpper}`;
    } else {
      isPaid = paid === true;
      text = isPaid ? "PAID" : "UNPAID";
    }

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
          <AddBookingButton />
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
