// app/refunds/page.tsx
import { RefundModel } from "@/models/Refund";
import { EventRefundModel } from "@/models/EventRefund";
import ClearButton from "./ClearButton";

export const dynamic = "force-dynamic"; // ensure fresh read on each request

function toINR(n: number | undefined) {
  if (typeof n !== "number") return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

type IdLike = string | { toString?: () => string };
const toIdString = (v: IdLike) => (typeof v === "string" ? v : v?.toString?.() || "");

type CourtRefundLean = {
  _id: IdLike;
  userName?: string;
  userEmail?: string;
  amount?: number;
  refundId?: string;
  status?: string;
  createdAt?: string | Date;
};

type EventRefundLean = {
  _id: IdLike;
  eventTitle?: string;
  userName?: string;
  userEmail?: string;
  amount?: number;
  refundId?: string;
  status?: string;
  createdAt?: string | Date;
};

export default async function RefundsPage() {
  const Refund = await RefundModel();
  const EventRefund = await EventRefundModel();

  // Court refunds (booking refunds)
  const court = (await Refund.find({})
    .select({
      userName: 1,
      userEmail: 1,
      amount: 1,
      refundId: 1,
      status: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean()) as CourtRefundLean[];

  // Event refunds
  const events = (await EventRefund.find({})
    .select({
      userName: 1,
      userEmail: 1,
      eventTitle: 1,
      amount: 1,
      refundId: 1,
      status: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean()) as EventRefundLean[];

  return (
    <div className="dash-wrap" style={{ paddingBottom: 24 }}>
      <header className="dash-topbar">
        <div className="dash-title">Refunds</div>
        <div className="dash-actions" style={{ display: "flex", gap: 8 }}>
          {/* Optional global clear for both tables at once */}
          <ClearButton kind="all" label="Clear All Refunds" title="Clear court + event refunds" />
          <a
            href="/dashboard"
            className="btn"
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            ← Back to Dashboard
          </a>
        </div>
      </header>

      {/* Court Refunds */}
      <section className="card" style={{ maxWidth: "100%", marginBottom: 16 }}>
        <div className="card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="card__title" style={{ marginBottom: 8 }}>
            Court Refunds
          </h2>
          <ClearButton kind="court" label="Clear Court Refunds" title="Delete all court refunds" />
        </div>
        <div className="card__body">
          <div className="table-wrap" style={{ maxHeight: 420, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>User Name</th>
                  <th style={{ minWidth: 260 }}>User Email</th>
                  <th style={{ minWidth: 120 }}>Amount</th>
                  <th style={{ minWidth: 200 }}>Refund ID</th>
                  <th style={{ minWidth: 120 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {court.map((r) => (
                  <tr key={toIdString(r._id)}>
                    <td>{r.userName || "—"}</td>
                    <td>{r.userEmail || "—"}</td>
                    <td>{toINR(r.amount)}</td>
                    <td>{r.refundId || "—"}</td>
                    <td>{r.status || "—"}</td>
                  </tr>
                ))}
                {court.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 16 }}>
                      No court refunds yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Event Refunds */}
      <section className="card" style={{ maxWidth: "100%" }}>
        <div className="card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="card__title" style={{ marginBottom: 8 }}>
            Event Refunds
          </h2>
          <ClearButton kind="event" label="Clear Event Refunds" title="Delete all event refunds" />
        </div>
        <div className="card__body">
          <div className="table-wrap" style={{ maxHeight: 420, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Event Title</th>
                  <th style={{ minWidth: 180 }}>User Name</th>
                  <th style={{ minWidth: 260 }}>User Email</th>
                  <th style={{ minWidth: 120 }}>Amount</th>
                  <th style={{ minWidth: 200 }}>Refund ID</th>
                  <th style={{ minWidth: 120 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={toIdString(e._id)}>
                    <td>{e.eventTitle || "—"}</td>
                    <td>{e.userName || "—"}</td>
                    <td>{e.userEmail || "—"}</td>
                    <td>{toINR(e.amount)}</td>
                    <td>{e.refundId || "—"}</td>
                    <td>{e.status || "—"}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 16 }}>
                      No event refunds yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
