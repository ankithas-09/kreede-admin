// app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";

export default function HomePage() {
  // Check if there's a valid auth token
  const token = cookies().get("auth")?.value;

  if (token) {
    try {
      // Optional: verify the token — if invalid, redirect to signup
      jwt.verify(token, process.env.JWT_SECRET!);
      redirect("/dashboard");
    } catch {
      redirect("/signup");
    }
  } else {
    redirect("/signup");
  }
}
