// app/memberships/ClearAllMembershipsButton.tsx
"use client";

import { useState } from "react";

export default function ClearAllMembershipsButton() {
  const [loading, setLoading] = useState(false);

  async function onClear() {
    const ok = confirm(
      "This will PERMANENTLY delete ALL memberships.\n\nAre you sure you want to continue?"
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/memberships", { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Failed to clear memberships");
        setLoading(false);
        return;
      }
      // reload to reflect empty table
      window.location.reload();
    } catch {
      alert("Failed to clear memberships");
      setLoading(false);
    }
  }

  return (
    <button
      className="btn"
      onClick={onClear}
      disabled={loading}
      style={{ background: "#fff", border: "1px solid rgba(17,17,17,0.12)" }}
      title="Delete all memberships"
      aria-label="Delete all memberships"
    >
      {loading ? "Clearing…" : "Clear All"}
    </button>
  );
}
