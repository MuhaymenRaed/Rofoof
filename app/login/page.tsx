import { Suspense } from "react";
import { connection } from "next/server";
import { LoginForm } from "./login-form";

// This page only makes sense per-request (it reads ?next=/?error= and talks
// to Supabase Auth in the browser) — `connection()` excludes it from static
// prerendering so it never needs Supabase credentials at build time.
export default async function LoginPage() {
  await connection();
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
