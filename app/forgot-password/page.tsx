import { connection } from "next/server";
import { ForgotPasswordForm } from "./forgot-password-form";

// Talks to Supabase Auth in the browser only — `connection()` excludes it
// from static prerendering so it never needs Supabase credentials at build time.
export default async function ForgotPasswordPage() {
  await connection();
  return <ForgotPasswordForm />;
}
