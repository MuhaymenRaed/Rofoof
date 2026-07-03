"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";

const schema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).nullable().optional(),
  provinceCode: z.string().trim().max(30).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof schema>;

export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone || null,
      default_province_code: parsed.data.provinceCode || null,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
