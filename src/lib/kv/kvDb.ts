/* eslint-disable @typescript-eslint/no-explicit-any */
import {kvClient, isKvConfigured} from "@/lib/kv/kvClient";
import {userIdFromName} from "@/lib/local/localIds";
import {LOCAL_ITEMS, type LocalMemorizationItem} from "@/lib/local/localItems";

export type KvProfile = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: "admin" | "student";
  preferredLanguage: "ko" | "en";
};

export type KvScoringSettings = {
  caseSensitive: boolean;
  ignorePunctuation: boolean;
  collapseWhitespace: boolean;
  passThreshold: number;
};

type StoredSubmission = {
  id: string;
  user_id: string;
  item_id: string;
  assignment_id: string;
  mode: "typing" | "random" | "focus";
  typed_text: string;
  official_text_used: string;
  accuracy_score: number;
  passed: boolean;
  submitted_at: string; // ISO
  duration_seconds: number | null;
  // gradeTexts already produces mistake logs; we store them as part of the record.
  mistake_logs?: {word_or_phrase: string; expected_text: string; actual_text: string; position: number}[];
};

const SUBMISSIONS_KEY = (userId: string) => `bible-memorizer:submissions:${userId}`;
const PROFILE_KEY = (userId: string) => `bible-memorizer:profile:${userId}`;
const SCORING_KEY = () => `bible-memorizer:scoring:${1}`;

function defaultScoring(): KvScoringSettings {
  return {
    caseSensitive: false,
    ignorePunctuation: true,
    collapseWhitespace: true,
    passThreshold: 80,
  };
}

function getItemById(itemId: string): LocalMemorizationItem | null {
  return (LOCAL_ITEMS as any[]).find((i) => i.itemId === itemId) ?? null;
}

async function kvGetJson<T>(key: string, fallback: T): Promise<T> {
  if (!isKvConfigured || !kvClient) return fallback;
  const data = (await kvClient.get(key)) as T | null;
  return (data ?? fallback) as T;
}

async function kvSetJson(key: string, value: unknown): Promise<void> {
  if (!isKvConfigured || !kvClient) return;
  await kvClient.set(key, value);
}

export async function getOrCreateKvUserByName(name: string): Promise<KvProfile> {
  const displayName = (name ?? "").trim().slice(0, 60);
  const id = userIdFromName(displayName).toString();

  const existing = await kvGetJson<any>(PROFILE_KEY(id), null as any);
  if (existing) {
    // Keep stable id; update display name for the current session.
    const next = {
      ...existing,
      displayName: displayName || existing.displayName,
    };
    await kvSetJson(PROFILE_KEY(id), next);
    return {
      id,
      email: next.email ?? null,
      displayName: next.displayName ?? null,
      role: next.role,
      preferredLanguage: next.preferredLanguage ?? "ko",
    };
  }

  const profile: KvProfile = {
    id,
    email: null,
    displayName: displayName || null,
    role: "student",
    preferredLanguage: "ko",
  };

  await kvSetJson(PROFILE_KEY(id), profile);
  return profile;
}

export async function getKvScoringSettings(): Promise<KvScoringSettings> {
  const base = defaultScoring();
  const data = await kvGetJson<any>(SCORING_KEY(), base as any);
  return {
    caseSensitive: Boolean(data.caseSensitive ?? base.caseSensitive),
    ignorePunctuation: Boolean(data.ignorePunctuation ?? base.ignorePunctuation),
    collapseWhitespace: Boolean(data.collapseWhitespace ?? base.collapseWhitespace),
    passThreshold: Number(data.passThreshold ?? base.passThreshold),
  };
}

export async function insertKvSubmission(params: {
  userId: string;
  assignmentId: string;
  itemId: string;
  mode: StoredSubmission["mode"];
  typedText: string;
  officialTextUsed: string;
  accuracyScore: number;
  passed: boolean;
  durationSeconds: number | null;
  mistakeLogs?: StoredSubmission["mistake_logs"];
}): Promise<{id: string; submittedAt: string}> {
  const submissions = await kvGetJson<StoredSubmission[]>(SUBMISSIONS_KEY(params.userId), []);

  // IDs need to be unique-ish. Use timestamp + random fallback.
  const id = `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const submitted_at = new Date().toISOString();

  const submission: StoredSubmission = {
    id,
    user_id: params.userId,
    assignment_id: params.assignmentId,
    item_id: params.itemId,
    mode: params.mode,
    typed_text: params.typedText,
    official_text_used: params.officialTextUsed,
    accuracy_score: params.accuracyScore,
    passed: params.passed,
    submitted_at,
    duration_seconds: params.durationSeconds,
    mistake_logs: params.mistakeLogs,
  };

  submissions.push(submission);
  await kvSetJson(SUBMISSIONS_KEY(params.userId), submissions);

  return {id, submittedAt: submission.submitted_at};
}

export async function listKvSubmissionsForUser(params: {userId: string; limit?: number}): Promise<any[]> {
  const subs = await kvGetJson<StoredSubmission[]>(SUBMISSIONS_KEY(params.userId), []);
  const filtered = subs
    .filter((s) => s.user_id === params.userId)
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  const slice = typeof params.limit === "number" ? filtered.slice(0, params.limit) : filtered;

  return slice.map((s) => {
    const item = getItemById(s.item_id);
    return {
      ...s,
      memorization_items: {
        id: s.item_id,
        reference: item?.reference ?? null,
        title: item?.title ?? "",
        version: item?.version ?? null,
      },
    };
  });
}

export async function listKvSubmissionsForUserAndAssignment(params: {
  userId: string;
  assignmentId: string;
  modeNotEqual?: StoredSubmission["mode"];
  limit?: number;
}): Promise<any[]> {
  const all = await listKvSubmissionsForUser({userId: params.userId, limit: params.limit ?? 2000});
  return all.filter((s) => {
    const okAssignment = String(s.assignment_id) === String(params.assignmentId);
    const okMode = params.modeNotEqual ? s.mode !== params.modeNotEqual : true;
    return okAssignment && okMode;
  });
}

