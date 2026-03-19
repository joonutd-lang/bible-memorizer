import path from "path";
import fs from "fs/promises";
import {randomUUID} from "crypto";
import {userIdFromName, assignmentIdFrom} from "@/lib/local/localIds";
import {LOCAL_ITEMS, getLocalItemById, type LocalMemorizationItem} from "@/lib/local/localItems";

export type LocalUserProfile = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: "admin" | "student";
  preferredLanguage: "ko" | "en";
};

export type LocalScoringSettings = {
  caseSensitive: boolean;
  ignorePunctuation: boolean;
  collapseWhitespace: boolean;
  passThreshold: number;
};

export type LocalSubmission = {
  id: string;
  user_id: string;
  assignment_id: string;
  item_id: string;
  mode: "typing" | "random" | "focus";
  typed_text: string;
  official_text_used: string;
  accuracy_score: number;
  passed: boolean;
  submitted_at: string; // ISO
  duration_seconds: number | null;
  // For simplicity we store mistakeLogs already computed by gradeTexts.
  // (prepareFocus re-computes on demand, but history/study need the logs from gradeSubmission response.)
  mistake_logs?: {word_or_phrase: string; expected_text: string; actual_text: string; position: number}[];
};

const BASE_DIR = path.join(process.cwd(), ".localdb");
const USERS_PATH = path.join(BASE_DIR, "users.json");
const SUBMISSIONS_PATH = path.join(BASE_DIR, "submissions.json");
const SCORING_PATH = path.join(BASE_DIR, "scoring_settings.json");

async function ensureBaseDir() {
  await fs.mkdir(BASE_DIR, {recursive: true});
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, data: unknown) {
  await ensureBaseDir();
  // Windows can fail to rename in some dev environments (file locks / EPERM).
  // For local mode persistence we can safely overwrite the file.
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, json, "utf-8");
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function defaultScoring(): LocalScoringSettings {
  return {
    caseSensitive: false,
    ignorePunctuation: true,
    collapseWhitespace: true,
    passThreshold: 80,
  };
}

export function getLocalAssignmentsShape(userId: string) {
  // Supabase join shape expected by UI pages.
  return LOCAL_ITEMS.map((item) => {
    const assignmentId = assignmentIdFrom(userId, item.itemId);
    return {
      id: assignmentId,
      user_id: userId,
      due_date: todayISO(),
      is_active: true,
      assigned_fixed_text_override: null,
      assigned_version_override: null,
      item_id: item.itemId,
      memorization_items: {
        id: item.itemId,
        title: item.title,
        reference: item.reference,
        version: item.version,
        type: item.type,
        raw_text: item.raw_text,
        fixed_text: item.fixed_text,
        meaning: item.meaning,
        notes: item.notes,
        difficulty: item.difficulty,
      },
    };
  });
}

export async function getOrCreateLocalUserByName(name: string): Promise<LocalUserProfile> {
  const displayName = (name ?? "").trim().slice(0, 60);
  const id = userIdFromName(displayName);
  const users = await readJson<Record<string, Omit<LocalUserProfile, "preferredLanguage"> & {preferred_language: "ko" | "en"}>>(
    USERS_PATH,
    {},
  );

  const existing = users[id];
  if (existing) {
    users[id] = {
      ...existing,
      displayName,
      preferred_language: "ko",
    };
    await writeJson(USERS_PATH, users);
  } else {
    users[id] = {
      id,
      email: null,
      displayName,
      role: "student",
      preferred_language: "ko",
    } as any;
    await writeJson(USERS_PATH, users);
  }

  const u = users[id] as any;
  return {
    id: u.id,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    role: u.role,
    preferredLanguage: u.preferred_language ?? "ko",
  };
}

export async function getLocalUserById(userId: string): Promise<LocalUserProfile | null> {
  const users = await readJson<Record<string, any>>(USERS_PATH, {});
  const u = users[userId];
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    role: u.role,
    preferredLanguage: u.preferred_language ?? "ko",
  };
}

