// app/users/EditUserButton.tsx
"use client";

import { useMemo, useState } from "react";

type UserForEdit = {
  _id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  dob?: string | null; // ISO YYYY-MM-DD or empty
};

function isoDateOnly(v?: string | null) {
  if (!v) return "";
  // Accept either YYYY-MM-DD or a full ISO string
  const asDate = new Date(v);
  if (Number.isNaN(asDate.getTime())) return "";
  return asDate.toISOString().slice(0, 10);
}

export default function EditUserButton({ user }: { user: UserForEdit }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local form state (prefill)
  const [userId, setUserId] = useState(user.userId);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [dob, setDob] = useState(isoDateOnly(user.dob ?? ""));

  const title = useMemo(() => `Edit: ${user.name || user.userId}`, [user.name, user.userId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user._id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          dob: dob || undefined, // optional
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Failed to update user");
        setSaving(false);
        return;
      }

      setOpen(false);
      // simple: refresh page to reflect updates
      window.location.reload();
    } catch {
      setError("Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} aria-label={`Edit ${user.name || user.userId}`}>
        Edit
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="modal"
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(17,17,17,0.35)",
            zIndex: 50,
            padding: 12,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 520, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card__header">
              <h3 className="card__title">{title}</h3>
              <p className="card__subtitle">Update user details</p>
            </div>
            <div className="card__body">
              <form className="form" onSubmit={submit}>
                {error && (
                  <div
                    style={{
                      background: "#ffe6e6",
                      color: "#b00020",
                      padding: "8px 12px",
                      borderRadius: 6,
                      marginBottom: 12,
                      fontSize: "0.9rem",
                    }}
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label className="label">Username *</label>
                  <input
                    className="input"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    required
                    placeholder="e.g. ankitha123"
                  />
                </div>
                <div>
                  <label className="label">Name *</label>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input
                    type="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="name@email.com"
                  />
                </div>
                <div>
                  <label className="label">Phone *</label>
                  <input
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <label className="label">Date of Birth (optional)</label>
                  <input
                    type="date"
                    className="input"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </div>

                <div
                  className="actions"
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 12,
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setOpen(false)}
                    style={{
                      background: "#fff",
                      border: "1px solid rgba(17,17,17,0.12)",
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
