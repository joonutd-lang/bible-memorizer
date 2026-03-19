import {createSupabaseServerClient} from "@/lib/supabase/server";
import {requireUser} from "@/lib/auth/requireAuth";
import StudyClient from "@/app/study/[assignmentId]/StudyClient";
import {getLocalAssignmentRow} from "@/lib/local/localDb";

export const dynamic = "force-dynamic";

export default async function StudyPage({
  params,
}: {
  params: {assignmentId: string};
}) {
  const profile = await requireUser();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const {assignmentId} = params;
  let assignmentAny: any = null;

  if (!supabaseConfigured) {
    const assignmentRow = await getLocalAssignmentRow({userId: profile.id, assignmentId});
    assignmentAny = assignmentRow as any;
  } else {
    const supabase = await createSupabaseServerClient();
    const {data: assignmentRow, error} = await supabase
      .from("memorization_assignments")
      .select(
        "id,user_id,due_date,assigned_fixed_text_override,assigned_version_override,item_id," +
          "memorization_items(id,title,reference,version,type,raw_text,fixed_text,meaning,notes,difficulty)",
      )
      .eq("id", assignmentId)
      .single();
    if (error || !assignmentRow) return <div />;
    assignmentAny = assignmentRow as any;
  }

  if (!assignmentAny) return <div />;

  const item = assignmentAny.memorization_items as any;
  const officialTextUsed = assignmentAny.assigned_fixed_text_override ?? item.fixed_text;
  const versionToShow = assignmentAny.assigned_version_override ?? item.version;

  return (
    <StudyClient
      profileRole={profile.role}
      assignmentId={assignmentAny.id}
      reference={item.reference ?? item.title}
      version={versionToShow ?? ""}
      officialTextUsed={officialTextUsed}
      meaning={item.meaning ?? ""}
      notes={item.notes ?? ""}
      difficulty={item.difficulty ?? 1}
    />
  );
}

