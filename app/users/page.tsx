// app/users/page.tsx
import AddUserButton from "./AddUserButton";
import { UserModel } from "@/models/User";
import { MembershipModel } from "@/models/Membership";

type SearchParams = {
  q?: string; // search by name/email/phone/userId
  filter?: "all" | "members" | "nonmembers";
};

function fmtDate(v?: string | Date) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type IdLike = string | { toString?: () => string };
const toIdString = (v: IdLike) => (typeof v === "string" ? v : v?.toString?.() || "");

type UserLean = {
  _id: IdLike;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  dob?: string | Date;
  createdAt?: string | Date;
};

type MembershipLean = {
  userId?: string;
  userEmail?: string;
  userName?: string;
  planId?: string;
  planName?: string;
  status?: string;
  createdAt?: string | Date;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const User = await UserModel();
  const Membership = await MembershipModel();

  const q = (searchParams.q || "").trim();
  const filter = (searchParams.filter as SearchParams["filter"]) || "all";

  // 1) Find users (optional search across name/email/phone/userId)
  const userQuery: Record<string, unknown> = {};
  if (q) {
    userQuery.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { userId: { $regex: q, $options: "i" } },
    ];
  }

  const users = (await User.find(userQuery)
    .select({ userId: 1, name: 1, email: 1, phone: 1, dob: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean()) as UserLean[];

  // 2) Get memberships for these users
  const ids = users.map((u) => toIdString(u._id));
  const emails = users
    .map((u) => (u.email || "").toLowerCase())
    .filter(Boolean);
  const names = users
    .map((u) => (u.name || "").trim())
    .filter(Boolean);

  const members = (await Membership.find({
    $or: [
      { userId: { $in: ids } },
      { userEmail: { $in: emails } },
      { userName: { $in: names } },
    ],
  })
    .select({
      userId: 1,
      userEmail: 1,
      userName: 1,
      planId: 1,
      planName: 1,
      status: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 }) // latest wins
    .lean()) as MembershipLean[];

  // Index latest membership per user
  const byId = new Map<string, MembershipLean>();
  const byEmail = new Map<string, MembershipLean>();
  const byName = new Map<string, MembershipLean>();
  for (const m of members) {
    if (m.userId && !byId.has(m.userId)) byId.set(m.userId, m);
    const em = (m.userEmail || "").toLowerCase();
    if (em && !byEmail.has(em)) byEmail.set(em, m);
    const nm = (m.userName || "").trim();
    if (nm && !byName.has(nm)) byName.set(nm, m);
  }

  const getMembershipForUser = (u: UserLean): MembershipLean | null =>
    byId.get(toIdString(u._id)) ||
    byEmail.get((u.email || "").toLowerCase()) ||
    byName.get((u.name || "").trim()) ||
    null;

  // 3) Apply filter (members / nonmembers / all)
  const filteredUsers: UserLean[] = users.filter((u) => {
    const hasMembership = !!getMembershipForUser(u);
    if (filter === "members") return hasMembership;
    if (filter === "nonmembers") return !hasMembership;
    return true; // "all"
  });

  // 4) Export link should preserve current filters
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter && filter !== "all") params.set("filter", filter);
  const exportHref = `/api/users/export${params.toString() ? `?${params.toString()}` : ""}`;

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
            Users
          </h1>
          <p className="card__subtitle">Manage users and memberships</p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* NEW: Add User modal trigger */}
          <AddUserButton />

          <a
            href="/dashboard"
            className="btn"
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            ← Back to Dashboard
          </a>

          <a className="btn btn--primary" href={exportHref} aria-label="Export users to Excel">
            Export to Excel
          </a>
        </div>
      </div>

      {/* Toolbar: search + filter */}
      <div className="card__body">
        <form className="toolbar" method="get">
          <input
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Search by name, email, phone or username…"
            aria-label="Search users"
            style={{ flex: 2, minWidth: 160 }}
          />
        <select
            name="filter"
            defaultValue={filter}
            className="input"
            aria-label="Filter by membership"
            style={{ flex: 1, minWidth: 160 }}
          >
            <option value="all">All</option>
            <option value="members">Members</option>
            <option value="nonmembers">Non-members</option>
          </select>
          <button className="btn btn--primary" type="submit">
            Apply
          </button>
          <a href="/users" className="btn" style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}>
            Reset
          </a>
        </form>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Username</th>
                <th style={{ minWidth: 160 }}>Name</th>
                <th style={{ minWidth: 240 }}>Email</th>
                <th style={{ minWidth: 130 }}>Phone</th>
                <th style={{ minWidth: 130 }}>DOB</th>
                <th style={{ minWidth: 260 }}>Membership Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const m = getMembershipForUser(u);
                const details = m
                  ? `Plan: ${m.planId ?? ""}${m.planName ? ` (${m.planName})` : ""}${
                      m.status ? ` • ${m.status}` : ""
                    }`.trim()
                  : "No membership";

                return (
                  <tr key={toIdString(u._id)}>
                    <td>{u.userId || "—"}</td>
                    <td>{u.name || "—"}</td>
                    <td>{u.email || "—"}</td>
                    <td>{u.phone || "—"}</td>
                    <td>{fmtDate(u.dob)}</td>
                    <td>{details}</td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "18px" }}>
                    No users found{q ? ` for “${q}”` : ""}.
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
