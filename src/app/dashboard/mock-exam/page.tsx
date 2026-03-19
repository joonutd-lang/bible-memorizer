import {getTranslations} from "next-intl/server";
import {requireUser} from "@/lib/auth/requireAuth";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {listLocalActiveAssignments, listLocalSubmissionsForUser} from "@/lib/local/localDb";
import {listKvSubmissionsForUser} from "@/lib/kv/kvDb";
import {isKvConfigured} from "@/lib/kv/kvClient";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import Link from "next/link";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import PrintButton from "@/app/dashboard/mock-exam/PrintButton";

export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function chunkEvery<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function MockExamPage() {
  const profile = await requireUser();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const tDash = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");

  const today = todayISO();

  let todayAssignments: any[] = [];
  let submissions: any[] = [];

  if (supabaseConfigured) {
    const supabase = await createSupabaseServerClient();

    const {data: assignments} = await supabase
      .from("memorization_assignments")
      .select(
        "id,due_date,is_active,memorization_items(id,title,reference,version,type)",
      )
      .eq("user_id", profile.id)
      .eq("is_active", true);

    const assignmentRows = (assignments ?? []) as any[];
    todayAssignments = assignmentRows.filter((a) => a.due_date === today).slice(0, 25);

    const assignmentIds = todayAssignments.map((a) => a.id);
    if (assignmentIds.length > 0) {
      const {data: subs} = await supabase
        .from("test_submissions")
        .select(
          "assignment_id,accuracy_score,passed,submitted_at," +
            "memorization_items(id,title,reference,version,type)",
        )
        .eq("user_id", profile.id)
        .in("assignment_id", assignmentIds)
        .order("submitted_at", {ascending: false})
        .limit(500);
      submissions = (subs ?? []) as any[];
    }
  } else {
    todayAssignments = (await listLocalActiveAssignments({userId: profile.id}))
      .filter((a: any) => a.due_date === today)
      .slice(0, 25);

    const assignmentIds = new Set(todayAssignments.map((a: any) => String(a.id)));
    submissions = isKvConfigured
      ? await listKvSubmissionsForUser({userId: profile.id, limit: 2000})
      : await listLocalSubmissionsForUser({userId: profile.id, limit: 2000});
    submissions = submissions.filter((s: any) => assignmentIds.has(String(s.assignment_id)));
  }

  const todayAssignmentIds = new Set(todayAssignments.map((a) => String(a.id)));
  const latestByAssignmentId = new Map<string, any>();
  for (const s of submissions) {
    const aid = String(s.assignment_id);
    if (!todayAssignmentIds.has(aid)) continue;
    if (!latestByAssignmentId.has(aid)) latestByAssignmentId.set(aid, s);
  }

  const totalVerses = todayAssignments.length;
  const rows = chunkEvery(todayAssignments, 3);

  const perVerse = todayAssignments.map((a) => {
    const latest = latestByAssignmentId.get(String(a.id));
    const acc = Number(latest?.accuracy_score ?? 0);
    const red = acc <= 60;
    return {assignment: a, latest, accuracyScore: acc, red};
  });

  const averageAccuracy =
    totalVerses > 0
      ? perVerse.reduce((sum, x) => sum + x.accuracyScore, 0) / totalVerses
      : 0;

  const redCount = perVerse.filter((x) => x.red).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{tDash("mockExamTitle")}</h1>
        <PrintButton />
      </div>

      {totalVerses === 0 ? (
        <p className="text-sm text-zinc-600">{tCommon("noData")}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
              <span>
                {tDash("mockExamAverage")}: <span className="font-semibold">{averageAccuracy.toFixed(1)}%</span>
              </span>
              <Badge variant="secondary">
                {tDash("mockExamRedCount")} {redCount}/{totalVerses}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.map((row, rowIdx) => (
              <div key={`row:${rowIdx}`} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {row.map((a: any) => {
                  const r = perVerse.find((x) => x.assignment.id === a.id)!;
                  const ref = a.memorization_items?.reference ?? a.memorization_items?.title;
                  return (
                    <div
                      key={a.id}
                      className={[
                        "rounded-lg border p-3 flex items-start justify-between gap-3",
                        r.red ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white",
                      ].join(" ")}
                    >
                      <div>
                        <div className="font-semibold text-zinc-900 text-sm">{ref}</div>
                        <div className="text-xs text-zinc-600">
                          {r.red ? "<=60%" : ">60%"} ·{" "}
                          <span className={r.red ? "text-red-700 font-semibold" : "text-emerald-800 font-semibold"}>
                            {r.accuracyScore.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <Link href={`/study/${a.id}`}>
                        <Button size="sm" variant={r.red ? "outline" : "ghost"}>
                          {tDash("continueStudy")}
                        </Button>
                      </Link>
                    </div>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

