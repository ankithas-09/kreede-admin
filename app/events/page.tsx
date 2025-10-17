// app/events/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type EventItem = {
  _id: string;
  title: string;
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD
  startTime?: string;     // HH:mm
  endTime?: string;       // HH:mm
  entryFee?: number;
  link: string;
  description?: string;
  tags?: string[];
  createdAt?: string;
};

function fmtDate(d?: string) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d; // keep raw if parsing fails
  // Show as DD Mon YYYY (e.g., 10 Oct 2025)
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function EventsPage() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState("");
  const [filterStart, setFilterStart] = useState("");

  // Form fields
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [entryFee, setEntryFee] = useState(""); // string input → number on submit
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState(""); // comma-separated

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filterStart) params.set("start", filterStart);
    const res = await fetch(`/api/events${params.toString() ? `?${params.toString()}` : ""}`);
    const json = await res.json();
    setItems(json.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // initial load

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        startDate,
        endDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        entryFee: entryFee !== "" ? Number(entryFee) : undefined,
        link,
        description: description || undefined,
        tags, // server splits comma-separated string
      }),
    });
    setBusy(false);
    if (res.ok) {
      // Reset form and refresh list
      setTitle("");
      setStartDate("");
      setEndDate("");
      setStartTime("");
      setEndTime("");
      setEntryFee("");
      setLink("");
      setDescription("");
      setTags("");
      await load();
    } else {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Failed to create event");
    }
  }

  async function onDelete(id: string, titleForConfirm: string) {
    const ok = window.confirm(`Delete event “${titleForConfirm}”? This cannot be undone.`);
    if (!ok) return;

    setDeletingId(id);
    // Optimistic UI: remove immediately
    setItems((prev) => prev.filter((i) => i._id !== id));
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        // Rollback if failed
        await load();
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Failed to delete event");
      }
    } catch {
      await load();
      alert("Failed to delete event");
    } finally {
      setDeletingId(null);
    }
  }

  const rows = useMemo(() => {
    return items.map((i) => ({
      ...i,
      dateRange:
        i.startDate && i.endDate
          ? `${fmtDate(i.startDate)} → ${fmtDate(i.endDate)}`
          : i.startDate
          ? fmtDate(i.startDate)
          : "—",
      time:
        i.startTime || i.endTime
          ? `${i.startTime || ""}${i.endTime ? ` – ${i.endTime}` : ""}`
          : "—",
      linkLabel: i.link?.replace(/^https?:\/\//, "").slice(0, 60),
    }));
  }, [items]);

  return (
    <div className="card" style={{ maxWidth: "100%" }}>
      {/* Header: title + back */}
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
            Events & Announcements
          </h1>
          <p className="card__subtitle">Add and manage event links with schedules and details.</p>
        </div>
        <a
          href="/dashboard"
          className="btn"
          style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
        >
          ← Back to Dashboard
        </a>
      </div>

      <div className="card__body">
        {/* Create form */}
        <form className="form" onSubmit={submit} style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label className="label" htmlFor="title">
                Event name *
              </label>
              <input
                id="title"
                className="input"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="startDate">
                Start Date *
              </label>
              <input
                id="startDate"
                type="date"
                className="input"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="endDate">
                End Date *
              </label>
              <input
                id="endDate"
                type="date"
                className="input"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="start">
                Start time
              </label>
              <input
                id="start"
                type="time"
                className="input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="end">
                End time
              </label>
              <input
                id="end"
                type="time"
                className="input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="fee">
                Entry Fee (₹)
              </label>
              <input
                id="fee"
                type="number"
                className="input"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                placeholder="e.g., 500"
                min={0}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="label" htmlFor="link">
                Poster/Event Link *
              </label>
              <input
                id="link"
                type="url"
                className="input"
                required
                placeholder="https://..."
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <div>
              <label className="label" htmlFor="desc">
                Description
              </label>
              <textarea
                id="desc"
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="tags">
                Tags (comma separated)
              </label>
              <input
                id="tags"
                className="input"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tournament, juniors, doubles"
              />
            </div>
          </div>

          {err && (
            <div className="badge" role="alert" style={{ marginTop: 10 }}>
              {err}
            </div>
          )}

          <div className="actions" style={{ marginTop: 10 }}>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Saving..." : "Create Event"}
            </button>
          </div>
        </form>

        {/* Toolbar: search + start date only */}
        <form className="toolbar" onSubmit={applyFilters}>
          <input
            className="input"
            placeholder="Search by title / description…"
            aria-label="Search events"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 2, minWidth: 160 }}
          />
          <input
            className="input"
            type="date"
            aria-label="Filter by Start Date"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <button className="btn btn--primary" type="submit">
            Apply
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setQ("");
              setFilterStart("");
              load();
            }}
            style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
          >
            Reset
          </button>
        </form>

        {/* Events table */}
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Event</th>
                <th style={{ minWidth: 220 }}>Dates</th>
                <th style={{ minWidth: 130 }}>Time</th>
                <th style={{ minWidth: 140 }}>Entry Fee (₹)</th>
                <th style={{ minWidth: 260 }}>Link</th>
                <th style={{ minWidth: 140 }}>Actions</th>
                <th style={{ minWidth: 200 }}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 18 }}>
                    Loading…
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((i) => (
                  <tr key={i._id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{i.title}</div>
                      {i.description && (
                        <div style={{ color: "var(--muted)", fontSize: "var(--step--1)" }}>
                          {i.description}
                        </div>
                      )}
                    </td>
                    <td>{i.dateRange}</td>
                    <td>{i.time}</td>
                    <td>{i.entryFee !== undefined ? `₹${i.entryFee}` : "Free"}</td>
                    <td>
                      {i.link ? (
                        <a
                          href={i.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--accent)", fontWeight: 700 }}
                        >
                          {i.linkLabel || "Open"}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <button
                        className="btn"
                        onClick={() => onDelete(i._id, i.title)}
                        disabled={deletingId === i._id}
                        style={{
                          background: "#fff",
                          border: "1px solid rgba(176, 0, 32, 0.35)",
                          color: "#b00020",
                          minWidth: 96,
                        }}
                        aria-label={`Delete ${i.title}`}
                      >
                        {deletingId === i._id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                    <td>{i.tags && i.tags.length ? i.tags.join(", ") : "—"}</td>
                  </tr>
                ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 18 }}>
                    No events found.
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
