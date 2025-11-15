// app/bookings/AddBookingButton.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type UserLite = { _id: string; userId?: string; name?: string; email?: string; phone?: string };
type Availability = Record<number, { start: string; end: string }[]>;
type Slot = { courtId: number; start: string; end: string };
type Who = "member" | "user" | "guest";
type PricingMode = "court" | "individual" | "individual2";

type AdminBookingBody = {
  type: Who;
  date: string;
  slots: Slot[];
  markPaid: boolean;
  paymentRef?: string;
  pricingMode?: PricingMode;

  userEmail?: string;
  userName?: string;
  userId?: string; // username
  guestName?: string;
  guestPhone?: string;
};

const COURTS = [1, 2, 3];
const SLOT_START_HOUR = 6;   // 6:00
const SLOT_END_HOUR = 23;    // 23:00 (11pm)

/** Parse "YYYY-MM-DD" as UTC midnight, return UTC day (0=Sun..6=Sat) */
function getUTCDayFromYMD(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  if (!y || !m || !d) return NaN;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** Weekend price (Sat/Sun) ₹700, Weekday ₹500 */
function pricePerSlotCourt(dateYMD: string | ""): number {
  if (!dateYMD) return 500; // default fallback
  const dow = getUTCDayFromYMD(dateYMD);
  if (Number.isNaN(dow)) return 500;
  return dow === 0 || dow === 6 ? 700 : 500;
}
function dayLabel(dateYMD: string | ""): string | null {
  if (!dateYMD) return null;
  const dow = getUTCDayFromYMD(dateYMD);
  if (Number.isNaN(dow)) return null;
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dow] || null;
}

