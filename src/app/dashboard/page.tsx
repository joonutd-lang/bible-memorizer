import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {requireUser} from "@/lib/auth/requireAuth";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {listLocalActiveAssignments, listLocalSubmissionsForUser} from "@/lib/local/localDb";
import {listKvSubmissionsForUser} from "@/lib/kv/kvDb";
import {isKvConfigured} from "@/lib/kv/kvClient";
import DashboardVerseStudy from "@/app/dashboard/DashboardVerseStudy";

export const dynamic = "force-dynamic";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function DashboardPage() {
  const profile = await requireUser();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const tDash = await getTranslations("dashboard");
  const tAdmin = await getTranslations("admin");
  const tCommon = await getTranslations("common");

  let activeAssignments: any[] = [];
  let recentSubmissions: any[] = [];
  let latestSubmissions: any[] = [];
  let leaderboard: {
    user_id: string;
    user_name: string;
    attempts: number;
    avgAccuracy: number;
    passedRate: number;
  }[] = [];

  if (supabaseConfigured) {
    const supabase = await createSupabaseServerClient();

    // Active assignments for the student/admin.
    const {data: assignments, error: assignErr} = await supabase
      .from("memorization_assignments")
      .select(
        "id,due_date,is_active,assigned_fixed_text_override,assigned_version_override," +
          "memorization_items(id,title,reference,version,type)",
      )
      .eq("user_id", profile.id)
      .eq("is_active", true)
      .order("due_date", {ascending: true});

    if (assignErr) {
      // Fail gracefully: show empty dashboard.
    }

    activeAssignments = (assignments ?? []) as any;

    // Compute overall accuracy + weak items by recent submissions.
    const {data: recentSubRows} = await supabase
      .from("test_submissions")
      .select(
        "assignment_id,item_id,accuracy_score,passed,submitted_at," +
          "memorization_items(id,title,reference,version,type)",
      )
      .eq("user_id", profile.id)
      .order("submitted_at", {ascending: false})
      .limit(200);

    recentSubmissions = (recentSubRows ?? []) as any;

    // Leaderboard: learning amount + accuracy (best effort; may fail due to RLS).
    try {
      const {data: lbRows} = await supabase
        .from("test_submissions")
        .select("user_id,user_name,accuracy_score,passed,submitted_at")
        .order("submitted_at", {ascending: false})
        .limit(2000);

      const map = new Map<
        string,
        {user_id: string; user_name: string; attempts: number; totalAcc: number; passedCount: number}
      >();
      for (const r of lbRows ?? []) {
        const userId = String(r.user_id);
        const entry =
          map.get(userId) ??
          ({
            user_id: userId,
            user_name: r.user_name ?? userId,
            attempts: 0,
            totalAcc: 0,
            passedCount: 0,
          });
        entry.attempts += 1;
        entry.totalAcc += Number(r.accuracy_score ?? 0);
        entry.passedCount += r.passed ? 1 : 0;
        map.set(userId, entry);
      }

      leaderboard = Array.from(map.values())
        .map((x) => ({
          user_id: x.user_id,
          user_name: x.user_name,
          attempts: x.attempts,
          avgAccuracy: x.attempts ? x.totalAcc / x.attempts : 0,
          passedRate: x.attempts ? x.passedCount / x.attempts : 0,
        }))
        .sort((a, b) => {
          if (b.attempts !== a.attempts) return b.attempts - a.attempts;
          return b.avgAccuracy - a.avgAccuracy;
        })
        .slice(0, 5);
    } catch {
      leaderboard = [];
    }
  } else {
    activeAssignments = await listLocalActiveAssignments({userId: profile.id});
    recentSubmissions = isKvConfigured
      ? await listKvSubmissionsForUser({userId: profile.id, limit: 200})
      : await listLocalSubmissionsForUser({userId: profile.id, limit: 200});
  }

  const today = todayISO();
  const todayAssignments = activeAssignments.filter((a) => a.due_date === today).slice(0, 25);

  const chunkEvery = <T,>(arr: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  // Recent submissions: de-dupe by memorization item (same verse => only the latest attempt).
  const latestByItemId = new Map<string, any>();
  for (const s of recentSubmissions) {
    const key = String(s.item_id ?? s.memorization_items?.id ?? "");
    if (!key) continue;
    if (!latestByItemId.has(key)) latestByItemId.set(key, s);
  }
  latestSubmissions = Array.from(latestByItemId.values()).slice(0, 8);

  // "5일 정복 / 3일 정복": show 3 items per row, and allocate first 5 rows to 5일 정복.
  const todayRows = chunkEvery(todayAssignments, 3);
  const todayPhase1Rows = todayRows.slice(0, 5); // 5 rows * 3 = 15 verses
  const todayPhase2Rows = todayRows.slice(5); // rest

  // Mock exam summary for the dashboard card: use latest submissions within recentSubmissions window.
  const todayAssignmentIds = new Set(todayAssignments.map((a) => String(a.id)));
  const latestByAssignmentId = new Map<string, any>();
  for (const s of recentSubmissions) {
    const aid = String(s.assignment_id ?? "");
    if (!aid) continue;
    if (!todayAssignmentIds.has(aid)) continue;
    if (!latestByAssignmentId.has(aid)) latestByAssignmentId.set(aid, s);
  }

  const perVerseMock = todayAssignments.map((a) => {
    const latest = latestByAssignmentId.get(String(a.id));
    const acc = Number(latest?.accuracy_score ?? 0);
    const red = acc <= 60;
    return {assignment: a, acc, red};
  });

  const mockExamAverage =
    perVerseMock.length > 0 ? perVerseMock.reduce((sum, x) => sum + x.acc, 0) / perVerseMock.length : 0;
  const mockExamRedCount = perVerseMock.filter((x) => x.red).length;
  const overallAccuracy =
    recentSubmissions.length > 0
      ? Math.round(
          (recentSubmissions.reduce((sum, s) => sum + Number(s.accuracy_score ?? 0), 0) /
            recentSubmissions.length) *
            10
        ) / 10
      : 0;

  const byItem = new Map<
    string,
    { item_id: string; title: string | null; reference: string | null; total: number; count: number }
  >();

  for (const s of recentSubmissions) {
    const key = String(s.item_id);
    const prev = byItem.get(key);
    const title = (s as any).memorization_items?.title ?? null;
    const reference = (s as any).memorization_items?.reference ?? null;
    const acc = Number(s.accuracy_score ?? 0);
    if (!prev) {
      byItem.set(key, {item_id: key, title, reference, total: acc, count: 1});
    } else {
      prev.total += acc;
      prev.count += 1;
    }
  }

  const weakItems = [...byItem.values()]
    .map((v) => ({...v, avgAccuracy: v.count ? v.total / v.count : 100}))
    .sort((a, b) => a.avgAccuracy - b.avgAccuracy)
    .slice(0, 5);

  const displayName = profile.displayName?.trim() || profile.email || "Guest";

  if (profile.role === "admin") {
    return (
      <div className="space-y-4">
        <p className="text-lg text-zinc-700">{tDash("welcome", {name: displayName})}</p>
        <h1 className="text-2xl font-semibold">{tDash("title")}</h1>
        <Card>
          <CardHeader>
            <CardTitle>{tDash("continueStudy")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Link href="/admin" className="text-sm text-zinc-900 hover:underline">
                {tAdmin("title")}
              </Link>
              <Link href="/admin/items" className="text-sm text-zinc-900 hover:underline">
                {tAdmin("items")}
              </Link>
              <Link href="/admin/results" className="text-sm text-zinc-900 hover:underline">
                {tAdmin("results")}
              </Link>
            </div>
            <div className="text-sm text-zinc-600">{tAdmin("summary")}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-lg text-zinc-700">{tDash("welcome", {name: displayName})}</p>
      <h1 className="text-2xl font-semibold">{tDash("title")}</h1>

      {leaderboard.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tDash("leaderboardTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {leaderboard.map((p, idx) => {
                const isMe = String(p.user_id) === String(profile.id);
                return (
                  <div
                    key={p.user_id}
                    className={[
                      "flex items-center justify-between gap-3 rounded-lg border p-3",
                      isMe ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-semibold">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{p.user_name}</div>
                        <div className="text-xs text-zinc-600">
                          {tDash("learningAmount")}: {p.attempts}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-zinc-900">
                        {tDash("correctRate")}: {Math.round(p.avgAccuracy)}%
                      </div>
                      <div className="text-xs text-zinc-500">{Math.round(p.passedRate * 100)}% passed</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <DashboardVerseStudy />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{tDash("todayMemorization")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayAssignments.length === 0 ? (
              <p className="text-sm text-zinc-600">{tCommon("noData")}</p>
            ) : (
              <div className="space-y-4">
                {todayPhase1Rows.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-zinc-900">{tDash("conquest5")}</div>
                    {todayPhase1Rows.map((row, rowIdx) => (
                      <div key={`p1:${rowIdx}`} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {row.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200/70 p-3"
                          >
                            <div>
                              <div className="font-semibold text-zinc-900 text-sm">
                                {a.memorization_items?.reference ?? a.memorization_items?.title}
                              </div>
                              <div className="text-xs text-zinc-600">
                                {tDash("accuracy")}: <span className="font-medium">{overallAccuracy}%</span>
                              </div>
                            </div>
                            <Link href={`/study/${a.id}`}>
                              <Button size="sm">{tDash("continueStudy")}</Button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}

                {todayPhase2Rows.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-zinc-900">{tDash("conquest3")}</div>
                    {todayPhase2Rows.map((row, rowIdx) => (
                      <div key={`p2:${rowIdx}`} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {row.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200/70 p-3"
                          >
                            <div>
                              <div className="font-semibold text-zinc-900 text-sm">
                                {a.memorization_items?.reference ?? a.memorization_items?.title}
                              </div>
                              <div className="text-xs text-zinc-600">
                                {tDash("accuracy")}: <span className="font-medium">{overallAccuracy}%</span>
                              </div>
                            </div>
                            <Link href={`/study/${a.id}`}>
                              <Button size="sm">{tDash("continueStudy")}</Button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="pt-1">
              <Link href="/test/random">
                <Button className="w-full">{tDash("randomTest")}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tDash("weakItems")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {weakItems.length === 0 ? (
              <p className="text-sm text-zinc-600">{tCommon("noData")}</p>
            ) : (
              weakItems.map((w) => (
                <div
                  key={w.item_id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200/70 p-3"
                >
                  <div>
                    <div className="font-semibold text-zinc-900">{w.reference ?? w.title ?? w.item_id}</div>
                    <div className="text-sm text-zinc-600">
                      <Badge className="bg-zinc-900 text-white border-zinc-900">
                        {tDash("avg")} {Math.round(w.avgAccuracy)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    {activeAssignments.find((a) => a.item_id === w.item_id) ? (
                      <Link href={`/study/${activeAssignments.find((a) => a.item_id === w.item_id)!.id}`}>
                        <Button size="sm">{tDash("continueStudy")}</Button>
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {todayAssignments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
              <span>{tDash("mockExamTitle")}</span>
              <Badge variant="secondary">
                {tDash("mockExamAverage")}: {mockExamAverage.toFixed(1)}% · {tDash("mockExamRedCount")}{" "}
                {mockExamRedCount}/{todayAssignments.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/mock-exam">
                <Button>{tDash("openMockExam")}</Button>
              </Link>
              <Link href="/test/random">
                <Button variant="outline">{tDash("randomTest")}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{tDash("recentSubmissions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {latestSubmissions.length === 0 ? (
            <p className="text-sm text-zinc-600">{tCommon("noData")}</p>
          ) : (
            latestSubmissions.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200/70 p-3">
                <div>
                  <div className="font-semibold text-zinc-900">
                    {s.memorization_items?.reference ?? s.memorization_items?.title}
                  </div>
                  <div className="text-sm text-zinc-600">
                    {tDash("accuracy")}: <span className="font-medium">{Number(s.accuracy_score)}%</span> ·{" "}
                    {s.passed ? tDash("passed") : tDash("failed")}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Link href={`/study/${s.assignment_id}`}>
                    <Button size="sm">{tDash("continueStudy")}</Button>
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {new Date(s.submitted_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

