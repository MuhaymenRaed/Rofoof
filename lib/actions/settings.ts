"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { TAGS } from "@/lib/data/tags";

const schema = z.object({
  ar: z.string().trim().max(200),
  en: z.string().trim().max(200),
  active: z.boolean(),
});

export type AnnouncementInput = z.infer<typeof schema>;

export async function updateAnnouncementAction(
  input: AnnouncementInput,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("settings").upsert({
    id: true,
    announcement_ar: parsed.data.ar,
    announcement_en: parsed.data.en,
    announcement_active: parsed.data.active,
  });
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.settings, "max");
  revalidatePath("/");
  return { ok: true };
}

/* ------------------------- Featured section title ----------------------- */

const featuredTitleSchema = z.object({
  ar: z.string().trim().min(1).max(60),
  en: z.string().trim().min(1).max(60),
});

export type FeaturedTitleInput = z.infer<typeof featuredTitleSchema>;

/** Rename the homepage "featured picks" showcase section (admin). */
export async function updateFeaturedTitleAction(
  input: FeaturedTitleInput,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = featuredTitleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("settings").upsert({
    id: true,
    featured_title_ar: parsed.data.ar,
    featured_title_en: parsed.data.en,
  });
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.settings, "max");
  revalidatePath("/");
  revalidatePath("/dashboard/featured");
  return { ok: true };
}
