// app/registrations/RefundButton.tsx
"use client";

import { useState } from "react";

export default function RefundButton({ registrationId }: { registrationId: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    const ok = window.confirm("Refund this registration and remove it?");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/registrations/${registrationId}/refund`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Refund failed");
        setLoading(false);
        return;
      }
      // success → reload to reflect removal
      window.location.reload();
    } catch {
      alert("Refund failed");
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
      aria-label="Refund registration"
      title="Refund registration"
    >
      {loading ? "Refunding…" : "Refund"}
    </button>
  );
}
