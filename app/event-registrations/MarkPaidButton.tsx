// app/event-registrations/MarkPaidButton.tsx
"use client";

import { useState } from "react";

type Kind = "registration" | "booking";

export default function MarkPaidButton({
  id,
  kind = "registration",
}: {
  id: string;
  kind?: Kind;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    const ok = window.confirm("Mark this as PAID?");
    if (!ok) return;

    setLoading(true);
    try {
      const url =
        kind === "registration"
          ? `/api/registrations/${id}/mark-paid`
          : `/api/bookings/${id}/mark-paid`;
      const res = await fetch(url, { method: "PATCH" });
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
    <button className="btn btn--primary" onClick={onClick} disabled={loading}>
      {loading ? "Marking…" : "Mark Paid"}
    </button>
  );
}
