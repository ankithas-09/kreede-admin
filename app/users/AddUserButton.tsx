"use client";

import { useState } from "react";

export default function AddUserButton() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name,
          email: email || undefined, // optional
          phone,
          dob: dob || undefined,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Failed to add user");
        setSaving(false);
        return;
      }

      // ✅ success
      setOpen(false);
      setUserId("");
      setName("");
      setEmail("");
      setPhone("");
      setDob("");
      window.location.reload();
    } catch {
      setError("Failed to add user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn btn--primary" onClick={() => setOpen(true)}>
        + Add User
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
              <h3 className="card__title">Add User</h3>
              <p className="card__subtitle">Create a new user record</p>
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
                  <label className="label">Email (optional)</label>
                  <input
                    type="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save User"}
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
