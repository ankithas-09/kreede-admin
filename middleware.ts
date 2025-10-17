// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS: string[] = [
  "/signin",
  "/signup",
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
  "/api/auth/me",
  "/_next",
  "/favicon.ico",
  "/",
];

// ✅ Properly typed helper function
async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret); // throws if invalid or expired
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("auth")?.value;
  const valid = await isValidToken(token);

  // If already signed in, keep them away from auth pages
  if ((pathname === "/signin" || pathname === "/signup") && valid) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // ✅ Protect all private routes
  const protectedRoots: string[] = [
    "/dashboard",
    "/users",
    "/memberships",
    "/bookings",
    "/events",
    "/api/users",
    "/api/memberships",
    "/api/bookings",
    "/api/events",
  ];
  const needsAuth = protectedRoots.some((p) => pathname.startsWith(p));

  if (needsAuth && !valid) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
