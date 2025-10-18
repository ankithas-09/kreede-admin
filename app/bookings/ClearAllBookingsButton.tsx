// app/bookings/ClearAllBookingsButton.tsx
"use client";

import { useState } from "react";

export default function ClearAllBookingsButton({ q, date }: { q?: string; date?: string }) {
  const [loading, setLoading] = useState(false);
  const hasFilter = Boolean((q || "").trim() || (date || "").trim());

  async function onClick() {
    const scopeText = hasFilter
      ? `ALL bookings that match the current filters${q ? ` (q="${q}")` : ""}${date ? ` (date=${date})` : ""}`
      : "ALL bookings (no filters)";

    const ok = window.confirm(
      `This will permanently delete ${scopeText} from the database.\n\n` +
      `• No membership credits will be restored.\n` +
      `• This action cannot be undone.\n\n` +
      `Proceed?`
    );
    if (!ok) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (date) params.set("date", date);

      const res = await fetch(`/api/bookings/clear${params.toString() ? `?${params.toString()}` : ""}`, {
        method: "POST",
      });

      const j: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (j as { error?: string })?.error || "Failed to clear bookings";
        alert(msg);
        setLoading(false);
        return;
      }

      const info = j as {
        ok?: boolean;
        deletedBookings?: number;
        deletedGuestBookings?: number;
      };

      alert(
        `Cleared successfully.\n\n` +
        `• Standard bookings deleted: ${info.deletedBookings ?? 0}\n` +
        `• Guest bookings deleted: ${info.deletedGuestBookings ?? 0}`
      );
      window.location.reload();
    } catch {
      alert("Failed to clear bookings");
      setLoading(false);
    }
  }

  return (
    <button
      className="btn"
      onClick={onClick}
      disabled={loading}
      style={{ background: "#fff", border: "1px solid rgba(176,0,32,0.35)", color: "#b00020" }}
      title={hasFilter ? "Delete all bookings matching filters" : "Delete all bookings"}
      aria-label="Clear bookings"
    >
      {loading ? "Clearing…" : (hasFilter ? "Clear Filtered" : "Clear All")}
    </button>
  );
}
