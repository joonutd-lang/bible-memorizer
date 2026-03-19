import {createHash} from "crypto";

export function normalizeName(name: string): string {
  return (name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function userIdFromName(name: string): string {
  const normalized = normalizeName(name).toLowerCase();
  const hex = createHash("sha256").update(normalized).digest("hex");
  // Short but stable id for URL usage and file keys.
  return hex.slice(0, 32);
}

export function assignmentIdFrom(userId: string, itemId: string): string {
  const hex = createHash("sha256").update(`${userId}:${itemId}`).digest("hex");
  return hex.slice(0, 32);
}

