// app/registrations/page.tsx
import { RegistrationModel } from "@/models/Registrations";
import RefundButton from "./RefundButton";

type SearchParams = { q?: string };

type IdLike = string | { toString?: () => string };
const toIdString = (v: IdLike) => (typeof v === "string" ? v : v?.toString?.() || "");

type RegistrationLean = {
  _id: IdLike;
  eventTitle?: string;
  userName?: string;
  userEmail?: string;
  createdAt?: Date | string;
};

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const Registration = await RegistrationModel();

  const q = (searchParams.q || "").trim();

  const query: Record<string, unknown> = {};
  if (q) {
    query.$or = [
      { userName: { $regex: q, $options: "i" } },
      { userEmail: { $regex: q, $options: "i" } },
      { eventTitle: { $regex: q, $options: "i" } },
    ];
  }

  const regs = (await Registration.find(query)
    .select({ eventTitle: 1, userName: 1, userEmail: 1, createdAt: 1 })
    .sort({ eventTitle: 1, createdAt: -1 })
    .lean()) as RegistrationLean[];

  // Group by eventTitle (and keep registration id per row)
  const groups = new Map<string, { _id: string; userName: string; userEmail: string }[]>();
  for (const r of regs) {
    const key = r.eventTitle || "(Untitled Event)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      _id: toIdString(r._id),
      userName: r.userName || "—",
      userEmail: r.userEmail || "—",
    });
  }

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
            Event Registrations
          </h1>
        </div>
        <a
          href="/dashboard"
          className="btn"
          style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
        >
          ← Back to Dashboard
        </a>
      </div>

      <div className="card__body">
        <form className="toolbar" method="get" style={{ marginBottom: 8 }}>
          <input
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name / email / event…"
            aria-label="Search registrations"
            style={{ flex: 2, minWidth: 200 }}
          />
          <button className="btn btn--primary" type="submit">
            Apply
          </button>
          <a
            href="/registrations"
            className="btn"
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            Reset
          </a>
        </form>

        {groups.size === 0 && (
          <div className="table-wrap" style={{ padding: 18, textAlign: "center" }}>
            No registrations found{q ? ` for “${q}”` : ""}.
          </div>
        )}

        {[...groups.entries()].map(([eventTitle, rows]) => (
          <div key={eventTitle} style={{ marginBottom: 20 }}>
            <div
              className="card__subheader"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <h2 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{eventTitle}</h2>
              <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                {rows.length} registration{rows.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>User Name</th>
                    <th style={{ minWidth: 260 }}>User Email</th>
                    <th style={{ minWidth: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${eventTitle}-${r._id}`}>
                      <td>{r.userName}</td>
                      <td>{r.userEmail}</td>
                      <td>
                        <RefundButton registrationId={r._id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