export async function getLocalScoringSettings(): Promise<LocalScoringSettings> {
  const scoring = await readJson<LocalScoringSettings>(SCORING_PATH, defaultScoring());
  return {
    ...defaultScoring(),
    ...scoring,
    passThreshold: Number(scoring?.passThreshold ?? defaultScoring().passThreshold),
  };
}

export async function insertLocalSubmission(params: {
  userId: string;
  assignmentId: string;
  itemId: string;
  mode: LocalSubmission["mode"];
  typedText: string;
  officialTextUsed: string;
  accuracyScore: number;
  passed: boolean;
  durationSeconds: number | null;
  mistakeLogs?: LocalSubmission["mistake_logs"];
}): Promise<{id: string; submittedAt: string}> {
  const submission: LocalSubmission = {
    id: randomUUID(),
    user_id: params.userId,
    assignment_id: params.assignmentId,
    item_id: params.itemId,
    mode: params.mode,
    typed_text: params.typedText,
    official_text_used: params.officialTextUsed,
    accuracy_score: params.accuracyScore,
    passed: params.passed,
    submitted_at: new Date().toISOString(),
    duration_seconds: params.durationSeconds,
    mistake_logs: params.mistakeLogs,
  };

  const subs = await readJson<LocalSubmission[]>(SUBMISSIONS_PATH, []);
  subs.push(submission);
  await writeJson(SUBMISSIONS_PATH, subs);

  return {id: submission.id, submittedAt: submission.submitted_at};
}

export async function listLocalSubmissionsForUser(params: {
  userId: string;
  limit?: number;
}): Promise<
  (LocalSubmission & {
    memorization_items: {reference: string | null; title: string; version: string | null; id: string};
  })[]
> {
  const subs = await readJson<LocalSubmission[]>(SUBMISSIONS_PATH, []);
  const filtered = subs
    .filter((s) => s.user_id === params.userId)
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  const slice = typeof params.limit === "number" ? filtered.slice(0, params.limit) : filtered;
  return slice.map((s) => {
    const item = getLocalItemById(s.item_id) as LocalMemorizationItem | null;
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

export async function listLocalSubmissionsForUserAndAssignment(params: {
  userId: string;
  assignmentId: string;
  modeNotEqual?: LocalSubmission["mode"];
}): Promise<
  (LocalSubmission & {
    memorization_items: {reference: string | null; title: string; version: string | null; id: string};
  })[]
> {
  const subs = await listLocalSubmissionsForUser({userId: params.userId});
  return subs.filter((s) => {
    const okAssignment = String(s.assignment_id) === String(params.assignmentId);
    const okMode = params.modeNotEqual ? s.mode !== params.modeNotEqual : true;
    return okAssignment && okMode;
  });
}

export async function getLocalAssignmentRow(params: {
  userId: string;
  assignmentId: string;
}): Promise<
  | (ReturnType<typeof getLocalAssignmentsShape>[number] & {
      memorization_items: any;
    })
  | null
> {
  const all = getLocalAssignmentsShape(params.userId);
  const found = all.find((a) => String(a.id) === String(params.assignmentId)) ?? null;
  return found;
}

export function getLocalAssignmentItem(params: {
  userId: string;
  assignmentId: string;
}): {assignment: ReturnType<typeof getLocalAssignmentsShape>[number]; item: LocalMemorizationItem} | null {
  const all = getLocalAssignmentsShape(params.userId);
  const assignment = all.find((a) => String(a.id) === String(params.assignmentId));
  if (!assignment) return null;
  const item = getLocalItemById(assignment.item_id);
  if (!item) return null;
  return {assignment, item};
}

export async function listLocalActiveAssignments(params: {userId: string}): Promise<ReturnType<typeof getLocalAssignmentsShape>> {
  return getLocalAssignmentsShape(params.userId);
}

