// app/offers/page.tsx
"use client";

import { useEffect, useState } from "react";

type OfferType = "flat" | "conditional";
type Rule = { label: string; price: number; criteria?: string };

type Offer = {
  _id?: string;
  title: string;
  description?: string;
  type: OfferType;
  dateFrom: string; // yyyy-mm-dd (for form) or ISO string from API
  dateTo: string;   // yyyy-mm-dd (for form) or ISO string from API
  timeFrom: string; // HH:mm
  timeTo: string;   // HH:mm
  flatPrice?: number;
  rules?: Rule[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function isoDateOnly(d?: string | Date) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = `${dt.getMonth() + 1}`.padStart(2, "0");
  const day = `${dt.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`; // for <input type="date" />
}

function formatDate(d?: string | Date) {
  if (!d) return "";
  const dt = new Date(d);
  const day = `${dt.getDate()}`.padStart(2, "0");
  const month = `${dt.getMonth() + 1}`.padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}-${month}-${year}`; // for display in cards
}

export default function OffersPage() {
  const [items, setItems] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [form, setForm] = useState<Offer>({
    title: "",
    description: "",
    type: "flat",
    dateFrom: isoDateOnly(new Date()),
    dateTo: isoDateOnly(new Date()),
    timeFrom: "06:00",
    timeTo: "10:00",
    flatPrice: 300,
    rules: [{ label: "", price: 0, criteria: "" }], // one blank row to start
    active: true,
  });

  async function load() {
    setLoading(true);
    const r = await fetch("/api/offers");
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) setError(j?.error || "Failed to load offers");
    else setItems(j.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function setField<K extends keyof Offer>(k: K, v: Offer[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      title: "",
      description: "",
      type: "flat",
      dateFrom: isoDateOnly(new Date()),
      dateTo: isoDateOnly(new Date()),
      timeFrom: "06:00",
      timeTo: "10:00",
      flatPrice: 300,
      rules: [{ label: "", price: 0, criteria: "" }],
      active: true,
    });
  }

  async function save() {
    setSaving(true);
    setError(null);

    const payload: any = {
      ...form,
      flatPrice: form.type === "flat" ? Number(form.flatPrice ?? 0) : undefined,
      rules:
        form.type === "conditional"
          ? (form.rules || [])
              .map((r) => ({
                label: (r.label || "").trim(),
                price: Number(r.price || 0),
                criteria: (r.criteria || "").trim() || undefined,
              }))
              // drop entirely empty rows
              .filter((r) => r.label !== "" || !!r.criteria)
          : undefined,
      // Dates as full-day ISO range
      dateFrom: new Date(form.dateFrom + "T00:00:00"),
      dateTo: new Date(form.dateTo + "T23:59:59"),
    };

    const url = editingId ? `/api/offers/${editingId}` : "/api/offers";
    const method = editingId ? "PUT" : "POST";

    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) setError(j?.error || "Failed to save offer");
    else {
      await load();
      resetForm();
    }
    setSaving(false);
  }

  function edit(it: Offer) {
    setEditingId(it._id!);
    setForm({
      title: it.title,
      description: it.description || "",
      type: it.type,
      dateFrom: isoDateOnly(it.dateFrom), // keep yyyy-mm-dd for input
      dateTo: isoDateOnly(it.dateTo),     // keep yyyy-mm-dd for input
      timeFrom: it.timeFrom,
      timeTo: it.timeTo,
      flatPrice: it.flatPrice,
      rules: (it.rules || []).length ? it.rules : [{ label: "", price: 0, criteria: "" }],
      active: it.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!confirm("Delete this offer?")) return;
    const r = await fetch(`/api/offers/${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) setError(j?.error || "Failed to delete");
    else setItems((arr) => arr.filter((x) => x._id !== id));
  }

  return (
    <div className="offers-wrap">
      <header className="offers-hero">
        <div className="offers-hero__badge">Admin · Offers</div>
        <h1>Create & Manage Offers</h1>
        <p>Time-bound deals with daily windows, flat or conditional pricing.</p>
      </header>

      {error && <div className="alert alert--danger">{error}</div>}

      {/* Form */}
      <section className="panel">
        <div className="panel__header">
          <div className="panel__title">{editingId ? "Edit Offer" : "New Offer"}</div>
          <div className="panel__actions">
            {editingId && (
              <button className="btn btn--ghost" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
            <button className="btn btn--primary" onClick={save} disabled={saving}>
              {editingId ? "Update Offer" : "Create Offer"}
            </button>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field__label">Title</span>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g., Morning Happy Hours"
            />
          </label>

          <label className="field">
            <span className="field__label">Type</span>
            <select
              className="input"
              value={form.type}
              onChange={(e) => setField("type", e.target.value as OfferType)}
            >
              <option value="flat">Flat</option>
              <option value="conditional">Conditional</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">From (date)</span>
            <input
              className="input"
              type="date"
              value={form.dateFrom}
              onChange={(e) => setField("dateFrom", e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">To (date)</span>
            <input
              className="input"
              type="date"
              value={form.dateTo}
              onChange={(e) => setField("dateTo", e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">Daily from (time)</span>
            <input
              className="input"
              type="time"
              value={form.timeFrom}
              onChange={(e) => setField("timeFrom", e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">Daily to (time)</span>
            <input
              className="input"
              type="time"
              value={form.timeTo}
              onChange={(e) => setField("timeTo", e.target.value)}
            />
          </label>

          <label className="field field--full">
            <span className="field__label">Description (optional)</span>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Short internal note for admins"
            />
          </label>

          {form.type === "flat" && (
            <label className="field">
              <span className="field__label">Flat price (₹)</span>
              <input
                className="input"
                type="number"
                min={0}
                value={form.flatPrice ?? 0}
                onChange={(e) => setField("flatPrice", Number(e.target.value))}
              />
            </label>
          )}

          {form.type === "conditional" && (
            <div className="field field--full">
              <div className="field__label">Conditional rules</div>

              {(form.rules || []).map((r, idx) => (
                <div key={idx} className="rule-row">
                  <input
                    className="input"
                    placeholder="Label (e.g., Student / One woman / Family pack)"
                    value={r.label}
                    onChange={(e) => {
                      const next = [...(form.rules || [])];
                      next[idx] = { ...next[idx], label: e.target.value };
                      setField("rules", next);
                    }}
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    placeholder="Price"
                    value={r.price}
                    onChange={(e) => {
                      const next = [...(form.rules || [])];
                      next[idx] = { ...next[idx], price: Number(e.target.value) };
                      setField("rules", next);
                    }}
                  />
                  <input
                    className="input"
                    placeholder="Criteria (optional, any text)"
                    value={r.criteria || ""}
                    onChange={(e) => {
                      const next = [...(form.rules || [])];
                      next[idx] = { ...next[idx], criteria: e.target.value };
                      setField("rules", next);
                    }}
                  />
                  <button
                    className="btn btn--ghost danger"
                    onClick={() => {
                      const next = [...(form.rules || [])];
                      next.splice(idx, 1);
                      setField("rules", next);
                    }}
                    aria-label="Remove rule"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                className="btn btn--secondary"
                onClick={() =>
                  setField("rules", [...(form.rules || []), { label: "", price: 0, criteria: "" }])
                }
              >
                + Add rule
              </button>
            </div>
          )}

          <label className="switch">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setField("active", e.target.checked)}
            />
            <span className="switch__label">Active</span>
          </label>
        </div>
      </section>

      {/* List */}
      <section className="panel">
        <div className="panel__header">
          <div className="panel__title">Existing Offers</div>
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="empty">No offers yet.</div>
        ) : (
          <div className="cards">
            {items.map((it) => (
              <article key={it._id} className="offer-card">
                <div className="offer-card__head">
                  <h3>{it.title}</h3>
                  <span className={`status ${it.active ? "status--on" : "status--off"}`}>
                    {it.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="offer-card__meta">
                  <span className="pill">{it.type === "flat" ? "Flat" : "Conditional"}</span>
                  <span className="pill">
                    {formatDate(it.dateFrom)} → {formatDate(it.dateTo)}
                  </span>
                  <span className="pill">
                    {it.timeFrom}–{it.timeTo}
                  </span>
                </div>

                <div className="offer-card__body">
                  {it.description && <p className="muted">{it.description}</p>}
                  {it.type === "flat" ? (
                    <div className="price">₹{it.flatPrice}</div>
                  ) : (
                    <ul className="rules">
                      {(it.rules || []).map((r, i) => (
                        <li key={i}>
                          <strong>{r.label || "Untitled rule"}</strong> — ₹{r.price}
                          {r.criteria ? <em> ({r.criteria})</em> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="offer-card__actions">
                  <button className="btn btn--secondary" onClick={() => edit(it)}>
                    Edit
                  </button>
                  <button className="btn btn--ghost danger" onClick={() => remove(it._id!)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
