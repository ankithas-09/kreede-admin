import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

type TokenPayload = {
  name?: string;
  email?: string;
  [k: string]: unknown;
};

export default function ProfilePage() {
  const token = cookies().get("auth")?.value;
  let name = "Admin",
    email = "";
  if (token) {
    try {
      const payload = jwt.decode(token);
      if (payload && typeof payload === "object") {
        const p = payload as TokenPayload;
        name = (typeof p.name === "string" && p.name) || name;
        email = (typeof p.email === "string" && p.email) || "";
      }
    } catch {
      // ignore malformed token
    }
  }
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card__header">
        <h1 className="card__title">Profile</h1>
        <p className="card__subtitle">Manage your admin account.</p>
      </div>
      <div className="card__body">
        <div className="badge">Name: {name}</div>
        <p style={{ marginTop: 10 }}>
          Email: <strong>{email}</strong>
        </p>
      </div>
    </div>
  );
}
