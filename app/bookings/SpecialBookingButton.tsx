// app/bookings/SpecialBookingButton.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type OfferType = "flat" | "conditional";
type Rule = { label: string; price: number; criteria?: string };
type Offer = {
  _id: string;
  title: string;
  description?: string;
  type: OfferType;
  dateFrom: string; // ISO
  dateTo: string;   // ISO
  timeFrom: string; // "HH:mm"
  timeTo: string;   // "HH:mm"
  flatPrice?: number;
  rules?: Rule[];
};

type Availability = Record<number, { start: string; end: string }[]>;
type Slot = { courtId: number; start: string; end: string };
type Who = "member" | "user" | "guest";

type UserLite = { _id: string; userId?: string; name?: string; email?: string; phone?: string };

const COURTS = [1, 2, 3];

/* ----------------------------- Utils ----------------------------- */
function isoDateOnly(d?: string | Date) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = `${dt.getMonth() + 1}`.padStart(2, "0");
  const day = `${dt.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function hhmm(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}
function label12h(h: number) {
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:00 ${ampm}`;
}
function toHour(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  return Number(m[1]);
}
function toMin(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}
function withinRange(hhmm: string, from: string, to: string) {
  const v = toMin(hhmm), f = toMin(from), t = toMin(to);
  return !Number.isNaN(v) && !Number.isNaN(f) && !Number.isNaN(t) && v >= f && v <= t;
}
/** clamp yyyy-mm-dd into [min,max] (inclusive) */
function clampDate(value: string, min?: string, max?: string) {
  if (!value) return value;
  const v = new Date(`${value}T00:00:00.000Z`);
  const lo = min ? new Date(`${min}T00:00:00.000Z`) : undefined;
  const hi = max ? new Date(`${max}T00:00:00.000Z`) : undefined;
  if (lo && v < lo) return isoDateOnly(lo);
  if (hi && v > hi) return isoDateOnly(hi);
  return value;
}

