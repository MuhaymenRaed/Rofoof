import { Suspense } from "react";
import { connection } from "next/server";
import { ResetPasswordForm } from "./reset-password-form";

// Talks to Supabase Auth in the browser and reads recovery-link query params
// — `connection()` excludes it from static prerendering so it never needs
// Supabase credentials at build time.
export default async function ResetPasswordPage() {
  await connection();
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
