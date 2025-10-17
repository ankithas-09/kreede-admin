// app/event-registrations/AddRegistrationButton.tsx
"use client";

import { useEffect, useState } from "react";

type PersonLite = {
  _id: string;
  userId?: string;   // username/handle
  name?: string;
  email?: string;
  phone?: string;
};

type Who = "member" | "user" | "guest";

type AdminRegistrationPayload = {
  eventId: string;
  eventTitle: string;
  type: Who;
  entryFee: number;
  markPaid: boolean;
  userEmail?: string;
  userName?: string;
  userId?: string;
  guestName?: string;
  guestPhone?: string;
};

export default function AddRegistrationButton({
  eventId,
  eventTitle,
  entryFee,
}: {
  eventId: string;
  eventTitle: string;
  entryFee: number; // 0 => free event
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Who>("member");

  // --- Member search state ---
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<PersonLite[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PersonLite | null>(null);

  // --- User search state ---
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonLite[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PersonLite | null>(null);

  // --- Guest fields ---
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ------------ Fetch members (active) by search ------------ */
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) return;
      if (!memberQuery.trim()) {
        setMemberResults([]);
        return;
      }
      setLoadingMembers(true);
      try {
        const r = await fetch(`/api/memberships/search?q=${encodeURIComponent(memberQuery)}`);
        const j: unknown = await r.json().catch(() => ({}));
        if (!abort) {
          const membersArr = (j as { members?: unknown }).members;
          const arr: PersonLite[] = Array.isArray(membersArr)
            ? membersArr.map((m: unknown): PersonLite => {
                const o = (m ?? {}) as Record<string, unknown>;
                return {
                  _id: String(o._id ?? ""),
                  userId: typeof o.userId === "string" ? o.userId : undefined,
                  name: typeof o.name === "string" ? o.name : undefined,
                  email: typeof o.email === "string" ? o.email : undefined,
                  phone: typeof o.phone === "string" ? o.phone : undefined,
                };
              })
            : [];
          setMemberResults(arr);
        }
      } catch {
        if (!abort) setMemberResults([]);
      } finally {
        if (!abort) setLoadingMembers(false);
      }
    }
    run();
    return () => {
      abort = true;
    };
  }, [memberQuery, open]);

  /* ------------ Users search ------------ */
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) return;
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoadingUsers(true);
      try {
        const r = await fetch(`/api/users?q=${encodeURIComponent(query)}`);
        const j: unknown = await r.json().catch(() => ({}));
        if (!abort) {
          const usersArr = (j as { users?: unknown }).users;
          const arr: PersonLite[] = Array.isArray(usersArr)
            ? usersArr.map((u: unknown): PersonLite => {
                const o = (u ?? {}) as Record<string, unknown>;
                return {
                  _id: String(o._id ?? ""),
                  userId: typeof o.userId === "string" ? o.userId : undefined,
                  name: typeof o.name === "string" ? o.name : undefined,
                  email: typeof o.email === "string" ? o.email : undefined,
                  phone: typeof o.phone === "string" ? o.phone : undefined,
                };
              })
            : [];
          setResults(arr);
        }
      } catch {
        if (!abort) setResults([]);
      } finally {
        if (!abort) setLoadingUsers(false);
      }
    }
    run();
    return () => {
      abort = true;
    };
  }, [query, open]);

  function resetAll() {
    setWho("member");
    setSelectedMember(null);
    setMemberQuery("");
    setMemberResults([]);

    setSelectedUser(null);
    setQuery("");
    setResults([]);

    setGuestName("");
    setGuestPhone("");

    setErr(null);
    setSaving(false);
  }

  async function create(markPaid: boolean) {
    try {
      setSaving(true);
      setErr(null);

      const isFree = Number(entryFee || 0) <= 0;

      const payload: AdminRegistrationPayload = {
        eventId,
        eventTitle,
        type: who, // member | user | guest
        entryFee: Number(entryFee || 0),
        markPaid: isFree ? true : !!markPaid,
      };

      if (who === "member") {
        if (!selectedMember?.email) throw new Error("Search and select a member.");
        payload.userEmail = String(selectedMember.email).toLowerCase();
        payload.userName = selectedMember.name || "";
        payload.userId = selectedMember.userId || "";
      } else if (who === "user") {
        if (!selectedUser?.email) throw new Error("Search and select a user.");
        payload.userEmail = String(selectedUser.email).toLowerCase();
        payload.userName = selectedUser.name || "";
        payload.userId = selectedUser.userId || "";
      } else {
        if (!guestName.trim() || !guestPhone.trim())
          throw new Error("Guest name and phone are required.");
        payload.guestName = guestName.trim();
        payload.guestPhone = guestPhone.trim();
      }

      const res = await fetch("/api/registrations/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (j as { error?: string })?.error || "Failed to add registration";
        throw new Error(msg);
      }

      setOpen(false);
      resetAll();
      window.location.reload();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to add registration";
      setErr(message);
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn btn--primary" onClick={() => setOpen(true)}>
        + Add Registration
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setOpen(false);
            resetAll();
          }}
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(17,17,17,0.35)",
            zIndex: 60,
            padding: 12,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "auto" }}
          >
            <div className="card__header">
              <h3 className="card__title">Add Registration</h3>
              <p className="card__subtitle">
                For: <strong>{eventTitle || "Event"}</strong> • Entry Fee:{" "}
                {entryFee > 0 ? `₹${entryFee}` : "Free"}
              </p>
            </div>

            <div className="card__body">
              {err && (
                <div
                  style={{
                    background: "#ffe6e6",
                    color: "#b00020",
                    padding: "8px 12px",
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  {err}
                </div>
              )}

              <div className="form" style={{ marginBottom: 12 }}>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr" }}>
                  <div>
                    <label className="label">Who is this for?</label>
                    <select
                      className="input"
                      value={who}
                      onChange={(e) => setWho(e.target.value as Who)}
                    >
                      <option value="member">Member</option>
                      <option value="user">User</option>
                      <option value="guest">Guest</option>
                    </select>
                  </div>
                </div>

                {/* Member search and pick */}
                {who === "member" && (
                  <div>
                    <label className="label">Search member (name / email / username)</label>
                    <input
                      className="input"
                      placeholder="Start typing to search…"
                      value={
                        selectedMember
                          ? `${selectedMember.name || "—"} · ${
                              selectedMember.email || "—"
                            }${selectedMember.userId ? ` · @${selectedMember.userId}` : ""}`
                          : memberQuery
                      }
                      onChange={(e) => {
                        setSelectedMember(null);
                        setMemberQuery(e.target.value);
                      }}
                    />
                    {!selectedMember && memberQuery && (
                      <div
                        style={{
                          marginTop: 6,
                          maxHeight: 220,
                          overflow: "auto",
                          background: "#fff",
                          border: "1px solid rgba(17,17,17,0.12)",
                          borderRadius: 10,
                        }}
                      >
                        {loadingMembers && (
                          <div style={{ padding: 10, fontSize: 14, color: "#555" }}>
                            Searching…
                          </div>
                        )}
                        {!loadingMembers && memberResults.length === 0 && (
                          <div style={{ padding: 10, fontSize: 14, color: "#555" }}>
                            No members found.
                          </div>
                        )}
                        {!loadingMembers &&
                          memberResults.map((m) => (
                            <button
                              key={m._id}
                              type="button"
                              className="profile-item"
                              onClick={() => setSelectedMember(m)}
                              style={{ width: "100%", textAlign: "left" }}
                            >
                              <div style={{ fontWeight: 700 }}>{m.name || "—"}</div>
                              <div style={{ fontSize: 12, color: "#555" }}>
                                {(m.email || "—").toLowerCase()}
                                {m.userId ? ` • @${m.userId}` : ""}
                                {m.phone ? ` • ${m.phone}` : ""}
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* User search and pick */}
                {who === "user" && (
                  <div>
                    <label className="label">
                      Search user (name / email / phone / username)
                    </label>
                    <input
                      className="input"
                      placeholder="Start typing to search…"
                      value={
                        selectedUser
                          ? `${selectedUser.name || "—"} · ${
                              selectedUser.email || "—"
                            }${selectedUser.userId ? ` · @${selectedUser.userId}` : ""}`
                          : query
                      }
                      onChange={(e) => {
                        setSelectedUser(null);
                        setQuery(e.target.value);
                      }}
                    />
                    {!selectedUser && query && (
                      <div
                        style={{
                          marginTop: 6,
                          maxHeight: 220,
                          overflow: "auto",
                          background: "#fff",
                          border: "1px solid rgba(17,17,17,0.12)",
                          borderRadius: 10,
                        }}
                      >
                        {loadingUsers && (
                          <div style={{ padding: 10, fontSize: 14, color: "#555" }}>
                            Searching…
                          </div>
                        )}
                        {!loadingUsers && results.length === 0 && (
                          <div style={{ padding: 10, fontSize: 14, color: "#555" }}>
                            No users found.
                          </div>
                        )}
                        {!loadingUsers &&
                          results.map((u) => (
                            <button
                              key={u._id}
                              type="button"
                              className="profile-item"
                              onClick={() => setSelectedUser(u)}
                              style={{ width: "100%", textAlign: "left" }}
                            >
                              <div style={{ fontWeight: 700 }}>{u.name || "—"}</div>
                              <div style={{ fontSize: 12, color: "#555" }}>
                                {u.email || "—"}
                                {u.userId ? ` • @${u.userId}` : ""}
                                {u.phone ? ` • ${u.phone}` : ""}
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Guest fields */}
                {who === "guest" && (
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                    <div>
                      <label className="label">Guest name</label>
                      <input
                        className="input"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Guest phone</label>
                      <input
                        className="input"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div className="badge">
                  {entryFee > 0 ? <>Entry Fee: ₹{entryFee}</> : "Free Event"}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      resetAll();
                    }}
                    style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
                  >
                    Cancel
                  </button>

                  {entryFee <= 0 ? (
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={() => create(true)}
                      disabled={saving}
                    >
                      {saving ? "Registering…" : "Register (Free)"}
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => create(false)}
                        disabled={saving}
                        style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
                        title="Create registration as Pending (collect payment later)"
                      >
                        {saving ? "Saving…" : "Create (Pending)"}
                      </button>
                      <button
                        className="btn btn--primary"
                        type="button"
                        onClick={() => create(true)}
                        disabled={saving}
                        title="Create registration and mark as Paid"
                      >
                        {saving ? "Saving…" : "Create & Mark Paid"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
