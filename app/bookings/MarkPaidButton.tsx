// app/bookings/MarkPaidButton.tsx
"use client";

import { useState } from "react";

export default function MarkPaidButton({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    const ok = window.confirm("Mark this booking as PAID?");
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/mark-paid`, { method: "PATCH" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Failed to mark paid");
        setLoading(false);
        return;
      }
      window.location.reload();
    } catch {
      alert("Failed to mark paid");
      setLoading(false);
    }
  }

  return (
    <button
      className="btn btn--primary"
      onClick={onClick}
      disabled={loading}
      title="Set this booking as paid"
    >
      {loading ? "Marking…" : "Mark Paid"}
    </button>
  );
}
