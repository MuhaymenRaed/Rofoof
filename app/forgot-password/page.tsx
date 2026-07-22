import { Suspense } from "react";
import { connection } from "next/server";
import { ForgotPasswordForm } from "./forgot-password-form";

// Talks to Supabase Auth in the browser only. `connection()` keeps it out of
// static prerendering (so it never needs Supabase credentials at build time)
// but lives INSIDE Suspense so the static shell still streams immediately
// under Cache Components.
async function DeferredForm() {
  await connection();
  return <ForgotPasswordForm />;
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <DeferredForm />
    </Suspense>
  );
}
