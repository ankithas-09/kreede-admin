// app/memberships/AddMembershipGlobalButton.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type UserLite = { _id: string; userId?: string; name?: string; email?: string; phone?: string };
type Plan = "1M" | "3M" | "6M";

function useDebouncedValue<T>(val: T, ms = 300) {
  const [v, setV] = useState(val);
  useEffect(() => {
    const t = setTimeout(() => setV(val), ms);
    return () => clearTimeout(t);
  }, [val, ms]);
  return v;
}

export default function AddMembershipGlobalButton() {
  const [open, setOpen] = useState(false);

  // step 1: search user
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const [results, setResults] = useState<UserLite[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selected, setSelected] = useState<UserLite | null>(null);

  // step 2: plan + amount
  const [planId, setPlanId] = useState<Plan>("1M");
  const [amount, setAmount] = useState<number>(2999);

  // status
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // default amount per plan
  useEffect(() => {
    if (planId === "1M") setAmount(2999);
    if (planId === "3M") setAmount(8999);
    if (planId === "6M") setAmount(17999);
  }, [planId]);

  // fetch users when typing
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) return;
      if (!debounced) { setResults([]); return; }
      setLoadingSearch(true);
      try {
        const r = await fetch(`/api/users?q=${encodeURIComponent(debounced)}`);
        const j: unknown = await r.json().catch(() => ({}));
        if (!abort) {
          const usersArr = (j as { users?: unknown }).users;
          const arr: UserLite[] = Array.isArray(usersArr)
            ? usersArr.map((u: unknown): UserLite => {
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
        if (!abort) setLoadingSearch(false);
      }
    }
    run();
    return () => { abort = true; };
  }, [debounced, open]);

  function resetAll() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setPlanId("1M");
    setAmount(5000);
    setSaving(false);
    setErr(null);
  }

  async function createPaid() {
    if (!selected) {
      setErr("Please select a user.");
      return;
    }
    if (!selected.email) {
      setErr("Selected user has no email.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selected.userId || "",
          userName: selected.name || "",
          userEmail: (selected.email || "").toLowerCase(),
          planId,
          amount,
          paidNow: true, // 👈 create as PAID
        }),
      });
      const j: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (j as { error?: string })?.error || "Failed to create membership";
        setErr(msg);
        setSaving(false);
        return;
      }
      // success → close & refresh list
      setOpen(false);
      resetAll();
      window.location.reload();
    } catch {
      setErr("Failed to create membership");
      setSaving(false);
    }
  }

  // derived label
  const selectedLabel = useMemo(() => {
    if (!selected) return "";
    return `${selected.name || "—"} · ${selected.email || "—"}${selected.userId ? ` · @${selected.userId}` : ""}`;
  }, [selected]);

  return (
    <>
      <button className="btn btn--primary" onClick={() => setOpen(true)}>
        + Add Membership
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(17,17,17,0.35)",
            zIndex: 50,
            padding: 12,
          }}
          onClick={() => { setOpen(false); resetAll(); }}
        >
          <div
            className="card"
            style={{ maxWidth: 600, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card__header">
              <h3 className="card__title">Add Membership</h3>
              <p className="card__subtitle">Search a user, choose plan, then mark paid.</p>
            </div>

            <div className="card__body">
              {err && (
                <div style={{ background: "#ffe6e6", color: "#b00020", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
                  {err}
                </div>
              )}

              {/* Step 1: search user */}
              <div style={{ marginBottom: 12 }}>
                <label className="label">Search user by name / email / phone / username</label>
                <input
                  className="input"
                  placeholder="Start typing to search…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                />
                {/* Dropdown results */}
                {query && !selected && (
                  <div
                    style={{
                      marginTop: 6,
                      maxHeight: 220,
                      overflow: "auto",
                      border: "1px solid rgba(17,17,17,0.12)",
                      borderRadius: 10,
                      background: "#fff",
                    }}
                  >
                    {loadingSearch && (
                      <div style={{ padding: 10, fontSize: 14, color: "#555" }}>Searching…</div>
                    )}
                    {!loadingSearch && results.length === 0 && (
                      <div style={{ padding: 10, fontSize: 14, color: "#555" }}>No users found.</div>
                    )}
                    {!loadingSearch &&
                      results.map((u) => (
                        <button
                          key={u._id}
                          type="button"
                          className="profile-item"
                          onClick={() => setSelected(u)}
                          style={{ width: "100%", textAlign: "left" }}
                        >
                          <div style={{ fontWeight: 700 }}>{u.name || "—"}</div>
                          <div style={{ fontSize: 12, color: "#555" }}>
                            {u.email || "—"}{u.userId ? ` • @${u.userId}` : ""}{u.phone ? ` • ${u.phone}` : ""}
                          </div>
                        </button>
                      ))}
                  </div>
                )}

                {selected && (
                  <div className="badge" style={{ marginTop: 8 }}>
                    Selected: {selectedLabel}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setSelected(null)}
                      style={{ marginLeft: 8, background: "#fff", border: "1px solid rgba(17,17,17,0.12)", padding: "4px 8px", minHeight: 0 }}
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>

              {/* Step 2: plan + amount */}
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label className="label">Plan</label>
                  <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value as Plan)}>
                    <option value="1M">1M (25 games)</option>
                    <option value="3M">3M (75 games)</option>
                    <option value="6M">6M (150 games)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Amount (INR)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => { setOpen(false); resetAll(); }}
                  style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={createPaid}
                  disabled={!selected || saving}
                  title={!selected ? "Select a user first" : "Create paid membership"}
                >
                  {saving ? "Creating…" : "Mark Paid & Create"}
                </button>
              </div>

              <p className="footer-note" style={{ marginTop: 6 }}>
                This will immediately create the membership as <b>PAID</b>.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
