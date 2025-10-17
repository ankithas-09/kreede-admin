// app/event-registrations/CancelEventRegButton.tsx
"use client";

import { useState } from "react";

export default function CancelEventRegButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  async function onCancel() {
    const ok = window.confirm("Cancel this registration? It will be removed and logged to event refunds.");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/registrations/${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error || "Failed to cancel registration");
        setLoading(false);
        return;
      }
      // Refresh list
      window.location.reload();
    } catch {
      alert("Failed to cancel registration");
      setLoading(false);
    }
  }

  return (
    <button
      className="btn"
      onClick={onCancel}
      disabled={loading}
      style={{ background: "#fff", border: "1px solid rgba(176,0,32,0.35)", color: "#b00020" }}
    >
      {loading ? "Cancelling…" : "Cancel"}
    </button>
  );
}
