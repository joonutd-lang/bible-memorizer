"use server";

import {createSupabaseServerClient} from "@/lib/supabase/server";
import {requireAdmin} from "@/lib/auth/requireAuth";

export type UpdateScoringSettingsInput = {
  passThreshold: number;
  caseSensitive: boolean;
  ignorePunctuation: boolean;
  collapseWhitespace: boolean;
};

export async function updateScoringSettings(input: UpdateScoringSettingsInput) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const passThreshold = Math.max(0, Math.min(100, Number(input.passThreshold)));

  const {data, error} = await supabase
    .from("app_scoring_settings")
    .update({
      pass_threshold: passThreshold,
      case_sensitive: input.caseSensitive,
      ignore_punctuation: input.ignorePunctuation,
      collapse_whitespace: input.collapseWhitespace,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id,pass_threshold,case_sensitive,ignore_punctuation,collapse_whitespace")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

