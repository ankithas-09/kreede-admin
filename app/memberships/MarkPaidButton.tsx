// app/memberships/MarkPaidButton.tsx
"use client";

import { useState } from "react";

export default function MarkPaidButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!confirm("Mark this membership as PAID?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/memberships/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markPaid" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Failed to mark as paid");
        setLoading(false);
        return;
      }
      window.location.reload();
    } catch {
      alert("Failed to mark as paid");
      setLoading(false);
    }
  }

  return (
    <button className="btn" onClick={onClick} disabled={loading} style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}>
      {loading ? "Updating…" : "Mark payment received"}
    </button>
  );
}
