"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jwt from "jsonwebtoken";

type JwtPayload = { name?: string };

export default function Dashboard() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const value = document.cookie.match(/(?:^|; )auth=([^;]+)/)?.[1];
    if (!value) return;
    try {
      const payload = jwt.decode(value) as JwtPayload | null;
      if (payload?.name) setAdminName(payload.name);
    } catch {}
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function logout() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/signin");
  }

  return (
    <div className="dash-wrap">
      {/* Top bar */}
      <header className="dash-topbar">
        <div className="dash-title">Dashboard</div>
        <div className="dash-actions">
          <button
            className="btn btn--primary"
            onClick={() => router.push("/events")}
            aria-label="Update events"
          >
            Update Events
          </button>

          <div className="profile" ref={menuRef}>
            <button
              className="profile-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="profile-avatar" aria-hidden />
              <span className="profile-name">{adminName}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>

            {menuOpen && (
              <div className="profile-menu" role="menu">
                <a className="profile-item" href="/profile" role="menuitem">
                  Profile
                </a>
                <button
                  className="profile-item danger"
                  onClick={logout}
                  role="menuitem"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable cards container */}
      <main
        className="dash-main"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          maxHeight: "calc(100vh - 90px)",
          overflowY: "auto",
          paddingRight: "6px",
        }}
      >
        <a className="dash-card" href="/users">
          <div className="dash-card-title">Users</div>
          <p className="dash-card-sub">Manage admin & player accounts</p>
        </a>

        <a className="dash-card" href="/memberships">
          <div className="dash-card-title">Memberships</div>
          <p className="dash-card-sub">Plans, billing cycles, perks</p>
        </a>

        <a className="dash-card" href="/bookings">
          <div className="dash-card-title">Court Bookings</div>
          <p className="dash-card-sub">Schedule, availability, payments</p>
        </a>

        <a className="dash-card" href="/event-registrations">
          <div className="dash-card-title">Event Registrations</div>
          <p className="dash-card-sub">View & manage registrations</p>
        </a>

        <a className="dash-card" href="/refunds">
          <div className="dash-card-title">Refunds</div>
          <p className="dash-card-sub">Court & event refunds</p>
        </a>

        {/* ✅ New Offers card */}
        <a className="dash-card" href="/offers">
          <div className="dash-card-title">Offers</div>
          <p className="dash-card-sub">Create and manage promo offers</p>
        </a>
      </main>
    </div>
  );
}
