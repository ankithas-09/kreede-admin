// app/event-registrations/ClearEventButton.tsx
"use client";

import { useState } from "react";

export default function ClearEventButton({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    const ok = window.confirm("Remove ALL registrations for this event?");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/registrations/clear?eventId=${encodeURIComponent(eventId)}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error || "Failed to clear registrations");
        setLoading(false);
        return;
      }
      // Success -> refresh
      window.location.reload();
    } catch {
      alert("Failed to clear registrations");
      setLoading(false);
    }
  }

  return (
    <button
      className="btn"
      onClick={onClick}
      disabled={loading}
      style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
      title="Remove all registrations for this event"
    >
      {loading ? "Clearing…" : "Clear"}
    </button>
  );
}
