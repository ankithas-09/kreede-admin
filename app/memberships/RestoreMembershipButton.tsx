// app/memberships/RestoreMembershipButton.tsx
"use client";

type Props = {
  enabled: boolean;
  user: {
    _id: string;
    userId?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
};

export default function RestoreMembershipButton({ enabled, user }: Props) {
  function openRestore() {
    if (!enabled) return;
    // Broadcast an event that AddMembershipGlobalButton will listen to
    const evt = new CustomEvent("open-add-membership", { detail: { user } });
    window.dispatchEvent(evt);
  }

  return (
    <button
      type="button"
      className="btn"
      onClick={openRestore}
      disabled={!enabled}
      style={{
        background: enabled ? "var(--accent)" : "#fff",
        border: enabled ? "1px solid var(--accent)" : "1px solid rgba(17,17,17,0.12)",
        color: enabled ? "#fff" : "inherit",
        padding: "4px 10px",
        minHeight: 0,
      }}
      title={enabled ? "Restore membership (open add membership pre-filled)" : "Available after end date"}
      aria-label="Restore membership"
    >
      Restore
    </button>
  );
}
