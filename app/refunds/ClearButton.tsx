// app/refunds/ClearButton.tsx
"use client";

import { useState } from "react";

type ClearKind = "court" | "event" | "all";

export default function ClearButton({
  kind,
  label,
  title,
}: {
  kind: ClearKind;
  label?: string;
  title?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    const msg =
      kind === "court"
        ? "This will permanently delete ALL court refund rows. Continue?"
        : kind === "event"
        ? "This will permanently delete ALL event refund rows. Continue?"
        : "This will permanently delete ALL refund rows (court + event). Continue?";
    const ok = window.confirm(msg);
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/refunds/clear?type=${encodeURIComponent(kind)}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((j && j.error) || "Failed to clear");
        setLoading(false);
        return;
      }
      // Refresh the page to reflect changes
      window.location.reload();
    } catch {
      alert("Failed to clear");
      setLoading(false);
    }
  }

  return (
    <button
      className="btn"
      onClick={onClick}
      disabled={loading}
      title={title}
      style={{ background: "#fff", border: "1px solid rgba(176,0,32,0.35)", color: "#b00020" }}
    >
      {loading ? "Clearing…" : (label || "Clear")}
    </button>
  );
}
