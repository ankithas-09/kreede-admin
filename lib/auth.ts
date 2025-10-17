// lib/auth.ts
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_DAYS = Number(process.env.JWT_EXPIRES_DAYS ?? 180);

export function signJwt(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${JWT_EXPIRES_DAYS}d` });
}

export function verifyJwt<T = unknown>(token: string): T | null {
  try {
    return jwt.verify(token, JWT_SECRET) as T;
  } catch {
    return null;
  }
}

export function setAuthCookie(token: string) {
  const maxAge = JWT_EXPIRES_DAYS * 24 * 60 * 60; // seconds
  cookies().set("auth", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export function clearAuthCookie() {
  cookies().set("auth", "", { path: "/", httpOnly: true, maxAge: 0 });
}

export function getUserFromCookie<T = unknown>(): T | null {
  const cookie = cookies().get("auth");
  if (!cookie?.value) return null;
  return verifyJwt<T>(cookie.value);
}
