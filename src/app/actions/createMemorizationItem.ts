"use server";

import {createSupabaseServerClient} from "@/lib/supabase/server";
import {requireAdmin} from "@/lib/auth/requireAuth";

export type MemorizationItemType = "bible" | "vocab" | "custom";

export type CreateMemorizationItemInput = {
  type: MemorizationItemType;
  title: string;
  reference?: string;
  version?: string;
  rawText: string;
  fixedText: string; // final confirmed text (grading source)
  meaning?: string;
  notes?: string;
  difficulty?: number;
};

export async function createMemorizationItem(input: CreateMemorizationItemInput) {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const cleanedTitle = (input.title ?? "").trim();
  const cleanedRaw = (input.rawText ?? "").trim();
  const cleanedFixed = (input.fixedText ?? "").trim();

  if (!cleanedTitle) throw new Error("Missing title");
  if (!cleanedRaw) throw new Error("Missing rawText");
  if (!cleanedFixed) throw new Error("Missing fixedText");

  const difficulty = input.difficulty !== undefined ? Number(input.difficulty) : 1;

  const {data, error} = await supabase
    .from("memorization_items")
    .insert({
      type: input.type,
      title: cleanedTitle,
      reference: (input.reference ?? "").trim() || null,
      version: (input.version ?? "").trim() || null,
      raw_text: cleanedRaw,
      fixed_text: cleanedFixed,
      meaning: (input.meaning ?? "").trim() || null,
      notes: (input.notes ?? "").trim() || null,
      difficulty,
      created_by: admin.id,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Failed to create item");

  return {id: data.id};
}

