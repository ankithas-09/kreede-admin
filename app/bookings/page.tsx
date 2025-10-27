// app/bookings/page.tsx
import { BookingModel } from "@/models/Booking";
import { GuestBookingModel } from "@/models/GuestBooking";
import { UserModel } from "@/models/User";
import CancelButton from "./CancelButton";
import MarkPaidButton from "./MarkPaidButton";
import AddBookingButton from "./AddBookingButton";
import ClearAllBookingsButton from "./ClearAllBookingsButton";

type SearchParams = {
  q?: string;
  date?: string;
  courtId?: string;
};

type BookingLean = {
  _id: string | { toString?: () => string };
  userId?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  date?: string;
  slots?: Array<{ courtId?: number; start?: string; end?: string }>;
  amount?: number;
  currency?: string;
  paymentRef?: string;
  adminPaid?: boolean;
  createdAt?: Date | string;
};

type GuestBookingLean = {
  _id: string | { toString?: () => string };
  userName?: string;
  phone_number?: string;
  guestPhone?: string;
  date?: string;
  slots?: Array<{ courtId?: number; start?: string; end?: string }>;
  amount?: number;
  currency?: string;
  paymentRef?: string;
  adminPaid?: boolean;
  createdAt?: Date | string;
};

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const Booking = await BookingModel();
  const GuestBooking = await GuestBookingModel();
  const User = await UserModel();

  const q = (searchParams.q || "").trim();
  const dateFilter = (searchParams.date || "").trim();
  const courtIdFilterRaw = (searchParams.courtId || "").trim();
  const courtIdFilter = courtIdFilterRaw && !Number.isNaN(Number(courtIdFilterRaw))
    ? Number(courtIdFilterRaw)
    : null;

  // Helper: check ObjectId
  const isValidObjectIdString = (s: unknown) =>
    typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);

  /** ---------------------------------------
   * Build main bookings query
   * ------------------------------------- */
  const query: any = {};
  const orParts: any[] = [];

  if (q) {
    orParts.push({ userName: { $regex: q, $options: "i" } });
    orParts.push({ userPhone: { $regex: q, $options: "i" } });

    const looksLikePhone = /\d{4,}/.test(q.replace(/\s+/g, ""));
    if (looksLikePhone) {
      const matchedUsers = await User.find({ phone: { $regex: q, $options: "i" } })
        .select({ _id: 1, userId: 1 })
        .lean<{ _id: unknown; userId?: string }[]>();

      if (matchedUsers.length) {
        const idStrings = matchedUsers.map((u) => String(u._id));
        const usernames = matchedUsers.map((u) => String(u.userId || "")).filter(Boolean);
        if (idStrings.length) orParts.push({ userId: { $in: idStrings } });
        if (usernames.length) orParts.push({ userId: { $in: usernames } });
      }
    }
  }

  if (orParts.length) query.$or = orParts;
  if (dateFilter) query.date = dateFilter;

  const bookings = (await Booking.find(query)
    .select({
      userId: 1,
      userName: 1,
      userEmail: 1,
      userPhone: 1,
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

  /** ---------------------------------------
   * Resolve user phone numbers
   * ------------------------------------- */
  const userIds = Array.from(new Set(bookings.map((b) => String(b.userId || "")).filter(Boolean)));
  const idLike = userIds.filter(isValidObjectIdString);
  const usernameLike = userIds.filter((v) => !isValidObjectIdString(v));

  const usersForPhones = await User.find({
    $or: [
      ...(idLike.length ? [{ _id: { $in: idLike } }] : []),
      ...(usernameLike.length ? [{ userId: { $in: usernameLike } }] : []),
    ],
  })
    .select({ _id: 1, userId: 1, phone: 1 })
    .lean();

  const phoneByKey = new Map<string, string>();
  for (const u of usersForPhones) {
    const _idStr = String(u._id);
    const uname = String(u.userId || "");
    const phone = u.phone || "";
    phoneByKey.set(_idStr, phone);
    if (uname) phoneByKey.set(uname, phone);
  }

  /** ---------------------------------------
   * Guest bookings
   * ------------------------------------- */
  const guestQuery: any = {};
  if (q) {
    guestQuery.$or = [
      { userName: { $regex: q, $options: "i" } },
      { phone_number: { $regex: q, $options: "i" } },
      { guestPhone: { $regex: q, $options: "i" } },
    ];
  }
  if (dateFilter) guestQuery.date = dateFilter;

  const guestBookings = (await GuestBooking.find(guestQuery)
    .select({
      userName: 1,
      phone_number: 1,
      guestPhone: 1,
      date: 1,
      slots: 1,
      amount: 1,
      currency: 1,
      paymentRef: 1,
      adminPaid: 1,
      createdAt: 1,
    })
    .lean()) as GuestBookingLean[];

  /** ---------------------------------------
   * Merge and transform to rows
   * ------------------------------------- */
  type Row = {
    bookingId: string;
    userName: string;
    userPhone: string;
    date: string;
    amount: number | null;
    currency?: string;
    paymentRef?: string;
    adminPaid?: boolean;
    courtId: number | null;
    start: string;
    end: string;
    slotIndex: number;
    createdAt: number;
  };

  const rows: Row[] = [];

  const toIdString = (v: string | { toString?: () => string }) =>
    typeof v === "string" ? v : v?.toString?.() || "";

  // helper: compute per-slot amount (rounded to nearest rupee)
  function perSlotAmount(total?: number, count?: number): number | null {
    if (typeof total !== "number") return null;
    if (!count || count <= 0) return total;
    return Math.round(total / count);
  }

  for (const b of bookings) {
    const phone =
      (b.userId && phoneByKey.get(String(b.userId))) ||
      b.userPhone ||
      "—";

    const base = {
      bookingId: toIdString(b._id),
      userName: b.userName || "—",
      userPhone: phone,
      date: b.date || "—",
      currency: b.currency,
      paymentRef: b.paymentRef,
      adminPaid: b.adminPaid === true,
      createdAt: new Date(b.createdAt ?? Date.now()).getTime(),
    };

    const slots = b.slots || [];
    const perSlot = perSlotAmount(b.amount, slots.length);

    if (slots.length) {
      slots.forEach((s, idx) =>
        rows.push({
          ...base,
          amount: perSlot,
          courtId: s.courtId ?? null,
          start: s.start || "—",
          end: s.end || "—",
          slotIndex: idx,
        })
      );
    } else {
      rows.push({
        ...base,
        amount: b.amount ?? null,
        courtId: null,
        start: "—",
        end: "—",
        slotIndex: -1,
      });
    }
  }

  for (const g of guestBookings) {
    const phone = g.phone_number || g.guestPhone || "—";
    const isPaid = String(g.paymentRef || "").toUpperCase().startsWith("PAID.");

    const base = {
      bookingId: toIdString(g._id),
      userName: g.userName || "—",
      userPhone: phone,
      date: g.date || "—",
      currency: g.currency,
      paymentRef: g.paymentRef,
      adminPaid: isPaid,
      createdAt: new Date(g.createdAt ?? Date.now()).getTime(),
    };

    const slots = g.slots || [];
    const perSlot = perSlotAmount(g.amount, slots.length);

    if (slots.length) {
      slots.forEach((s, idx) =>
        rows.push({
          ...base,
          amount: perSlot,
          courtId: s.courtId ?? null,
          start: s.start || "—",
          end: s.end || "—",
          slotIndex: idx,
        })
      );
    } else {
      rows.push({
        ...base,
        amount: g.amount ?? null,
        courtId: null,
        start: "—",
        end: "—",
        slotIndex: -1,
      });
    }
  }

  /** ---------------------------------------
   * Sorting: date asc → start asc
   * ------------------------------------- */
  const toMinutes = (hhmm: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return Number.POSITIVE_INFINITY;
    return Number(m[1]) * 60 + Number(m[2]);
  };

  const parseDateValue = (d: string) => {
    const date = new Date(d);
    if (!isNaN(date.getTime())) return date.getTime();
    return Number.MAX_SAFE_INTEGER;
  };

  const availableCourtIds = Array.from(
    new Set(rows.map((r) => r.courtId).filter((v): v is number => v !== null))
  ).sort((a, b) => a - b);

  const filteredRows = courtIdFilter == null
    ? rows
    : rows.filter((r) => r.courtId === courtIdFilter);

  filteredRows.sort((a, b) => {
    const da = parseDateValue(a.date);
    const db = parseDateValue(b.date);
    if (da !== db) return da - db;

    const ta = toMinutes(a.start);
    const tb = toMinutes(b.start);
    if (ta !== tb) return ta - tb;

    return b.createdAt - a.createdAt;
  });

  /** ---------------------------------------
   * UI Rendering
   * ------------------------------------- */
  const amountDisplay = (a: number | null, cur?: string) =>
    a == null ? "—" : `${cur ? cur + " " : ""}${a}`;

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

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (dateFilter) params.set("date", dateFilter);
  if (courtIdFilter != null) params.set("courtId", String(courtIdFilter));
  const exportHref = `/api/bookings/export${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <div className="card" style={{ maxWidth: "100%" }}>
      <div
        className="card__header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="card__title" style={{ marginBottom: 6 }}>
            Court Bookings
          </h1>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <AddBookingButton />
          <a
            href="/dashboard"
            className="btn"
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            ← Back to Dashboard
          </a>
          <a className="btn btn--primary" href={exportHref}>
            Export to Excel
          </a>
          <ClearAllBookingsButton q={q} date={dateFilter} />
        </div>
      </div>

      <div className="card__body">
        <form className="toolbar" method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name or phone…"
            style={{ flex: 2, minWidth: 160 }}
          />
          <input
            type="date"
            name="date"
            defaultValue={dateFilter}
            className="input"
            style={{ flex: 1, minWidth: 140 }}
          />
          <select
            name="courtId"
            defaultValue={courtIdFilterRaw || ""}
            className="input"
            style={{ flex: 1, minWidth: 140 }}
          >
            <option value="">All Courts</option>
            {availableCourtIds.map((cid) => (
              <option key={cid} value={cid}>
                Court {cid}
              </option>
            ))}
          </select>
          <button className="btn btn--primary" type="submit">
            Apply
          </button>
          <a
            href="/bookings"
            className="btn"
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            Reset
          </a>
        </form>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>User Name</th>
                <th>Phone</th>
                <th>Date</th>
                <th>Payment</th>
                <th>Amount</th>
                <th>Court ID</th>
                <th>Start</th>
                <th>End</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => {
                const refUpper = String(r.paymentRef || "").toUpperCase();
                const isPaidLike =
                  r.adminPaid === true || refUpper === "MEMBERSHIP" || refUpper.startsWith("PAID.");

                return (
                  <tr key={`${r.bookingId}-${idx}`}>
                    <td>{r.userName}</td>
                    <td>{r.userPhone}</td>
                    <td>{r.date}</td>
                    <td>{paymentBadge(r.adminPaid, r.paymentRef)}</td>
                    <td>{amountDisplay(r.amount, r.currency)}</td>
                    <td>{r.courtId ?? "—"}</td>
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
                        {!isPaidLike && <MarkPaidButton bookingId={r.bookingId} />}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "18px" }}>
                    No bookings found
                    {q ? ` for “${q}”` : ""}
                    {dateFilter ? ` on ${dateFilter}` : ""}
                    {courtIdFilter != null ? ` for Court ${courtIdFilter}` : ""}.
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
