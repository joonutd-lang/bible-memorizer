"use client";

import {useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {gradeSubmission} from "@/app/actions/gradeSubmission";
import {prepareFocusPractice} from "@/app/actions/prepareFocus";
import MistakeHighlighter from "@/components/MistakeHighlighter";
import type {DiffToken} from "@/lib/grading/grading";
import {useRouter} from "next/navigation";

type StudyClientProps = {
  profileRole: "admin" | "student";
  assignmentId: string;
  reference: string;
  version: string;
  officialTextUsed: string;
  meaning: string;
  notes: string;
  difficulty: number;
};

function parseMeaningSections(meaning: string) {
  const raw = (meaning ?? "").trim();
  if (!raw) return {summary: "", keyPoint: "", application: ""};

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const text = lines.join("\n");

  const extract = (labels: string[]) => {
    for (const label of labels) {
      // Match label followed by : or - and capture until next label or end.
      const re = new RegExp(`${label}\\s*[:\\-]\\s*([\\s\\S]*?)(?=\\n\\s*${labels.join("|")}\\s*[:\\-]|$)`, "i");
      const m = text.match(re);
      if (m?.[1]) return m[1].trim();
    }
    return "";
  };

  const summary = extract(["summary", "요약"]);
  const keyPoint = extract(["key point", "핵심"]);
  const application = extract(["application", "적용"]);

  // If no labels found, treat the whole meaning as summary.
  if (!summary && !keyPoint && !application) {
    return {summary: raw, keyPoint: "", application: ""};
  }

  return {summary, keyPoint, application};
}

export default function StudyClient(props: StudyClientProps) {
  const t = useTranslations("study");
  const router = useRouter();

  const [tab, setTab] = useState<"read" | "typing" | "focus" | "meaning">("read");
  const [showOfficial, setShowOfficial] = useState(false);

  // Typing practice state
  const [typedText, setTypedText] = useState("");
  const [grading, setGrading] = useState<null | {
    accuracyScore: number;
    passed: boolean;
    diffTokens: DiffToken[];
    expectedTokens: string[];
    actualTokens: string[];
    mistakeLogs: {word_or_phrase: string; expected_text: string; actual_text: string; position: number}[];
    officialTextUsed: string;
    submittedAt: string;
    userName: string;
  }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startAtMs, setStartAtMs] = useState<number>(() => Date.now());

  // Focus practice state
  const [focusSegments, setFocusSegments] = useState<string[]>([]);
  const [officialFocusText, setOfficialFocusText] = useState<string>("");
  const [loadingFocus, setLoadingFocus] = useState(false);

  const meaningSections = useMemo(() => parseMeaningSections(props.meaning), [props.meaning]);

  useEffect(() => {
    setStartAtMs(Date.now());
  }, [tab]);

  useEffect(() => {
    if (tab !== "focus") return;
    let cancelled = false;
    const run = async () => {
      setLoadingFocus(true);
      try {
        const res = await prepareFocusPractice(props.assignmentId);
        if (cancelled) return;
        setFocusSegments(res.segments);
        setOfficialFocusText(res.officialFocusText);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingFocus(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [tab, props.assignmentId]);

  const officialForTyping = props.officialTextUsed;

  const onSubmitTyping = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const durationSeconds = Math.max(0, Math.round((Date.now() - startAtMs) / 1000));
      const res = await gradeSubmission({
        assignmentId: props.assignmentId,
        mode: tab === "focus" ? "focus" : "typing",
        typedText,
        durationSeconds,
        officialTextOverrideForGrading: tab === "focus" ? officialFocusText : undefined,
      });

      setGrading({
        accuracyScore: res.accuracyScore,
        passed: res.passed,
        diffTokens: res.diffTokens,
        expectedTokens: res.expectedTokens,
        actualTokens: res.actualTokens,
        mistakeLogs: res.mistakeLogs,
        officialTextUsed: res.officialTextUsed,
        submittedAt: res.submittedAt,
        userName: res.userName,
      });

      setShowOfficial(true);
    } catch (e: any) {
      setSubmitError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  const onRetry = () => {
    setTypedText("");
    setGrading(null);
    setSubmitError(null);
    setStartAtMs(Date.now());
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <span>{props.reference}</span>
            <Badge>{props.version}</Badge>
            <Badge>
              {t("difficulty")}: {props.difficulty}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="read">{t("readMode")}</TabsTrigger>
              <TabsTrigger value="typing">{t("typingPractice")}</TabsTrigger>
              <TabsTrigger value="focus">{t("focusMode")}</TabsTrigger>
              <TabsTrigger value="meaning">{t("meaningMode")}</TabsTrigger>
            </TabsList>

            <TabsContent value="read">
              <div className="space-y-4">
                <div className="text-sm text-zinc-600">
                  {t("reference")}: <span className="font-medium">{props.reference}</span>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("officialText")}</div>
                  <pre className="whitespace-pre-wrap text-base leading-8 rounded-lg border border-zinc-200 bg-white p-4">
                    {props.officialTextUsed}
                  </pre>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("meaningMode")}</div>
                  <pre className="whitespace-pre-wrap text-sm leading-6 rounded-lg border border-zinc-200 bg-white p-4">
                    {props.meaning || t("noData")}
                  </pre>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="meaning">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("summary")}</div>
                  {meaningSections.summary ? (
                    <pre className="whitespace-pre-wrap text-sm leading-6 rounded-lg border border-zinc-200 bg-white p-4">
                      {meaningSections.summary}
                    </pre>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("keyPoint")}</div>
                  {meaningSections.keyPoint ? (
                    <pre className="whitespace-pre-wrap text-sm leading-6 rounded-lg border border-zinc-200 bg-white p-4">
                      {meaningSections.keyPoint}
                    </pre>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("application")}</div>
                  {meaningSections.application ? (
                    <pre className="whitespace-pre-wrap text-sm leading-6 rounded-lg border border-zinc-200 bg-white p-4">
                      {meaningSections.application}
                    </pre>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="typing">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm text-zinc-600">
                    {t("reference")}: <span className="font-medium">{props.reference}</span>
                  </div>
                  <Textarea
                    value={typedText}
                    onChange={(e) => setTypedText(e.target.value)}
                    placeholder={t("typedTextPlaceholder")}
                    className="w-full text-base leading-7"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={onSubmitTyping} disabled={submitting || typedText.trim().length === 0}>
                    {submitting ? t("loading") : t("submit")}
                  </Button>
                  {grading ? (
                    <Button variant="outline" onClick={onRetry}>
                      {t("retry")}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() => setShowOfficial((v) => !v)}
                    disabled={!grading && !showOfficial}
                  >
                    {showOfficial ? t("hideOfficial") : t("showOfficial")}
                  </Button>
                </div>

                {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

                {grading ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="font-semibold">{t("submissionCompleted")}</div>
                      <div className="text-sm text-zinc-600">
                        {t("accuracy")}: <span className="font-medium">{grading.accuracyScore}%</span> ·{" "}
                        {grading.passed ? t("passed") : t("failed")}
                      </div>
                      <div className="text-sm text-zinc-600">
                        {t("submittedAt")}:{" "}
                        {grading.submittedAt ? new Date(grading.submittedAt).toLocaleString() : ""} ·{" "}
                        {t("userName")}: {grading.userName}
                      </div>
                    </div>

                    {showOfficial ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{t("officialText")}</div>
                        <MistakeHighlighter
                          diffTokens={grading.diffTokens}
                          expectedTokens={grading.expectedTokens}
                        />
                        <pre className="whitespace-pre-wrap text-sm leading-6 rounded-lg border border-zinc-200 bg-white p-4">
                          {grading.officialTextUsed}
                        </pre>
                      </div>
                    ) : null}

                    {grading.mistakeLogs.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{t("mistakes")}</div>
                        <div className="space-y-2">
                          {grading.mistakeLogs.map((m, idx) => (
                            <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3">
                              <div className="text-xs text-zinc-500">
                                {t("position")}: {m.position}
                              </div>
                              <div className="text-sm font-medium text-zinc-900">
                                {t("expected")}: {m.expected_text || ""}
                              </div>
                              <div className="text-sm text-zinc-700">
                                {t("actual")}: {m.actual_text || ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="focus">
              <div className="space-y-4">
                <div className="text-sm text-zinc-600">
                  {t("focusSegments")}:{" "}
                  {loadingFocus
                    ? t("loading")
                    : focusSegments.length
                      ? focusSegments.join(" / ")
                      : t("noMistakesYet")}
                </div>
                <Textarea
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder={t("typedTextPlaceholder")}
                  className="w-full text-base leading-7"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={onSubmitTyping}
                    disabled={submitting || typedText.trim().length === 0 || !officialFocusText}
                  >
                    {submitting ? t("loading") : t("submit")}
                  </Button>
                  {grading ? (
                    <Button variant="outline" onClick={onRetry}>
                      {t("retry")}
                    </Button>
                  ) : null}
                </div>

                {grading ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="font-semibold">{t("submissionCompleted")}</div>
                      <div className="text-sm text-zinc-600">
                        {t("accuracy")}: <span className="font-medium">{grading.accuracyScore}%</span> ·{" "}
                        {grading.passed ? t("passed") : t("failed")}
                      </div>
                      <div className="text-sm text-zinc-600">
                        {t("submittedAt")}:{" "}
                        {grading.submittedAt ? new Date(grading.submittedAt).toLocaleString() : ""} ·{" "}
                        {t("userName")}: {grading.userName}
                      </div>
                    </div>

                    {showOfficial ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{t("officialText")}</div>
                        <pre className="whitespace-pre-wrap text-sm leading-6 rounded-lg border border-zinc-200 bg-white p-4">
                          {grading.officialTextUsed}
                        </pre>
                        <MistakeHighlighter
                          diffTokens={grading.diffTokens}
                          expectedTokens={grading.expectedTokens}
                        />
                      </div>
                    ) : null}

                    {grading.mistakeLogs.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{t("mistakes")}</div>
                        <div className="space-y-2">
                          {grading.mistakeLogs.map((m, idx) => (
                            <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3">
                              <div className="text-xs text-zinc-500">
                                {t("position")}: {m.position}
                              </div>
                              <div className="text-sm font-medium text-zinc-900">
                                {t("expected")}: {m.expected_text || ""}
                              </div>
                              <div className="text-sm text-zinc-700">
                                {t("actual")}: {m.actual_text || ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

