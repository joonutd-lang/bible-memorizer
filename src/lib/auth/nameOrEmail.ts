/**
 * For "name-only" accounts we store in Supabase with an internal email
 * so login can use name + password without requiring a real email.
 */
export const INTERNAL_EMAIL_SUFFIX = "@internal.bible-memorizer.local";

/**
 * Normalize a display name into a valid email local part for internal accounts.
 * Used when signing up with name-only and when resolving login identifier.
 */
export function normalizeNameForEmail(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+/g, ".");
}

/**
 * Resolve login input (name or email) to the Supabase auth email.
 * - If input contains "@", use as email.
 * - Otherwise treat as name: use normalized name + internal suffix.
 */
export function resolveLoginEmail(nameOrEmail: string): string {
  const value = nameOrEmail.trim();
  if (value.includes("@")) return value;
  const local = normalizeNameForEmail(value);
  if (!local) return value;
  return local + INTERNAL_EMAIL_SUFFIX;
}
