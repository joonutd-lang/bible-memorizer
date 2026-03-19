"use server";

import {createSupabaseServerClient} from "@/lib/supabase/server";
import {requireUser} from "@/lib/auth/requireAuth";
import {gradeTexts} from "@/lib/grading/grading";
import {getScoringSettings} from "@/lib/settings/scoring";
import {listLocalSubmissionsForUser} from "@/lib/local/localDb";
import {listKvSubmissionsForUser} from "@/lib/kv/kvDb";
import {isKvConfigured} from "@/lib/kv/kvClient";

export async function prepareFocusPractice(assignmentId: string) {
  const profile = await requireUser();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!supabaseConfigured) {
    // For local mode: find latest non-focus submission for this assignment.
    const all = isKvConfigured
      ? await listKvSubmissionsForUser({userId: profile.id, limit: 2000})
      : await listLocalSubmissionsForUser({userId: profile.id, limit: 2000});
    const lastSubmission = all.find((s) => String(s.assignment_id) === String(assignmentId) && s.mode !== "focus");
    if (!lastSubmission) {
      return {segments: [] as string[], officialFocusText: ""};
    }

    const scoring = await getScoringSettings();
    const grading = gradeTexts({
      officialTextUsed: lastSubmission.official_text_used,
      typedText: lastSubmission.typed_text,
      scoring,
    });

    const segments = grading.mistakeLogs
      .map((m) => (m.expected_text && m.expected_text.trim() ? m.expected_text : m.word_or_phrase))
      .filter(Boolean)
      .slice(0, 3);

    const officialFocusText = segments.length > 0 ? segments.join(" ") : "";
    return {segments, officialFocusText};
  }

  const supabase = await createSupabaseServerClient();
  const {data: lastSubmission, error} = await supabase
    .from("test_submissions")
    .select("typed_text, official_text_used, submitted_at, mode")
    .eq("assignment_id", assignmentId)
    .eq("user_id", profile.id)
    .neq("mode", "focus")
    .order("submitted_at", {ascending: false})
    .limit(1)
    .single();

  if (error || !lastSubmission) return {segments: [] as string[], officialFocusText: ""};

  const scoring = await getScoringSettings();
  const grading = gradeTexts({
    officialTextUsed: lastSubmission.official_text_used,
    typedText: lastSubmission.typed_text,
    scoring,
  });

  const segments = grading.mistakeLogs
    .map((m) => (m.expected_text && m.expected_text.trim() ? m.expected_text : m.word_or_phrase))
    .filter(Boolean)
    .slice(0, 3);

  const officialFocusText = segments.length > 0 ? segments.join(" ") : "";
  return {segments, officialFocusText};
}

