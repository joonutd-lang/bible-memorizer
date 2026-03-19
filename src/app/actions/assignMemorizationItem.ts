"use server";

import {createSupabaseServerClient} from "@/lib/supabase/server";
import {requireAdmin} from "@/lib/auth/requireAuth";

export type AssignMemorizationItemInput = {
  userId: string;
  itemId: string;
  dueDate?: string; // YYYY-MM-DD
  assignedFixedTextOverride?: string;
  assignedVersionOverride?: string;
};

export async function assignMemorizationItem(input: AssignMemorizationItemInput) {
  const admin = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  if (!input.userId || !input.itemId) throw new Error("Missing userId or itemId");

  const {data, error} = await supabase
    .from("memorization_assignments")
    .insert({
      user_id: input.userId,
      item_id: input.itemId,
      due_date: input.dueDate ? input.dueDate : null,
      assigned_fixed_text_override: input.assignedFixedTextOverride?.trim() || null,
      assigned_version_override: input.assignedVersionOverride?.trim() || null,
      is_active: true,
      // admin is authorized via RLS; created_by is not present in schema.
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Failed to create assignment");

  return {id: data.id};
}

