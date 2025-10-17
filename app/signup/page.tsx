// app/signup/page.tsx  (Server Component)
import React, { Suspense } from "react";
import SignupClient from "./SignupClient";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupClient />
    </Suspense>
  );
}
