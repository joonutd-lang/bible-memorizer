/* eslint-disable @typescript-eslint/no-explicit-any */
import {kvClient, isKvConfigured} from "@/lib/kv/kvClient";
import {userIdFromName} from "@/lib/local/localIds";

export type SemesterMeta = {
  id: string;
  name: string;
  category: "homework" | "memorization";
  createdAt: string;
};

export type BatchPlan = {
  id: string;
  createdAt: string;
  importedAt: string;
  folderId: string;
  verses: any[];
  versionLabels: string[];
};

export type BatchProgress = {
  planId: string;
  currentIndex: number;
  selectedVersion: string;
  verseProgress: Record<string, any>;
  updatedAt: string;
};

const INDEX_KEY = (userId: string) => `bible-memorizer:batch:index:${userId}`;
const PLAN_KEY = (userId: string, setId: string) => `bible-memorizer:batch:plan:${userId}:${setId}`;
const PROGRESS_KEY = (userId: string, setId: string) => `bible-memorizer:batch:progress:${userId}:${setId}`;

type BatchIndex = {
  semesters: SemesterMeta[];
  setsBySemester: Record<string, string[]>;
};

const DEFAULT_INDEX: BatchIndex = {semesters: [], setsBySemester: {}};

function getUserId(name: string) {
  return userIdFromName(name).toString();
}

async function getJson<T>(key: string, fallback: T): Promise<T> {
  if (!isKvConfigured || !kvClient) return fallback;
  const v = (await kvClient.get(key)) as T | null;
  return (v ?? fallback) as T;
}

async function setJson(key: string, value: unknown): Promise<void> {
  if (!isKvConfigured || !kvClient) return;
  await kvClient.set(key, value);
}

export async function getBatchIndexByName(name: string): Promise<BatchIndex> {
  const userId = getUserId(name);
  return getJson(INDEX_KEY(userId), DEFAULT_INDEX);
}

export async function setBatchIndexByName(name: string, index: BatchIndex): Promise<void> {
  const userId = getUserId(name);
  await setJson(INDEX_KEY(userId), index);
}

export async function getBatchPlanByName(name: string, setId: string): Promise<BatchPlan | null> {
  const userId = getUserId(name);
  return getJson<BatchPlan | null>(PLAN_KEY(userId, setId), null as any);
}

export async function setBatchPlanByName(name: string, setId: string, plan: BatchPlan): Promise<void> {
  const userId = getUserId(name);
  await setJson(PLAN_KEY(userId, setId), plan);
}

export async function getBatchProgressByName(
  name: string,
  setId: string,
): Promise<BatchProgress | null> {
  const userId = getUserId(name);
  return getJson<BatchProgress | null>(PROGRESS_KEY(userId, setId), null as any);
}

export async function setBatchProgressByName(
  name: string,
  setId: string,
  progress: BatchProgress,
): Promise<void> {
  const userId = getUserId(name);
  await setJson(PROGRESS_KEY(userId, setId), progress);
}

