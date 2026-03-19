import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {requireAdmin} from "@/lib/auth/requireAuth";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminResultsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const tAdmin = await getTranslations("admin");
  const tHistory = await getTranslations("history");
  const tStudy = await getTranslations("study");
  const tCommon = await getTranslations("common");

  const {data: submissions} = await supabase
    .from("test_submissions")
    .select("id,mode,accuracy_score,passed,submitted_at,user_id,assignment_id,item_id")
    .order("submitted_at", {ascending: false})
    .limit(200);

  const subs = submissions ?? [];
  const userIds = [...new Set(subs.map((s: any) => String(s.user_id)))];
  const itemIds = [...new Set(subs.map((s: any) => String(s.item_id)))];

  const {data: profiles} = userIds.length
    ? await supabase.from("profiles").select("id,display_name,email").in("id", userIds)
    : {data: []};
  const {data: items} = itemIds.length
    ? await supabase.from("memorization_items").select("id,reference,title").in("id", itemIds)
    : {data: []};

  const profilesById = new Map((profiles ?? []).map((p: any) => [String(p.id), p]));
  const itemsById = new Map((items ?? []).map((it: any) => [String(it.id), it]));

  // Top mistakes (weak words/phrases)
  const {data: mistakeRows} = await supabase
    .from("mistake_logs")
    .select("word_or_phrase,expected_text,actual_text")
    .limit(600);

  const mistakeCounts = new Map<string, {count: number; expected: string; actual: string}>();
  for (const m of mistakeRows ?? []) {
    const key = String(m.word_or_phrase ?? "");
    if (!key) continue;
    const prev = mistakeCounts.get(key);
    if (!prev) mistakeCounts.set(key, {count: 1, expected: m.expected_text ?? "", actual: m.actual_text ?? ""});
    else mistakeCounts.set(key, {count: prev.count + 1, expected: prev.expected, actual: prev.actual});
  }

  const topMistakes = [...mistakeCounts.entries()]
    .map(([word_or_phrase, v]) => ({word_or_phrase, ...v}))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const modeLabel = (mode: string) => {
    if (mode === "typing") return tHistory("modeTyping");
    if (mode === "random") return tHistory("modeRandom");
    if (mode === "focus") return tHistory("modeFocus");
    return mode;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tAdmin("results")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{tAdmin("recentResults")}</CardTitle>
        </CardHeader>
        <CardContent>
          {subs.length === 0 ? (
            <p className="text-sm text-zinc-600">{tCommon("noData")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tAdmin("student")}</TableHead>
                  <TableHead>{tHistory("mode")}</TableHead>
                  <TableHead>{tHistory("accuracy")}</TableHead>
                  <TableHead>{tHistory("submittedAt")}</TableHead>
                  <TableHead>{tHistory("item")}</TableHead>
                  <TableHead>{tAdmin("assignment")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s: any) => {
                  const p = profilesById.get(String(s.user_id));
                  const item = itemsById.get(String(s.item_id));
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{p?.display_name ?? p?.email ?? s.user_id}</div>
                          <div className="text-xs text-zinc-500">{item?.reference ?? item?.title ?? ""}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge>{modeLabel(s.mode)}</Badge>
                      </TableCell>
                      <TableCell>
                        {Math.round(Number(s.accuracy_score))}% ·{" "}
                        {s.passed ? tHistory("passed") : tHistory("failed")}
                      </TableCell>
                      <TableCell>{new Date(s.submitted_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Link href={`/study/${s.assignment_id}`} className="text-sm text-zinc-900 hover:underline">
                          {item?.reference ?? item?.title ?? ""}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/study/${s.assignment_id}`}>
                          <Button size="sm" variant="outline">
                            {tCommon("view")}
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tAdmin("weakWords")}</CardTitle>
        </CardHeader>
        <CardContent>
          {topMistakes.length === 0 ? (
            <p className="text-sm text-zinc-600">{tCommon("noData")}</p>
          ) : (
            <div className="space-y-3">
              {topMistakes.map((w) => (
                <div key={w.word_or_phrase} className="rounded-lg border border-zinc-200 bg-white p-3 space-y-1">
                  <div className="font-semibold">{w.word_or_phrase}</div>
                  <div className="text-sm text-zinc-600">
                    {tAdmin("count")}: {w.count}
                  </div>
                  {w.expected || w.actual ? (
                    <div className="text-sm">
                      <div>
                        {tStudy("expected")}: {w.expected}
                      </div>
                      <div>
                        {tStudy("actual")}: {w.actual}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

