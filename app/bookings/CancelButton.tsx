// app/bookings/CancelButton.tsx
"use client";

import { useState } from "react";

export default function CancelButton({
  bookingId,
  slotIndex,
  courtId,
  start,
  end,
  label = "Cancel",
}: {
  bookingId: string;
  slotIndex: number;
  courtId?: number;
  start: string;
  end: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    const ok = window.confirm("Cancel this slot?");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/slot`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotIndex, courtId, start, end }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error || "Cancellation failed");
        setLoading(false);
        return;
      }
      window.location.reload();
    } catch {
      alert("Cancellation failed");
      setLoading(false);
    }
  }

  return (
    <button
      className="btn"
      onClick={onClick}
      disabled={loading}
      style={{
        background: "#fff",
        border: "1px solid rgba(176, 0, 32, 0.35)",
        color: "#b00020",
        minWidth: 96,
      }}
      aria-label="Cancel this slot"
      title="Cancel this slot"
    >
      {loading ? "Cancelling…" : label}
    </button>
  );
}
