import { Suspense } from "react";
import { connection } from "next/server";
import { ResetPasswordForm } from "./reset-password-form";

// Talks to Supabase Auth in the browser and reads recovery-link query params.
// `connection()` keeps it out of static prerendering (so it never needs
// Supabase credentials at build time) but lives INSIDE Suspense so the static
// shell still streams immediately under Cache Components.
async function DeferredForm() {
  await connection();
  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <DeferredForm />
    </Suspense>
  );
}