export default function SpecialBookingButton() {
  const [open, setOpen] = useState(false);

  // Who (member/user/guest)
  const [who, setWho] = useState<Who>("member");

  // Offers
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offerId, setOfferId] = useState("");
  const pickedOffer = useMemo(() => offers.find((o) => o._id === offerId), [offers, offerId]);
  const [selectedRuleLabel, setSelectedRuleLabel] = useState<string>("");

  // Date & availability
  const [date, setDate] = useState<string>("");
  const minDate = pickedOffer ? isoDateOnly(pickedOffer.dateFrom) : undefined;
  const maxDate = pickedOffer ? isoDateOnly(pickedOffer.dateTo) : undefined;
  const [availability, setAvailability] = useState<Availability>({});
  const [loadingAvail, setLoadingAvail] = useState(false);

  // Slot selection
  const [selected, setSelected] = useState<Slot[]>([]);

  // Search (member/user) OR guest fields
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserLite | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  /* -------------------------- Load offers -------------------------- */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoadingOffers(true);
      try {
        const r = await fetch("/api/offers/active", { cache: "no-store" });
        const j = await r.json();
        if (alive && j?.ok) setOffers(j.offers || []);
      } finally {
        alive && setLoadingOffers(false);
      }
    })();
    return () => { alive = false; };
  }, [open]);

  /* ------------- Reset when offer changes ------------------------- */
  useEffect(() => {
    // On selecting an offer, reset state and clamp date strictly into offer range
    if (pickedOffer) {
      const initial = isoDateOnly(pickedOffer.dateFrom);
      setDate(initial);
      setSelectedRuleLabel("");
      setSelected([]);
      setAvailability({});
    } else {
      setDate("");
      setSelectedRuleLabel("");
      setSelected([]);
      setAvailability({});
    }
  }, [pickedOffer]);

  /* ------------------------ Availability -------------------------- */
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) return;
      if (!date) { setAvailability({}); return; }
      setLoadingAvail(true);
      try {
        const r = await fetch(`/api/bookings/availability?date=${encodeURIComponent(date)}`, { cache: "no-store" });
        const j: unknown = await r.json().catch(() => ({}));
        if (!abort) {
          const avail = (j as { availability?: Availability }).availability || {};
          setAvailability(avail);
        }
      } finally {
        if (!abort) setLoadingAvail(false);
      }
    }
    run();
    return () => { abort = true; };
  }, [date, open]);

  /* --------------------- Search (member/user) ---------------------- */
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) return;
      if (!query.trim() || !(who === "member" || who === "user")) { setResults([]); return; }
      setLoadingSearch(true);
      try {
        const endpoint =
          who === "member"
            ? `/api/memberships/search?q=${encodeURIComponent(query)}`
            : `/api/users?q=${encodeURIComponent(query)}`;
        const r = await fetch(endpoint);
        const j: unknown = await r.json().catch(() => ({}));
        if (!abort) {
          const obj = (j as Record<string, unknown>) || {};
          const list = (obj.members as unknown) ?? (obj.users as unknown) ?? [];
          const arr: UserLite[] = Array.isArray(list)
            ? list.map((u: any) => ({
                _id: String(u._id ?? u.userId ?? u.email ?? Math.random().toString(36).slice(2)),
                userId: typeof u.userId === "string" ? u.userId : undefined,
                name: typeof u.name === "string" ? u.name : undefined,
                email: typeof u.email === "string" ? u.email : undefined,
                phone: typeof u.phone === "string" ? u.phone : undefined,
              }))
            : [];
          setResults(arr);
        }
      } finally {
        if (!abort) setLoadingSearch(false);
      }
    }
    run();
    return () => { abort = true; };
  }, [query, open, who]);

  /* ----------------- Booked blocks set (per court) ---------------- */
  const bookedSet = useMemo(() => {
    const s = new Set<string>();
    for (const cid of Object.keys(availability)) {
      const courtId = Number(cid);
      const items = availability[courtId] || [];
      for (const it of items) {
        s.add(`${courtId}_${it.start}_${it.end}`);
      }
    }
    return s;
  }, [availability]);

  /* -------- Offer hour window → show only within window ----------- */
  const START_HOUR = useMemo(() => {
    return pickedOffer ? Math.max(0, toHour(pickedOffer.timeFrom)) : 6;
  }, [pickedOffer]);

  const END_HOUR_EX = useMemo(() => {
    return pickedOffer ? Math.min(24, toHour(pickedOffer.timeTo)) : 23;
  }, [pickedOffer]);

  function toggle(courtId: number, hour: number) {
    if (!pickedOffer) return;
    const start = hhmm(hour);
    const end = hhmm(hour + 1);

    // Guard: only within the active offer's time window
    if (
      !withinRange(start, pickedOffer.timeFrom, pickedOffer.timeTo) ||
      !withinRange(end, pickedOffer.timeFrom, pickedOffer.timeTo)
    ) {
      return;
    }

    const key = `${courtId}_${start}_${end}`;
    if (bookedSet.has(key)) return;

    setSelected((s) => {
      const exists = s.find((x) => x.courtId === courtId && x.start === start && x.end === end);
      return exists ? s.filter((x) => !(x.courtId === courtId && x.start === start && x.end === end)) : [...s, { courtId, start, end }];
    });
  }

  /* ---------------------- Offer pricing logic ---------------------- */
  const perSlotFromOffer = useMemo(() => {
    if (!pickedOffer) return null;
    if (pickedOffer.type === "flat") return pickedOffer.flatPrice ?? null;
    const rule = (pickedOffer.rules || []).find((r) => r.label === selectedRuleLabel);
    return rule ? rule.price : null;
  }, [pickedOffer, selectedRuleLabel]);

  const perSlotDisplay = who === "member" ? 0 : (perSlotFromOffer ?? null);
  const totalAmount = perSlotDisplay == null ? null : perSlotDisplay * selected.length;

  /* ----------------------------- Submit ---------------------------- */
  async function submit() {
    setError("");
    if (!pickedOffer) return setError("Select an offer");
    if (!date) return setError("Pick a date");
    if (!selected.length) return setError("Select at least one slot");
    if (pickedOffer.type === "conditional" && !selectedRuleLabel) return setError("Select a rule");

    if (who === "member" || who === "user") {
      if (!selectedUser) return setError("Search and select a user");
      if (!selectedUser.email) return setError("Selected user has no email");
    } else {
      if (!guestName.trim() || !guestPhone.trim()) return setError("Guest name and phone are required");
    }

    // Safety re-checks for window & availability
    for (const s of selected) {
      if (!withinRange(s.start, pickedOffer.timeFrom, pickedOffer.timeTo) ||
          !withinRange(s.end, pickedOffer.timeFrom, pickedOffer.timeTo)) {
        return setError("Some slots are outside the offer time window.");
      }
      const key = `${s.courtId}_${s.start}_${s.end}`;
      if (bookedSet.has(key)) return setError("Some selected slots are no longer available.");
    }

    setSubmitting(true);
    try {
      const payload: any = {
        type: who,
        date,
        slots: selected,
        offerId: pickedOffer._id,
        selectedRuleLabel: pickedOffer.type === "conditional" ? selectedRuleLabel : undefined,
        paymentRef: who === "member" ? "MEMBERSHIP" : "PAID.CASH",
      };

      if (who === "member" || who === "user") {
        payload.userEmail = (selectedUser?.email || "").toLowerCase();
        payload.userName = selectedUser?.name || "";
        payload.userId = selectedUser?.userId || "";
      } else {
        payload.guestName = guestName.trim();
        payload.guestPhone = guestPhone.trim();
        payload.userName = guestName.trim();
      }

      const r = await fetch("/api/bookings/admin/special", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) setError(j?.error || "Failed to create booking");
      else {
        setOpen(false);
        if (typeof window !== "undefined") window.location.reload();
      }
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  /* --------------------------- Render ------------------------------ */
  return (
    <>
      <button className="btn btn--primary" onClick={() => setOpen(true)}>
        Special bookings
      </button>

      {!open ? null : (
        <div className="modal__backdrop" style={backdropStyle} onClick={() => setOpen(false)}>
          <div className="modal" style={modalStyle} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Special bookings</h3>
              <button className="btn" onClick={() => setOpen(false)}>✕</button>
            </div>

            {/* Who */}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 2fr" }}>
              <div>
                <label className="label">Who is this for?</label>
                <select
                  className="input"
                  value={who}
                  onChange={(e) => { setWho(e.target.value as Who); setSelectedUser(null); setQuery(""); }}
                >
                  <option value="member">Member (free)</option>
                  <option value="user">User</option>
                  <option value="guest">Guest</option>
                </select>
              </div>

              {(who === "member" || who === "user") ? (
                <div>
                  <label className="label">
                    {who === "member" ? "Search member (name / email)" : "Search user (name / email / phone / username)"}
                  </label>
                  <input
                    className="input"
                    placeholder="Start typing to search…"
                    value={
                      selectedUser
                        ? `${selectedUser.name || "—"} · ${selectedUser.email || "—"}${selectedUser.userId ? ` · @${selectedUser.userId}` : ""}`
                        : query
                    }
                    onChange={(e) => { setSelectedUser(null); setQuery(e.target.value); }}
                  />
                  {!selectedUser && query && (
                    <div
                      style={{
                        marginTop: 6,
                        maxHeight: 220,
                        overflow: "auto",
                        background: "#fff",
                        border: "1px solid rgba(17,17,17,0.12)",
                        borderRadius: 10
                      }}
                    >
                      {loadingSearch && <div style={{ padding: 10, fontSize: 14, color: "#555" }}>Searching…</div>}
                      {!loadingSearch && results.length === 0 && <div style={{ padding: 10, fontSize: 14, color: "#555" }}>No matches.</div>}
                      {!loadingSearch && results.map((u) => (
                        <button
                          key={u._id}
                          type="button"
                          className="profile-item"
                          onClick={() => setSelectedUser(u)}
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
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                  <div>
                    <label className="label">Guest name</label>
                    <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Guest phone</label>
                    <input className="input" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Offer selector */}
            {loadingOffers ? (
              <p style={{ marginTop: 12 }}>Loading offers…</p>
            ) : (
              <>
                <label className="label" style={{ marginTop: 12 }}>Offer</label>
                <select
                  className="input"
                  value={offerId}
                  onChange={(e) => setOfferId(e.target.value)}
                >
                  <option value="">Select an offer</option>
                  {offers.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.title} {o.type === "flat" ? `— ₹${o.flatPrice}` : ""}
                    </option>
                  ))}
                </select>

                {pickedOffer && pickedOffer.type === "conditional" && (
                  <div style={{ marginTop: 8 }}>
                    <label className="label">Choose rule</label>
                    <div style={{ display: "grid", gap: 6 }}>
                      {(pickedOffer.rules || []).map((r) => (
                        <label key={r.label} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="radio"
                            name="offerRule"
                            value={r.label}
                            checked={selectedRuleLabel === r.label}
                            onChange={() => setSelectedRuleLabel(r.label)}
                          />
                          <span>{r.label} — ₹{r.price}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Validity */}
                {pickedOffer && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    Valid: {isoDateOnly(pickedOffer.dateFrom)} → {isoDateOnly(pickedOffer.dateTo)} · Hours: {pickedOffer.timeFrom}–{pickedOffer.timeTo}
                  </div>
                )}

                {/* Date */}
                {pickedOffer && (
                  <div style={{ marginTop: 12 }}>
                    <label className="label">Date</label>
                    <input
                      type="date"
                      className="input"
                      value={date}
                      min={minDate}
                      max={maxDate}
                      onChange={(e) => {
                        const next = clampDate(e.target.value, minDate, maxDate);
                        setDate(next);
                        setSelected([]);
                      }}
                    />
                    {loadingAvail && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                        Checking availability…
                      </div>
                    )}
                  </div>
                )}

                {/* Slot picker (3 courts) within offer window only */}
                {pickedOffer && date && (
                  <div style={{ display: "grid", gap: 12, maxHeight: "48vh", overflowY: "auto", paddingRight: 4, marginTop: 12 }}>
                    {COURTS.map((c) => (
                      <div key={c} style={{ border: "1px solid rgba(17,17,17,0.1)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                        <div style={{ padding: "10px 12px", fontWeight: 800, background: "#fff7f2", borderBottom: "1px solid rgba(17,17,17,0.08)" }}>
                          Court {c}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 8, padding: 12 }}>
                          {Array.from({ length: Math.max(0, (END_HOUR_EX - START_HOUR)) }, (_, i) => START_HOUR + i).map((h) => {
                            const start = hhmm(h);
                            const end = hhmm(h + 1);
                            const key = `${c}_${start}_${end}`;
                            const isBooked = bookedSet.has(key);
                            const active = selected.some(s => s.courtId === c && s.start === start && s.end === end);

                            let bg = "#fff";
                            let border = "1px solid rgba(17,17,17,0.12)";
                            let color = "inherit";
                            let disabled = false;

                            if (isBooked) {
                              bg = "#22c55e";
                              border = "1px solid #16a34a";
                              color = "#fff";
                              disabled = true;
                            } else if (active) {
                              bg = "var(--accent)";
                              border = "1px solid var(--accent)";
                              color = "#fff";
                            }

                            return (
                              <button
                                key={`${c}_${h}`}
                                type="button"
                                onClick={() => toggle(c, h)}
                                className="btn"
                                disabled={disabled}
                                style={{
                                  border,
                                  background: bg,
                                  color,
                                  minHeight: 40,
                                  cursor: disabled ? "not-allowed" : "pointer",
                                  opacity: disabled ? 0.9 : 1,
                                }}
                                title={isBooked ? "Already booked" : active ? "Selected" : "Available"}
                              >
                                {label12h(h)} - {label12h(h + 1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Totals + CTA */}
                {pickedOffer && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600 }}>
                      {perSlotDisplay == null ? "—" : `₹${perSlotDisplay}`} per slot
                      {" · "}
                      Total: {totalAmount == null ? "—" : `₹${totalAmount}`}
                      {selected.length ? ` · ${selected.length} slot${selected.length === 1 ? "" : "s"}` : ""}
                      {who === "member" && " · using membership"}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={() => setOpen(false)} type="button">Cancel</button>
                      <button className="btn btn--primary" onClick={submit} type="button" disabled={submitting || !pickedOffer}>
                        {submitting ? "Saving…" : "Create booking"}
                      </button>
                    </div>
                  </div>
                )}

                {!!error && <div style={{ color: "#b00020", marginTop: 8 }}>{error}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: "#fff",
  width: "min(980px, 96vw)",
  maxHeight: "90vh",
  overflow: "auto",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};
