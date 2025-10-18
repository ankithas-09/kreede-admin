// app/event-registrations/page.tsx
import { EventModel } from "@/models/Event";
import { RegistrationModel } from "@/models/Registrations";
import AddRegistrationButton from "./AddRegistrationButton";
import MarkPaidButton from "./MarkPaidButton";
import CancelRegistrationButton from "./CancelEventRegButton";
import RefundButton from "./RefundButton";
import ClearEventButton from "./ClearEventButton";

export const dynamic = "force-dynamic";

function fmtDate(v?: string | Date) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Build a JS Date from event's date+time strings (server tz)
function buildDate(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  // timeStr like "HH:MM" (24h). If missing, default to end of day.
  const t = (timeStr || "23:59").split(":");
  const [hh, mm] = [Number(t[0] || 0), Number(t[1] || 0)];
  const [y, m, d] = dateStr.split("-").map(Number); // expecting YYYY-MM-DD
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isEventOver(ev: {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}) {
  // Consider event over if "now" is past its end (endDate+endTime) or,
  // if no end specified, past start (startDate+startTime).
  const endDT =
    buildDate(ev.endDate, ev.endTime) ||
    buildDate(ev.startDate, ev.endTime) ||
    buildDate(ev.endDate, ev.startTime);
  const startDT = buildDate(ev.startDate, ev.startTime);

  const now = new Date();
  if (endDT) return now > endDT;
  if (startDT) return now > startDT;
  return false;
}

type EventLean = {
  _id: string | { toString?: () => string };
  title?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  entryFee?: number;
  link?: string;
  createdAt?: string | Date;
};

type RegistrationLean = {
  _id: string | { toString?: () => string };
  eventId: string;

  // account-based
  userName?: string;
  userEmail?: string;

  // guest-based
  guestName?: string;
  guestPhone?: string;

  amount?: number;
  adminPaid?: boolean;
  status?: "PAID" | "REFUNDED";
  createdAt?: string | Date;
};

const toIdString = (v: string | { toString?: () => string }) =>
  typeof v === "string" ? v : v?.toString?.() || "";

export default async function EventRegistrationsPage() {
  const Event = await EventModel();
  const Registration = await RegistrationModel();

  // newest events first
  const events = (await Event.find({})
    .select({
      title: 1,
      startDate: 1,
      endDate: 1,
      startTime: 1,
      endTime: 1,
      entryFee: 1,
      link: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean()) as EventLean[];

  // Filter OUT events that are already over (UI only; DB untouched)
  const upcomingOrOngoing = events.filter((ev) => !isEventOver(ev));

  // Preload registrations per event (include guest fields + status)
  const eventIds = upcomingOrOngoing.map((e) => toIdString(e._id));
  const registrations = (await Registration.find({ eventId: { $in: eventIds } })
    .select({
      eventId: 1,
      userName: 1,
      userEmail: 1,
      guestName: 1,
      guestPhone: 1,
      amount: 1,
      adminPaid: 1,
      status: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean()) as RegistrationLean[];

  const byEvent = new Map<string, RegistrationLean[]>();
  for (const r of registrations) {
    const k = r.eventId;
    if (!byEvent.has(k)) byEvent.set(k, []);
    byEvent.get(k)!.push(r);
  }

  const paymentBadge = (status?: "PAID" | "REFUNDED", paid?: boolean) => {
    if (status === "REFUNDED") {
      return (
        <span
          className="badge"
          style={{ background: "#f0f9ff", borderColor: "rgba(2,132,199,0.35)", color: "#0369a1" }}
        >
          REFUNDED
        </span>
      );
    }
    return paid ? (
      <span className="badge">PAID</span>
    ) : (
      <span
        className="badge"
        style={{ background: "#fff0f0", borderColor: "rgba(176,0,32,0.35)", color: "#b00020" }}
      >
        UNPAID
      </span>
    );
  };

  return (
    <div className="dash-wrap" style={{ paddingTop: 12, paddingBottom: 24 }}>
      <div className="dash-topbar">
        <div className="dash-title">Event Registrations</div>
        <div className="dash-actions">
          <a
            href="/dashboard"
            className="btn"
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {upcomingOrOngoing.map((ev) => {
          const fee = Number(ev.entryFee ?? 0);
          const items = byEvent.get(toIdString(ev._id)) || [];
          const dateStr =
            ev.startDate || ev.endDate
              ? `${fmtDate(ev.startDate)}${ev.endDate ? ` → ${fmtDate(ev.endDate)}` : ""}`
              : "—";
          const timeStr =
            ev.startTime || ev.endTime
              ? `${ev.startTime || "—"}${ev.endTime ? ` → ${ev.endTime}` : ""}`
              : "—";

          return (
            <div key={toIdString(ev._id)} className="card" style={{ maxWidth: "100%" }}>
              <div
                className="card__header"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 className="card__title" style={{ marginBottom: 6 }}>
                    {ev.title || "Untitled Event"}
                  </h2>
                </div>

                <div>
                  <p className="card__subtitle" style={{ marginBottom: 6 }}>
                    Dates: {dateStr} &nbsp;·&nbsp; Time: {timeStr}
                  </p>
                  <p className="card__subtitle">Entry Fee: {fee > 0 ? `₹${fee}` : "Free"}</p>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <AddRegistrationButton
                    eventId={toIdString(ev._id)}
                    eventTitle={ev.title || ""}
                    entryFee={fee}
                  />
                  <ClearEventButton eventId={toIdString(ev._id)} />
                </div>
              </div>

              <div className="card__body">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 200 }}>User Name</th>
                        <th style={{ minWidth: 260 }}>Email / Phone</th>
                        <th style={{ minWidth: 120 }}>Amount</th>
                        <th style={{ minWidth: 120 }}>Payment</th>
                        <th style={{ minWidth: 260 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => {
                        const displayName = r.guestName || r.userName || "—";
                        const displayContact = r.guestPhone || r.userEmail || "—";
                        const isRefunded = r.status === "REFUNDED";
                        const showMarkPaid = !isRefunded && !r.adminPaid;
                        const showRefund = !isRefunded && fee > 0;

                        return (
                          <tr key={toIdString(r._id)}>
                            <td>{displayName}</td>
                            <td>{displayContact}</td>
                            <td>{typeof r.amount === "number" ? `₹${r.amount}` : "—"}</td>
                            <td>{paymentBadge(r.status, r.adminPaid)}</td>
                            <td>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {showMarkPaid && (
                                  <MarkPaidButton kind="registration" id={toIdString(r._id)} />
                                )}
                                {showRefund && <RefundButton id={toIdString(r._id)} />}
                                <CancelRegistrationButton id={toIdString(r._id)} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {items.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: 16 }}>
                            No registrations yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}

        {upcomingOrOngoing.length === 0 && (
          <div className="card">
            <div className="card__body">No upcoming events.</div>
          </div>
        )}
      </div>
    </div>
  );
}
