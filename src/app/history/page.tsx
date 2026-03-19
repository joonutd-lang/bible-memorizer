import {getTranslations} from "next-intl/server";
import {requireUser} from "@/lib/auth/requireAuth";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import Link from "next/link";
import {Badge} from "@/components/ui/badge";
import {listLocalSubmissionsForUser} from "@/lib/local/localDb";
import {listKvSubmissionsForUser} from "@/lib/kv/kvDb";
import {isKvConfigured} from "@/lib/kv/kvClient";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const profile = await requireUser();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const tHistory = await getTranslations("history");
  const tCommon = await getTranslations("common");

  const submissions: any[] = supabaseConfigured
    ? (
      await createSupabaseServerClient()
        .from("test_submissions")
        .select(
          "id,mode,accuracy_score,passed,submitted_at,typed_text,official_text_used,assignment_id," +
            "memorization_items(reference,title,version)",
        )
        .eq("user_id", profile.id)
        .order("submitted_at", {ascending: false})
        .limit(50)
    ).data ?? []
    : isKvConfigured
      ? await listKvSubmissionsForUser({userId: profile.id, limit: 50})
      : await listLocalSubmissionsForUser({userId: profile.id, limit: 50});

  const modeLabel = (mode: string) => {
    if (mode === "typing") return tHistory("modeTyping");
    if (mode === "random") return tHistory("modeRandom");
    if (mode === "focus") return tHistory("modeFocus");
    return mode;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tHistory("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{tHistory("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="text-sm text-zinc-600">{tCommon("noData")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tHistory("mode")}</TableHead>
                  <TableHead>{tHistory("accuracy")}</TableHead>
                  <TableHead>{tHistory("submittedAt")}</TableHead>
                  <TableHead>{tHistory("item")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Badge>{modeLabel(s.mode)}</Badge>
                    </TableCell>
                    <TableCell>
                      {Math.round(Number(s.accuracy_score))}% ·{" "}
                      <span className={s.passed ? "text-emerald-700" : "text-red-700"}>
                        {s.passed ? tHistory("passed") : tHistory("failed")}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(s.submitted_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Link href={`/study/${s.assignment_id}`} className="text-sm text-zinc-900 hover:underline">
                        {s.memorization_items?.reference ?? s.memorization_items?.title}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {submissions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tHistory("officialText")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {submissions.slice(0, 10).map((s: any) => (
              <div key={s.id} className="rounded-lg border border-zinc-200 p-3 bg-white space-y-2">
                <div className="text-sm text-zinc-600">
                  {s.memorization_items?.reference ?? s.memorization_items?.title}
                </div>
                <div>
                  <div className="text-xs text-zinc-500">{tHistory("officialText")}</div>
                  <pre className="whitespace-pre-wrap text-sm leading-6">{s.official_text_used}</pre>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">{tHistory("typedText")}</div>
                  <pre className="whitespace-pre-wrap text-sm leading-6">{s.typed_text}</pre>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

