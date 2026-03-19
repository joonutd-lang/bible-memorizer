"use server";

import {createSupabaseServerClient} from "@/lib/supabase/server";
import {requireUser} from "@/lib/auth/requireAuth";
import {gradeTexts} from "@/lib/grading/grading";
import {getScoringSettings} from "@/lib/settings/scoring";
import {getLocalAssignmentRow, insertLocalSubmission} from "@/lib/local/localDb";
import {insertKvSubmission} from "@/lib/kv/kvDb";
import {isKvConfigured} from "@/lib/kv/kvClient";

export type MemorizationMode = "typing" | "random" | "focus";

export type GradeSubmissionInput = {
  assignmentId: string;
  mode: MemorizationMode;
  typedText: string;
  durationSeconds?: number;
  officialTextOverrideForGrading?: string;
};

export async function gradeSubmission(input: GradeSubmissionInput) {
  const profile = await requireUser();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const {assignmentId, mode, typedText} = input;

  if (!assignmentId) throw new Error("Missing assignmentId");
  if (mode !== "typing" && mode !== "random" && mode !== "focus") throw new Error("Invalid mode");

  const typed = (typedText ?? "").trim();
  if (!typed) throw new Error("typedText is empty");

  if (!supabaseConfigured) {
    const assignmentRow = await getLocalAssignmentRow({userId: profile.id, assignmentId});
    if (!assignmentRow) throw new Error("Assignment not found");

    const assignmentAny = assignmentRow as any;
    const item = assignmentAny.memorization_items as any;
    const officialTextFromAssignment = assignmentAny.assigned_fixed_text_override ?? item.fixed_text;
    const officialTextUsed = input.officialTextOverrideForGrading ?? officialTextFromAssignment;

    const scoring = await getScoringSettings();
    const grading = gradeTexts({officialTextUsed, typedText: typed, scoring});

    const submission = isKvConfigured
      ? await insertKvSubmission({
          userId: profile.id,
          assignmentId: assignmentAny.id,
          itemId: assignmentAny.item_id,
          mode,
          typedText: typed,
          officialTextUsed,
          accuracyScore: grading.accuracyScore,
          passed: grading.passed,
          durationSeconds: input.durationSeconds ?? null,
          mistakeLogs: grading.mistakeLogs,
        })
      : await insertLocalSubmission({
          userId: profile.id,
          assignmentId: assignmentAny.id,
          itemId: assignmentAny.item_id,
          mode,
          typedText: typed,
          officialTextUsed,
          accuracyScore: grading.accuracyScore,
          passed: grading.passed,
          durationSeconds: input.durationSeconds ?? null,
          mistakeLogs: grading.mistakeLogs,
        });

    return {
      submissionId: submission.id,
      accuracyScore: grading.accuracyScore,
      passed: grading.passed,
      officialTextUsed,
      submittedAt: submission.submittedAt,
      userName: profile.displayName ?? "",
      expectedTokens: grading.expectedTokens,
      actualTokens: grading.actualTokens,
      diffTokens: grading.diffTokens,
      mistakeLogs: grading.mistakeLogs,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {data: assignmentRow, error: assignmentErr} = await supabase
    .from("memorization_assignments")
    .select(
      "id,user_id,item_id,assigned_fixed_text_override,assigned_version_override," +
        "memorization_items(id,title,reference,fixed_text,version,type,raw_text,meaning,notes,difficulty)"
    )
    .eq("id", assignmentId)
    .single();

  if (assignmentErr || !assignmentRow) throw new Error("Assignment not found");

  const assignmentAny = assignmentRow as any;
  const item = assignmentAny.memorization_items as any;
  const officialTextFromAssignment = assignmentAny.assigned_fixed_text_override ?? item.fixed_text;
  const officialTextUsed = input.officialTextOverrideForGrading ?? officialTextFromAssignment;

  const scoring = await getScoringSettings();
  const grading = gradeTexts({officialTextUsed, typedText: typed, scoring});

  // Persist submission.
  const {data: submissionRow, error: submissionErr} = await supabase
    .from("test_submissions")
    .insert({
      user_id: profile.id,
      user_name: profile.displayName ?? null,
      user_email: profile.email ?? null,
      item_id: item.id,
      assignment_id: assignmentAny.id,
      mode,
      typed_text: typed,
      official_text_used: officialTextUsed,
      accuracy_score: grading.accuracyScore,
      passed: grading.passed,
      duration_seconds: input.durationSeconds ?? null,
    })
    .select("id,submitted_at")
    .single();

  if (submissionErr || !submissionRow?.id) throw new Error("Failed to save submission");

  if (grading.mistakeLogs.length > 0) {
    await supabase.from("mistake_logs").insert(
      grading.mistakeLogs.map((m) => ({
        submission_id: submissionRow.id,
        word_or_phrase: m.word_or_phrase,
        expected_text: m.expected_text,
        actual_text: m.actual_text,
        position: m.position,
      })),
    );
  }

  return {
    submissionId: submissionRow.id,
    accuracyScore: grading.accuracyScore,
    passed: grading.passed,
    officialTextUsed,
    submittedAt: submissionRow.submitted_at,
    userName: profile.displayName ?? profile.email ?? "",
    expectedTokens: grading.expectedTokens,
    actualTokens: grading.actualTokens,
    diffTokens: grading.diffTokens,
    mistakeLogs: grading.mistakeLogs,
  };
}

