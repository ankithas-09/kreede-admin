// app/memberships/page.tsx
import AddMembershipGlobalButton from "./AddMembershipGlobalButton";
import { UserModel } from "@/models/User";
import { MembershipModel } from "@/models/Membership";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string; // search by name/email/phone/username
};

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
  const emails = users
    .map((u) => (u.email || "").toLowerCase())
  .filter((e): e is string => Boolean(e));
  const names = users
    .map((u) => (u.name || "").trim())
    .filter((n): n is string => Boolean(n));

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
    .sort({ createdAt: -1 }) // newest first so the first we see becomes "latest"
    .lean()) as MembershipLean[];

  // Index latest per user (by userId/email/name)
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

  // Export URL
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
          {/* Global add: search user in a modal, pick plan, and create as PAID */}
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
                <th style={{ minWidth: 120 }}>Amount</th>
                <th style={{ minWidth: 130 }}>Start</th>
                <th style={{ minWidth: 130 }}>End</th>
                <th style={{ minWidth: 130 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const m = latestFor(u);
                const plan = m ? (m.planName || m.planId || "—") : "—";
                const amount =
                  m && typeof m.amount === "number"
                    ? `${m.currency || ""} ${m.amount}`.trim()
                    : typeof m?.amount === "string"
                    ? `${m.currency || ""} ${m.amount}`.trim()
                    : "—";
                const start = m ? fmtDate(m.start) : "—";
                const end = m ? fmtDate(m.end) : "—";
                const status = m ? (m.isActive ? "ACTIVE" : (m.status || "—")) : "NO MEMBERSHIP";

                return (
                  <tr key={toIdString(u._id)}>
                    <td>{u.userId || "—"}</td>
                    <td>{u.name || "—"}</td>
                    <td>{u.email || "—"}</td>
                    <td>{plan}</td>
                    <td>{amount}</td>
                    <td>{start}</td>
                    <td>{end}</td>
                    <td>{status}</td>
                  </tr>
                );
              })}

              {users.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "18px" }}>
                    No users{q ? ` for “${q}”` : ""}.
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
