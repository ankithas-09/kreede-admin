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
  dob?: string;      // ✅ NEW: used to compute age-based pricing
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
    dob?: string;      // optional
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

// ✅ Helper: parse DOB and compute age in years (integer), or null if unknown
function calcAgeFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= 0 && age < 200 ? age : null;
}

export default function AddMembershipGlobalButton() {
  const [open, setOpen] = useState(false);

  // step 1: search user
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const [results, setResults] = useState<UserLite[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selected, setSelected] = useState<UserLite | null>(null);

  // 🔹 Resolved DOB + age (may come from search hit or fetched fresh)
  const [resolvedDob, setResolvedDob] = useState<string | undefined>(undefined);
  const age = useMemo(() => calcAgeFromDob(resolvedDob), [resolvedDob]);
  const isChild = age !== null && age <= 12;

  // step 2: plan + amount + aadhar/newMember + memberId (restore)
  const [planId, setPlanId] = useState<Plan>("1M");
  const [amount, setAmount] = useState<number>(2499);
  const [aadhar, setAadhar] = useState<string>("");
  const [newMember, setNewMember] = useState<boolean>(false);
  const [memberId, setMemberId] = useState<string>(""); // ← prefilled for restore

  // mode (affects UI and validation; server always creates a fresh row)
  const [mode, setMode] = useState<"new" | "restore">("new");

  // status
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Helper to get the base default per plan
  function baseAmountForPlan(p: Plan, child: boolean) {
    if (child) {
      // ✅ Child pricing: only 1M is valid; fixed ₹2500
      return 2500;
    }
    if (p === "1M") return 2499;
    if (p === "3M") return 6999;
    if (p === "6M") return 13499;
    return 2499;
  }

  // When plan OR child flag changes, reset amount appropriately.
  useEffect(() => {
    const base = baseAmountForPlan(planId, isChild);
    // If child, ignore the new-member fee; otherwise apply it
    setAmount(isChild ? base : base + (newMember ? 500 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, isChild]);

  // If "newMember" toggles, recompute amount (but ignore when child)
  useEffect(() => {
    if (isChild) return; // locked to ₹2500
    const base = baseAmountForPlan(planId, false);
    setAmount(base + (newMember ? 500 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newMember]);

  // If user becomes "child" after selection, force plan to 1M and lock amount to 2500
  useEffect(() => {
    if (isChild) {
      if (planId !== "1M") setPlanId("1M");
      setNewMember(false); // child pricing excludes +₹500
      setAmount(2500);
    }
    // no else — adult case already handled in plan/newMember effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChild]);

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
                dob: typeof u.dob === "string" ? u.dob : undefined, // ✅ include if present
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
        dob: d.user.dob,
      });

      setResolvedDob(d.user.dob); // may be undefined — we’ll try to fetch later
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
  // ... (unchanged logic)
  useEffect(() => {
    async function fillMemberIdForRestore() {
      if (!open || mode !== "restore" || !selected) return;

      if (selected.memberId) {
        setMemberId(selected.memberId);
        return;
      }

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

      try {
        if (selected.email) {
          const r2 = await fetch(`/api/users?q=${encodeURIComponent(selected.email)}`);
          const j2: any = await r2.json().catch(() => ({}));
          const userHit =
            Array.isArray(j2?.users) && j2.users.length ? j2.users[0] : undefined;
          if (userHit?.memberId) {
            setMemberId(String(userHit.memberId));
            // ✅ also capture dob if available
            if (typeof userHit.dob === "string") setResolvedDob(userHit.dob);
            return;
          }
          if (typeof userHit?.dob === "string") setResolvedDob(userHit.dob);
        }
      } catch {
        /* ignore */
      }

      setMemberId("");
    }

    fillMemberIdForRestore();
  }, [open, mode, selected]);

  // If a user is selected from the search list, also try to resolve DOB if missing
  useEffect(() => {
    async function resolveDob() {
      if (!open || !selected) return;
      if (selected.dob) {
        setResolvedDob(selected.dob);
        return;
      }
      // Try fetching by email (or userId handle) to get a full record including dob
      try {
        const key = selected.email || (selected.userId ? `@${selected.userId}` : "");
        if (!key) return;
        const r = await fetch(`/api/users?q=${encodeURIComponent(key)}`);
        const j: any = await r.json().catch(() => ({}));
        const hit = Array.isArray(j?.users) && j.users.length ? j.users[0] : undefined;
        if (typeof hit?.dob === "string") setResolvedDob(hit.dob);
      } catch {
        /* ignore */
      }
    }
    resolveDob();
  }, [open, selected]);

  function resetAll() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setPlanId("1M");
    setAmount(2499);
    setAadhar("");
    setNewMember(false);
    setMode("new");
    setMemberId("");
    setSaving(false);
    setErr(null);
    setResolvedDob(undefined);
  }

  function isValidAadhar(s: string) {
    return /^\d{12}$/.test(s);
  }

  // Toggle handler: adds/removes ₹500 on top of whatever is in the field
  function onToggleNewMember(e: React.ChangeEvent<HTMLInputElement>) {
    if (isChild) return; // locked; ignore toggles
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
      if (!memberId || !/^\d{7}$/.test(memberId)) {
        setErr("Member ID not found for this user. Please verify their profile.");
        return;
      }
    }

    setSaving(true);
    setErr(null);
    try {
      // ✅ Enforce child constraints at payload level too
      const enforcedPlan: Plan = isChild ? "1M" : planId;
      const enforcedAmount = isChild ? 2500 : amount;

      const body: any = {
        userId: selected.userId || "",
        userName: selected.name || "",
        userEmail: (selected.email || "").toLowerCase(),
        planId: enforcedPlan,
        amount: enforcedAmount, // includes +₹500 only if adult + toggled
        paidNow: true,
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
                <div className="badge" style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span>Selected: {selectedLabel}</span>
                  {age !== null && (
                    <span
                      style={{
                        background: isChild ? "#e6f8e6" : "#eef2ff",
                        color: isChild ? "#0a7a0a" : "#334",
                        padding: "4px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                      }}
                    >
                      Age: {age} {isChild ? "• Child pricing applied (₹2,500 · 1M only)" : ""}
                    </span>
                  )}
                  {!resolvedDob && (
                    <span
                      style={{
                        background: "#fff5e6",
                        color: "#7a4a0a",
                        padding: "4px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                      }}
                    >
                      DOB not found
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSelected(null)}
                    style={{
                      marginLeft: "auto",
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
                              {u.dob ? ` • DOB: ${u.dob}` : ""}
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
                    disabled={isChild} // ✅ lock when child
                    title={isChild ? "Child pricing: 1M only" : "Select plan"}
                  >
                    {/* ✅ If child, only show 1M */}
                    {isChild ? (
                      <option value="1M">1M (25 games)</option>
                    ) : (
                      <>
                        <option value="1M">1M (25 games)</option>
                        <option value="3M">3M (75 games)</option>
                        <option value="6M">6M (150 games)</option>
                      </>
                    )}
                  </select>
                  {isChild && (
                    <div style={{ fontSize: 12, color: "#0a7a0a", marginTop: 4 }}>
                      Age ≤ 12: only 1M plan is available.
                    </div>
                  )}
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
                    readOnly={isChild} // ✅ lock amount for child
                    title={isChild ? "Child pricing locks amount to ₹2,500" : "Edit amount"}
                  />
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    {isChild
                      ? "Child pricing applied (no new member fee)."
                      : newMember
                      ? "Includes ₹500 new member fee."
                      : "No new member fee applied."}
                  </div>
                </div>

                {/* New member (+₹500) checkbox */}
                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    opacity: isChild ? 0.5 : 1,
                  }}
                >
                  <input
                    id="new-member"
                    type="checkbox"
                    checked={newMember}
                    onChange={onToggleNewMember}
                    style={{ width: 18, height: 18 }}
                    disabled={isChild} // ✅ disabled when child
                  />
                  <label
                    htmlFor="new-member"
                    className="label"
                    style={{ margin: 0, cursor: isChild ? "not-allowed" : "pointer" }}
                    title={isChild ? "Child pricing excludes the new member fee" : undefined}
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
