// app/memberships/RestoreMembershipButton.tsx
"use client";

type Props = {
  // `enabled` kept for compatibility, but activation is driven by end date.
  enabled: boolean;
  user: {
    _id: string;
    userId?: string;
    name?: string;
    email?: string;
    phone?: string;
    memberId?: string; // used to prefill on restore
  };
  // Fields needed to decide when restore is allowed:
  createdAt: string | Date;   // start date of the membership
  durationMonths: number;     // 1 | 3 | 6
  // Optional: override "now" for testing
  now?: string | Date;
};

function addMonths(d: Date, months: number) {
  const t = new Date(d);
  t.setMonth(t.getMonth() + months);
  return t;
}

function fmtDMY(d: Date) {
  // e.g., 23-10-2025 (IST)
  return d
    .toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })
    .replace(/\//g, "-");
}

export default function RestoreMembershipButton({
  user,
  createdAt,
  durationMonths,
  now,
}: Props) {
  const start = new Date(createdAt);
  const end = addMonths(start, Number(durationMonths || 0));
  const nowDate = now ? new Date(now) : new Date();

  const isActive = nowDate >= end;

  function openRestore() {
    if (!isActive) return;
    const evt = new CustomEvent("open-add-membership", {
      detail: {
        user,
        mode: "restore" as const,
        // pass memberId explicitly so the modal can prefill it and skip Aadhaar
        memberId: user.memberId || "",
      },
    });
    window.dispatchEvent(evt);
  }

  const title = isActive
    ? "Restore membership (renewal)"
    : `Available after end date (${fmtDMY(end)})`;

  return (
    <button
      type="button"
      className="btn"
      onClick={openRestore}
      disabled={!isActive}
      style={{
        background: isActive ? "var(--accent)" : "#fff",
        border: isActive ? "1px solid var(--accent)" : "1px solid rgba(17,17,17,0.12)",
        color: isActive ? "#fff" : "inherit",
        padding: "4px 10px",
        minHeight: 0,
        opacity: isActive ? 1 : 0.7,
        cursor: isActive ? "pointer" : "not-allowed",
      }}
      title={title}
      aria-label="Restore membership"
    >
      Restore
    </button>
  );
}
