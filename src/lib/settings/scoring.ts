import {createSupabaseServerClient} from "@/lib/supabase/server";
import type {ScoringOptions} from "@/lib/grading/grading";
import {getLocalScoringSettings} from "@/lib/local/localDb";
import {getKvScoringSettings} from "@/lib/kv/kvDb";
import {isKvConfigured} from "@/lib/kv/kvClient";

export async function getScoringSettings(): Promise<ScoringOptions> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const local = isKvConfigured ? await getKvScoringSettings() : await getLocalScoringSettings();
    return {
      caseSensitive: local.caseSensitive,
      ignorePunctuation: local.ignorePunctuation,
      collapseWhitespace: local.collapseWhitespace,
      passThreshold: local.passThreshold,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {data, error} = await supabase.from("app_scoring_settings").select("*").eq("id", 1).single();

  if (error || !data) {
    return {
      caseSensitive: false,
      ignorePunctuation: true,
      collapseWhitespace: true,
      passThreshold: 80,
    };
  }

  return {
    caseSensitive: Boolean(data.case_sensitive),
    ignorePunctuation: Boolean(data.ignore_punctuation),
    collapseWhitespace: Boolean(data.collapse_whitespace),
    passThreshold: Number(data.pass_threshold),
  };
}

