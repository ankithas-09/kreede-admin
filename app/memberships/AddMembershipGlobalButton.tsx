// app/memberships/AddMembershipGlobalButton.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type UserLite = {
  _id: string;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  memberId?: string; // may be present from some endpoints
};
type Plan = "1M" | "3M" | "6M";

// Payload sent by the Memberships page "Restore" button
type PrefillEventDetail = {
  user: {
    _id: string;
    userId?: string;
    name?: string;
    email?: string;
    phone?: string;
    memberId?: string; // optional: if page passes it, we’ll use it directly
  };
  mode?: "restore" | "new";
};

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

  // step 2: plan + amount + aadhar/newMember + memberId (restore)
  const [planId, setPlanId] = useState<Plan>("1M");
  const [amount, setAmount] = useState<number>(2999);
  const [aadhar, setAadhar] = useState<string>("");
  const [newMember, setNewMember] = useState<boolean>(false);
  const [memberId, setMemberId] = useState<string>(""); // ← prefilled for restore

  // mode (affects UI and validation; server always creates a fresh row)
  const [mode, setMode] = useState<"new" | "restore">("new");

  // status
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Helper to get the base default per plan
  function baseAmountForPlan(p: Plan) {
    if (p === "1M") return 2999;
    if (p === "3M") return 8999;
    if (p === "6M") return 17999;
    return 2999;
  }

  // When plan changes, reset amount to base + (newMember ? 500 : 0)
  useEffect(() => {
    const base = baseAmountForPlan(planId);
    setAmount(base + (newMember ? 500 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // fetch users when typing
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) return;
      if (!debounced) {
        setResults([]);
        return;
      }
      setLoadingSearch(true);
      try {
        const r = await fetch(`/api/users?q=${encodeURIComponent(debounced)}`);
        const j: any = await r.json().catch(() => ({}));
        if (!abort) {
          const arr: UserLite[] = Array.isArray(j?.users)
            ? j.users.map((u: any): UserLite => ({
                _id: String(u._id ?? ""),
                userId: typeof u.userId === "string" ? u.userId : undefined,
                name: typeof u.name === "string" ? u.name : undefined,
                email: typeof u.email === "string" ? u.email : undefined,
                phone: typeof u.phone === "string" ? u.phone : undefined,
                memberId: typeof u.memberId === "string" ? u.memberId : undefined,
              }))
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
    return () => {
      abort = true;
    };
  }, [debounced, open]);

  // Prefill handler (Restore / New)
  useEffect(() => {
    function onOpenAddMembership(e: Event) {
      const ce = e as CustomEvent<PrefillEventDetail>;
      const d = ce.detail;
      if (!d?.user?._id) return;

      // open and prefill user
      setSelected({
        _id: d.user._id,
        userId: d.user.userId,
        name: d.user.name,
        email: d.user.email,
        phone: d.user.phone,
        memberId: d.user.memberId,
      });

      setMode(d.mode || "new");

      // reset transient state
      setQuery("");
      setResults([]);
      setErr(null);
      setSaving(false);
      setAadhar(""); // only used for "new"
      setMemberId(d.user.memberId || ""); // may be set immediately if provided
      setOpen(true);
    }

    window.addEventListener("open-add-membership", onOpenAddMembership as EventListener);
    return () =>
      window.removeEventListener("open-add-membership", onOpenAddMembership as EventListener);
  }, []);

  // When opened in RESTORE mode, ensure we show the existing Member ID:
  // 1) Use selected.memberId if already present.
  // 2) Else, try latest membership via /api/memberships?q=<email|name|userId>
  // 3) Else, try /api/users?q=<email> to read memberId from user profile
  useEffect(() => {
    async function fillMemberIdForRestore() {
      if (!open || mode !== "restore" || !selected) return;

      // If we already have it, we’re done
      if (selected.memberId) {
        setMemberId(selected.memberId);
        return;
      }

      // Try to get it from latest membership
      const searchKey =
        selected.email || selected.name || (selected.userId ? `@${selected.userId}` : "") || "";
      try {
        if (searchKey) {
          const r = await fetch(`/api/memberships?q=${encodeURIComponent(searchKey)}`);
          const j: any = await r.json().catch(() => ({}));
          const mList: any[] = Array.isArray(j?.memberships) ? j.memberships : [];
          const latest = mList[0];
          if (latest?.memberId) {
            setMemberId(String(latest.memberId));
            return;
          }
        }
      } catch {
        /* ignore and try users endpoint */
      }

      // Fallback: try /api/users to read user.memberId
      try {
        if (selected.email) {
          const r2 = await fetch(`/api/users?q=${encodeURIComponent(selected.email)}`);
          const j2: any = await r2.json().catch(() => ({}));
          const userHit =
            Array.isArray(j2?.users) && j2.users.length ? j2.users[0] : undefined;
          if (userHit?.memberId) {
            setMemberId(String(userHit.memberId));
            return;
          }
        }
      } catch {
        /* ignore */
      }

      // If still nothing, leave blank (server can still accept restore without it,
      // but UI requested to show it, so better to be explicit)
      setMemberId("");
    }

    fillMemberIdForRestore();
  }, [open, mode, selected]);

  function resetAll() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setPlanId("1M");
    setAmount(2999);
    setAadhar("");
    setNewMember(false);
    setMode("new");
    setMemberId("");
    setSaving(false);
    setErr(null);
  }

  function isValidAadhar(s: string) {
    return /^\d{12}$/.test(s);
  }

  // Toggle handler: adds/removes ₹500 on top of whatever is in the field
  function onToggleNewMember(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setNewMember(checked);
    setAmount((prev) => (checked ? prev + 500 : Math.max(0, prev - 500)));
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

    // Validation differs by mode:
    if (mode === "new") {
      if (!isValidAadhar(aadhar)) {
        setErr("Enter a valid 12-digit Aadhar number.");
        return;
      }
    } else {
      // restore: memberId is strongly expected (UI requirement to show it)
      if (!memberId || !/^\d{7}$/.test(memberId)) {
        setErr("Member ID not found for this user. Please verify their profile.");
        return;
      }
    }

    setSaving(true);
    setErr(null);
    try {
      const body: any = {
        userId: selected.userId || "",
        userName: selected.name || "",
        userEmail: (selected.email || "").toLowerCase(),
        planId,
        amount, // includes +₹500 if newMember is checked
        paidNow: true, // create as PAID
      };

      if (mode === "new") {
        body.aadhar = aadhar;
      } else {
        body.memberId = memberId; // server uses this to keep the same member id
      }

      const res = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = j?.error || "Failed to create membership";
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
    return `${selected.name || "—"} · ${selected.email || "—"}${
      selected.userId ? ` · @${selected.userId}` : ""
    }`;
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
          onClick={() => {
            setOpen(false);
            resetAll();
          }}
        >
          <div
            className="card"
            style={{ maxWidth: 600, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card__header">
              <h3 className="card__title">
                {mode === "restore" ? "Restore Membership" : "Add Membership"}
              </h3>
              <p className="card__subtitle">
                {mode === "restore"
                  ? "Select the plan for renewal. This creates a new membership row."
                  : "Search a user, enter Aadhar, choose plan, then mark paid."}
              </p>
            </div>

            <div className="card__body">
              {err && (
                <div
                  style={{
                    background: "#ffe6e6",
                    color: "#b00020",
                    padding: "8px 12px",
                    borderRadius: 6,
                    marginBottom: 12,
                  }}
                >
                  {err}
                </div>
              )}

              {/* Selected user badge */}
              {selected && (
                <div className="badge" style={{ marginBottom: 8 }}>
                  Selected: {selectedLabel}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSelected(null)}
                    style={{
                      marginLeft: 8,
                      background: "#fff",
                      border: "1px solid rgba(17,17,17,0.12)",
                      padding: "4px 8px",
                      minHeight: 0,
                    }}
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Step 1: search user (hidden when one is prefilled via Restore) */}
              {!selected && (
                <div style={{ marginBottom: 12 }}>
                  <label className="label">Search user by name / email / phone / username</label>
                  <input
                    className="input"
                    placeholder="Start typing to search…"
                    value={selected ? "" : query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSelected(null);
                    }}
                  />
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
                        <div style={{ padding: 10, fontSize: 14, color: "#555" }}>
                          Searching…
                        </div>
                      )}
                      {!loadingSearch && results.length === 0 && (
                        <div style={{ padding: 10, fontSize: 14, color: "#555" }}>
                          No users found.
                        </div>
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

              {/* Step 2: Plan + Amount (+ new member flag) and Aadhar/Member ID */}
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                {/* Restore mode: show Member ID (read-only) */}
                {mode === "restore" && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className="label">Member ID</label>
                    <input
                      className="input"
                      value={memberId}
                      readOnly
                      placeholder="Fetching member ID…"
                    />
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      This member ID is reused for the renewal.
                    </div>
                  </div>
                )}

                {/* New mode: ask for Aadhar */}
                {mode === "new" && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className="label">Aadhar (12 digits)</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      pattern="^\u005cd{12}$"
                      maxLength={12}
                      placeholder="Enter 12-digit Aadhar"
                      value={aadhar}
                      onChange={(e) => {
                        const next = e.target.value.replace(/\D/g, "").slice(0, 12);
                        setAadhar(next);
                      }}
                    />
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      Must be exactly 12 digits. Saved to the user profile.
                    </div>
                  </div>
                )}

                <div>
                  <label className="label">Plan</label>
                  <select
                    className="input"
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value as Plan)}
                  >
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
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    {newMember
                      ? "Includes ₹500 new member fee."
                      : "No new member fee applied."}
                  </div>
                </div>

                {/* New member (+₹500) checkbox (you can hide this in restore if desired) */}
                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <input
                    id="new-member"
                    type="checkbox"
                    checked={newMember}
                    onChange={onToggleNewMember}
                    style={{ width: 18, height: 18 }}
                  />
                  <label
                    htmlFor="new-member"
                    className="label"
                    style={{ margin: 0, cursor: "pointer" }}
                  >
                    New member <span style={{ color: "#555" }}>(+₹500 one-time)</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div
                className="actions"
                style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}
              >
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
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={createPaid}
                  disabled={!selected || saving}
                  title={!selected ? "Select a user first" : "Create paid membership"}
                >
                  {saving
                    ? mode === "restore"
                      ? "Restoring…"
                      : "Creating…"
                    : mode === "restore"
                    ? "Restore & Create"
                    : "Mark Paid & Create"}
                </button>
              </div>

              <p className="footer-note" style={{ marginTop: 6 }}>
                {mode === "restore"
                  ? "This creates a NEW membership row (renewal)."
                  : "This will immediately create the membership as PAID."}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
