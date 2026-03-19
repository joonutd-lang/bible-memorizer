import {getTranslations} from "next-intl/server";
import {requireUser} from "@/lib/auth/requireAuth";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import RandomTestClient from "@/app/test/random/RandomTestClient";
import {listLocalActiveAssignments, listLocalSubmissionsForUser} from "@/lib/local/localDb";
import {listKvSubmissionsForUser} from "@/lib/kv/kvDb";
import {isKvConfigured} from "@/lib/kv/kvClient";

export const dynamic = "force-dynamic";

function pickWeighted(choices: {id: string; weight: number}[]) {
  const total = choices.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (total <= 0) {
    return choices[Math.floor(Math.random() * choices.length)];
  }
  let r = Math.random() * total;
  for (const c of choices) {
    r -= Math.max(0, c.weight);
    if (r <= 0) return c;
  }
  return choices[choices.length - 1];
}

export default async function RandomTestPage() {
  const profile = await requireUser();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  await getTranslations("randomTest"); // ensure namespace loaded

  // If a verse contains "colloquial/scripture style" fragments, boost its chance
  // in the random test selection.
  const colloquialBoostKeywords = [
    "얻으리라",
    "얻게 하려 하심이라",
    "하려 하심이라",
    "하심이라",
    "하리라",
    "되리라",
  ];

  const normalizeTextForMatch = (s: string | null | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim();

  const getColloquialBoost = (assignment: any) => {
    const text =
      assignment?.memorization_items?.fixed_text ??
      assignment?.memorization_items?.raw_text ??
      "";
    const normalized = normalizeTextForMatch(text);
    if (!normalized) return 1;
    const hit = colloquialBoostKeywords.some((k) => normalized.includes(k));
    return hit ? 1.35 : 1;
  };

  const assignments: any[] = supabaseConfigured
    ? (
      await createSupabaseServerClient()
        .from("memorization_assignments")
        .select(
          "id,due_date,is_active,assigned_version_override," +
            "memorization_items(reference,version,title,fixed_text,raw_text)",
        )
        .eq("user_id", profile.id)
        .eq("is_active", true)
    ).data ?? []
    : await listLocalActiveAssignments({userId: profile.id});

  if (!assignments || assignments.length === 0) return <div />;

  const submissions: any[] = supabaseConfigured
    ? (
      await createSupabaseServerClient()
        .from("test_submissions")
        .select("assignment_id,accuracy_score,passed,submitted_at")
        .eq("user_id", profile.id)
        .order("submitted_at", {ascending: false})
        .limit(300)
    ).data ?? []
    : isKvConfigured
      ? await listKvSubmissionsForUser({userId: profile.id, limit: 300})
      : await listLocalSubmissionsForUser({userId: profile.id, limit: 300});

  const byAssignment = new Map<
    string,
    { avgAccuracy: number; count: number; lastPassed: boolean | null }
  >();

  for (const s of submissions ?? []) {
    const key = String(s.assignment_id);
    const prev = byAssignment.get(key);
    const acc = Number(s.accuracy_score ?? 0);
    if (!prev) {
      byAssignment.set(key, {avgAccuracy: acc, count: 1, lastPassed: s.passed});
    } else {
      prev.avgAccuracy = (prev.avgAccuracy * prev.count + acc) / (prev.count + 1);
      prev.count += 1;
      prev.lastPassed = prev.lastPassed ?? s.passed;
    }
  }

  const choices = assignments.map((a: any) => {
    const stats = byAssignment.get(String(a.id));
    const avg = stats?.avgAccuracy ?? 0;
    const lastPassed = stats?.lastPassed ?? null;
    const base = Math.max(1, 100 - avg);
    const recencyBoost = lastPassed === false ? 1.5 : 1.0;
    const contentBoost = getColloquialBoost(a);
    return {id: String(a.id), weight: base * recencyBoost * contentBoost};
  });

  const picked = pickWeighted(choices);
  const assignment = assignments.find((a: any) => String(a.id) === picked.id) as any;
  const reference = assignment.memorization_items?.reference ?? assignment.memorization_items?.title ?? "";
  const version = assignment.assigned_version_override ?? assignment.memorization_items?.version ?? "";

  return (
    <RandomTestClient
      assignmentId={assignment.id}
      reference={reference}
      version={version}
    />
  );
}