function hhmm(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}
function label12h(h: number) {
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:00 ${ampm}`;
}

export default function AddBookingButton() {
  const [open, setOpen] = useState(false);

  // who
  const [who, setWho] = useState<Who>("member");

  // pricing mode
  const [pricingMode, setPricingMode] = useState<PricingMode>("court");

  // date
  const [date, setDate] = useState<string>("");

  // user search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserLite | null>(null);

  // guest fields
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // slot selection [{courtId, start, end}]
  const [selected, setSelected] = useState<Slot[]>([]);

  // availability
  const [availability, setAvailability] = useState<Availability>({});
  const [loadingAvail, setLoadingAvail] = useState(false);

  // submit state
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ------------------------ Search: members vs users ------------------------ */
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) return;
      if (!query.trim()) { setResults([]); return; }
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
            ? list.map((u: unknown): UserLite => {
                const r = (u ?? {}) as Record<string, unknown>;
                const idSeed =
                  r._id ??
                  r.userId ??
                  r.email ??
                  Math.random().toString(36).slice(2);
                return {
                  _id: String(idSeed),
                  userId: typeof r.userId === "string" ? r.userId : undefined,
                  name: typeof r.name === "string" ? r.name : undefined,
                  email: typeof r.email === "string" ? r.email : undefined,
                  phone: typeof r.phone === "string" ? r.phone : undefined,
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
  }, [query, open, who]);

  /* ------------------------ Availability for the date ----------------------- */
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
      } catch {
        if (!abort) setAvailability({});
      } finally {
        if (!abort) setLoadingAvail(false);
      }
    }
    run();
    return () => { abort = true; };
  }, [date, open]);

  // Build a quick lookup for booked slots: key = `${courtId}_${start}_${end}`
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

  // past-slot logic disabled (as earlier)
  function isPastSlot(_hour: number) {
    return false;
  }

  function toggle(courtId: number, hour: number) {
    const start = hhmm(hour);
    const end = hhmm(hour + 1);
    const key = `${courtId}_${start}_${end}`;

    if (bookedSet.has(key)) return;

    const exists = selected.find(s => s.courtId === courtId && s.start === start && s.end === end);
    if (exists) {
      setSelected(s => s.filter(x => !(x.courtId === courtId && x.start === start && x.end === end)));
    } else {
      setSelected(s => [...s, { courtId, start, end }]);
    }
  }

  const totalSlots = selected.length;

  // Compute day + weekend once and reuse
  const day = dayLabel(date);
  const weekend = (() => {
    if (!date) return false;
    const dow = getUTCDayFromYMD(date);
    return dow === 0 || dow === 6; // Sunday or Saturday
  })();

  // UPDATED: pricing depends on mode + weekend
  const effectivePerSlot =
    who === "member"
      ? 0
      : pricingMode === "individual"
        ? (weekend ? 200 : 150)          // 200 on Sat/Sun, 150 on weekdays
        : pricingMode === "individual2"
          ? (weekend ? 400 : 300)        // 400 on Sat/Sun, 300 on weekdays
          : pricePerSlotCourt(date);     // existing court pricing

  const totalAmount = who === "member" ? 0 : totalSlots * effectivePerSlot;

  function resetAll() {
    setWho("member");
    setPricingMode("court");
    setDate("");
    setQuery("");
    setResults([]);
    setSelectedUser(null);
    setGuestName("");
    setGuestPhone("");
    setSelected([]);
    setErr(null);
    setSaving(false);
    setAvailability({});
  }

  async function createBooking(markPaid: boolean) {
    try {
      setSaving(true);
      setErr(null);

      if (!date) throw new Error("Please select a date.");
      if (selected.length === 0) throw new Error("Please select at least one slot.");

      if (who === "member" || who === "user") {
        if (!selectedUser) throw new Error("Please search and select a user.");
        if (!selectedUser.email) throw new Error("Selected user has no email.");
      } else {
        if (!guestName.trim() || !guestPhone.trim()) throw new Error("Guest name and phone are required.");
      }

      for (const s of selected) {
        const key = `${s.courtId}_${s.start}_${s.end}`;
        if (bookedSet.has(key)) {
          throw new Error("Some selected slots are no longer available. Please refresh availability and try again.");
        }
      }

      const body: AdminBookingBody = {
        type: who,
        date,
        slots: selected,
        markPaid,
        pricingMode,
      };

      if (who === "member") {
        body.paymentRef = "MEMBERSHIP";
      } else {
        body.paymentRef = markPaid ? "PAID.CASH" : "UNPAID.CASH";
      }

      if (who === "member" || who === "user") {
        body.userEmail = (selectedUser?.email || "").toLowerCase();
        body.userName = selectedUser?.name || "";
        body.userId = selectedUser?.userId || ""; // username
      } else {
        body.guestName = guestName.trim();
        body.guestPhone = guestPhone.trim();
      }

      const res = await fetch("/api/bookings/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (j as { error?: string })?.error || "Failed to create booking";
        throw new Error(msg);
      }

      setOpen(false);
      resetAll();
      window.location.reload();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create booking";
      setErr(message);
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn btn--primary" onClick={() => setOpen(true)}>
        + Add Booking
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { setOpen(false); resetAll(); }}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            background: "rgba(17,17,17,0.35)",
            zIndex: 60,
            padding: "20px 12px",
            overflowY: "auto",
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 980,
              maxHeight: "90vh",
              overflowY: "auto",
              overflowX: "hidden",
              borderRadius: 12,
            }}
          >
            <div className="card__header" style={{ position: "sticky", top: 0, background: "var(--card)", zIndex: 1 }}>
              <h3 className="card__title">Add Booking</h3>
              <p className="card__subtitle">
                Pick who, date and one-hour slots between 6:00 AM and 11:00 PM.
                {loadingAvail && <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>Checking availability…</span>}
              </p>
            </div>

            <div className="card__body">
              {err && (
                <div style={{ background: "#ffe6e6", color: "#b00020", padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>
                  {err}
                </div>
              )}

              {/* Who + Date + Pricing Mode */}
              <div className="form" style={{ marginBottom: 12 }}>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <div>
                    <label className="label">Who is this for?</label>
                    <select
                      className="input"
                      value={who}
                      onChange={(e) => { setWho(e.target.value as Who); setSelectedUser(null); setQuery(""); }}
                    >
                      <option value="member">Member</option>
                      <option value="user">User</option>
                      <option value="guest">Guest</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Date</label>
                    <input
                      className="input"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                    {date && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                        {day ? `${day}` : "Selected date"}
                        {pricingMode === "court" && (
                          <>
                            {" "}• <b>₹{pricePerSlotCourt(date)}/slot</b>
                            {weekend && <span> (weekend pricing)</span>}
                          </>
                        )}
                        {pricingMode === "individual" && (
                          <> • <b>₹{weekend ? 200 : 150}/slot</b></>
                        )}
                        {pricingMode === "individual2" && (
                          <> • <b>₹{weekend ? 400 : 300}/slot</b></>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="label">Pricing</label>
                    <select
                      className="input"
                      value={pricingMode}
                      onChange={(e) => setPricingMode(e.target.value as PricingMode)}
                    >
                      <option value="court">Court</option>
                      <option value="individual">
                        Individual (₹150 weekday / ₹200 weekend)
                      </option>
                      <option value="individual2">
                        Individuals (2) (₹300 weekday / ₹400 weekend)
                      </option>
                    </select>
                  </div>
                </div>

                {/* Member/User → search */}
                {(who === "member" || who === "user") && (
                  <div style={{ marginTop: 10 }}>
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
                )}

                {/* Guest fields */}
                {who === "guest" && (
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginTop: 10 }}>
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

              {/* Slot picker */}
              <div style={{ display: "grid", gap: 12, maxHeight: "48vh", overflowY: "auto", paddingRight: 4 }}>
                {COURTS.map((c) => (
                  <div key={c} style={{ border: "1px solid rgba(17,17,17,0.1)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                    <div style={{ padding: "10px 12px", fontWeight: 800, background: "#fff7f2", borderBottom: "1px solid rgba(17,17,17,0.08)" }}>
                      Court {c}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 8, padding: 12 }}>
                      {Array.from({ length: SLOT_END_HOUR - SLOT_START_HOUR }, (_, i) => SLOT_START_HOUR + i).map((h) => {
                        const start = hhmm(h);
                        const end = hhmm(h + 1);
                        const key = `${c}_${start}_${end}`;
                        const isBooked = bookedSet.has(key);
                        const past = isPastSlot(h);
                        const active = selected.some(s => s.courtId === c && s.start === start && s.end === end);

                        const disabled = isBooked;

                        let bg = "#fff";
                        let border = "1px solid rgba(17,17,17,0.12)";
                        let color = "inherit";
                        if (isBooked) {
                          bg = "#22c55e"; // green
                          border = "1px solid #16a34a";
                          color = "#fff";
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
                            {past ? "" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary + Actions */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                <div className="badge">
                  {totalSlots} slot{totalSlots === 1 ? "" : "s"}
                  {who !== "member" && (
                    <>
                      {" "}• ₹{effectivePerSlot}/slot • Total: <b>₹{totalAmount}</b>
                      {pricingMode === "court" && weekend && " (weekend pricing)"}
                    </>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => { setOpen(false); resetAll(); }}
                    style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
                  >
                    Cancel
                  </button>

                  {who === "member" ? (
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={() => createBooking(true)}
                      disabled={saving}
                    >
                      {saving ? "Booking…" : "Book for Member"}
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => createBooking(false)}
                        disabled={saving}
                        style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
                        title="Create booking as Pending (collect payment later)"
                      >
                        {saving ? "Saving…" : "Create (Pending)"}
                      </button>
                      <button
                        className="btn btn--primary"
                        type="button"
                        onClick={() => createBooking(true)}
                        disabled={saving}
                        title="Create booking and mark as Paid"
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
