// app/event-registrations/RefundButton.tsx
"use client";

import { useState } from "react";

export default function RefundButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    const ok = window.confirm("Mark this registration as REFUNDED?");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/registrations/${id}/refund`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Refund failed");
        setLoading(false);
        return;
      }
      window.location.reload();
    } catch {
      alert("Refund failed");
      setLoading(false);
    }
  }

  return (
    <button className="btn" onClick={onClick} disabled={loading}
      style={{ background:"#fff", border:"1px solid rgba(17,17,17,0.12)" }}>
      {loading ? "Refunding…" : "Refund"}
    </button>
  );
}
