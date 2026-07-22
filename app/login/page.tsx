import { Suspense } from "react";
import { connection } from "next/server";
import { LoginForm } from "./login-form";

// This page only makes sense per-request (it reads ?next=/?error= and talks to
// Supabase Auth in the browser). `connection()` keeps it out of static
// prerendering, but lives INSIDE Suspense so the static shell still streams
// immediately under Cache Components.
async function DeferredForm() {
  await connection();
  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <DeferredForm />
    </Suspense>
  );
}
