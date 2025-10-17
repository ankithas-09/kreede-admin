// app/signup/SignupClient.tsx  (Client Component)
"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignupClient() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    setBusy(false);
    if (res.ok) router.push(next);
    else setErr((await res.json()).error || "Failed to sign up");
  }

  return (
    <div className="card">
      <div className="card__header">
        <div className="brand">
          <span className="brand__dot" />
          <span className="brand__name">KREEDE • Admin</span>
        </div>
        <h1 className="card__title">Create your account</h1>
        <p className="card__subtitle">Start managing your indoor pickleball club.</p>
      </div>

      <div className="card__body">
        <form className="form" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {err && <div className="badge" role="alert"> {err} </div>}

          <div className="actions">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create account"}
            </button>
            <div className="helper">
              Already have an account? <a href="/signin">Sign in</a>
            </div>
          </div>
        </form>

        <div className="footer-note">
          By continuing, you agree to our terms & privacy policy.
        </div>
      </div>
    </div>
  );
}
