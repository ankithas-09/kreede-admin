// app/memberships/page.tsx
import AddMembershipGlobalButton from "./AddMembershipGlobalButton";
import RestoreMembershipButton from "./RestoreMembershipButton"; // ⬅️ NEW
import { UserModel } from "@/models/User";
import { MembershipModel } from "@/models/Membership";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

function fmtDate(v?: Date | string) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

type UserLean = {
  _id: string | { toString?: () => string };
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  createdAt?: Date | string;
};

type MembershipLean = {
  userId?: string;
  userEmail?: string;
  userName?: string;
  planId?: string;
  planName?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  createdAt: Date | string;
  durationMonths?: number | string;
  games?: number;
  gamesUsed?: number;
};

const toIdString = (v: string | { toString?: () => string }) =>
  typeof v === "string" ? v : v?.toString?.() || "";

export default async function MembershipsPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q || "").trim();

  const User = await UserModel();
  const Membership = await MembershipModel();

  // 1) Find users (search by name/email/phone/userId)
  const userQuery: Record<string, unknown> = {};
  if (q) {
    userQuery.$or = [
      { name:   { $regex: q, $options: "i" } },
      { email:  { $regex: q, $options: "i" } },
      { phone:  { $regex: q, $options: "i" } },
      { userId: { $regex: q, $options: "i" } },
    ];
  }

  const users = (await User.find(userQuery)
    .select({ userId: 1, name: 1, email: 1, phone: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean()) as UserLean[];

  // 2) Fetch latest membership for these users (by userId/email/name)
  const ids = users.map((u) => toIdString(u._id));
  const emails = users.map((u) => (u.email || "").toLowerCase()).filter(Boolean) as string[];
  const names = users.map((u) => (u.name || "").trim()).filter(Boolean) as string[];

  const allMemberships = (await Membership.find({
    $or: [
      { userId:   { $in: ids } },
      { userEmail:{ $in: emails } },
      { userName: { $in: names } },
    ],
  })
    .select({
      userId: 1, userEmail: 1, userName: 1,
      planId: 1, planName: 1, amount: 1, currency: 1,
      status: 1, createdAt: 1, durationMonths: 1, games: 1, gamesUsed: 1,
    })
    .sort({ createdAt: -1 })
    .lean()) as MembershipLean[];

  const byId = new Map<string, MembershipLean>();
  const byEmail = new Map<string, MembershipLean>();
  const byName = new Map<string, MembershipLean>();
  for (const m of allMemberships) {
    if (m.userId && !byId.has(m.userId)) byId.set(m.userId, m);
    const em = (m.userEmail || "").toLowerCase();
    if (em && !byEmail.has(em)) byEmail.set(em, m);
    const nm = (m.userName || "").trim();
    if (nm && !byName.has(nm)) byName.set(nm, m);
  }

  const now = new Date();
  function latestFor(
    u: UserLean
  ): (MembershipLean & { start: Date; end: Date; isActive: boolean }) | null {
    const m =
      byId.get(toIdString(u._id)) ||
      byEmail.get((u.email || "").toLowerCase()) ||
      byName.get((u.name || "").trim()) ||
      null;

    if (!m) return null;
    const start = new Date(m.createdAt);
    const end = addMonths(start, Number(m.durationMonths || 0));
    const isActive = m.status === "PAID" && now < end;
    return { ...m, start, end, isActive };
  }

  // Only show users who have PURCHASED a membership (latest status === "PAID")
  const usersWithPaidMembership = users.filter((u) => {
    const m = latestFor(u);
    return !!m && m.status === "PAID";
  });

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const exportHref = `/api/memberships/export${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <div className="card" style={{ maxWidth: "100%" }}>
      <div
        className="card__header"
        style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <div>
          <h1 className="card__title" style={{ marginBottom: 6 }}>
            Memberships
          </h1>
          <p className="card__subtitle">Search a user, add a membership, or mark payment received.</p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <AddMembershipGlobalButton />
          <a
            href="/dashboard"
            className="btn"
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            ← Back to Dashboard
          </a>
          <a className="btn btn--primary" href={exportHref} aria-label="Export memberships to Excel">
            Export to Excel
          </a>
        </div>
      </div>

      <div className="card__body">
        {/* Toolbar: search */}
        <form className="toolbar" method="get">
          <input
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name, email, phone or username…"
            aria-label="Search users"
            style={{ flex: 2, minWidth: 220 }}
          />
          <button className="btn btn--primary" type="submit">
            Search
          </button>
          <a
            href="/memberships"
            className="btn"
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            Reset
          </a>
        </form>

        {/* Results table */}
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Username</th>
                <th style={{ minWidth: 180 }}>Name</th>
                <th style={{ minWidth: 240 }}>Email</th>
                <th style={{ minWidth: 90 }}>Plan</th>
                <th style={{ minWidth: 110 }}>Games</th>
                <th style={{ minWidth: 120 }}>Amount</th>
                <th style={{ minWidth: 130 }}>Start</th>
                <th style={{ minWidth: 130 }}>End</th>
                <th style={{ minWidth: 180 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {usersWithPaidMembership.map((u) => {
                const m = latestFor(u)!; // guaranteed non-null
                const plan = m ? (m.planName || m.planId || "—") : "—";
                const amount =
                  typeof m.amount === "number"
                    ? `${m.currency || ""} ${m.amount}`.trim()
                    : typeof m.amount === "string"
                    ? `${m.currency || ""} ${m.amount}`.trim()
                    : "—";
                const start = m ? fmtDate(m.start) : "—";
                const end = m ? fmtDate(m.end) : "—";
                const isExpired = m.status === "PAID" && new Date() >= m.end;
                const statusText = m ? (m.isActive ? "ACTIVE" : "EXPIRED") : "—";

                return (
                  <tr key={toIdString(u._id)}>
                    <td>{u.userId || "—"}</td>
                    <td>{u.name || "—"}</td>
                    <td>{u.email || "—"}</td>
                    <td>{plan}</td>
                    <td>
                      {typeof m.games === "number" && typeof m.gamesUsed === "number"
                        ? `${m.gamesUsed}/${m.games}`
                        : "—"}
                    </td>
                    <td>{amount}</td>
                    <td>{start}</td>
                    <td>{end}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span
                          className="badge"
                          style={
                            m.isActive
                              ? undefined
                              : { background: "#fff0f0", borderColor: "rgba(176,0,32,0.35)", color: "#b00020" }
                          }
                        >
                          {statusText}
                        </span>

                        {/* Restore button: enabled only after end date */}
                        <RestoreMembershipButton
                          enabled={isExpired}
                          user={{
                            _id: toIdString(u._id),
                            userId: u.userId,
                            name: u.name,
                            email: u.email,
                            phone: u.phone,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}

              {usersWithPaidMembership.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "18px" }}>
                    No members with purchased memberships{q ? ` for “${q}”` : ""}.
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
