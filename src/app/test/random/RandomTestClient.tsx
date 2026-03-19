"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {gradeSubmission} from "@/app/actions/gradeSubmission";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import MistakeHighlighter from "@/components/MistakeHighlighter";
import type {DiffToken} from "@/lib/grading/grading";

export default function RandomTestClient({
  assignmentId,
  reference,
  version,
}: {
  assignmentId: string;
  reference: string;
  version: string;
}) {
  const tRandom = useTranslations("randomTest");
  const tStudy = useTranslations("study");

  const [typedText, setTypedText] = useState("");
  const [grading, setGrading] = useState<null | {
    accuracyScore: number;
    passed: boolean;
    officialTextUsed: string;
    diffTokens: DiffToken[];
    expectedTokens: string[];
    mistakeLogs: {word_or_phrase: string; expected_text: string; actual_text: string; position: number}[];
    submittedAt: string;
    userName: string;
  }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startAtMs, setStartAtMs] = useState<number>(() => Date.now());

  const onSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const durationSeconds = Math.max(0, Math.round((Date.now() - startAtMs) / 1000));
      const res = await gradeSubmission({
        assignmentId,
        mode: "random",
        typedText,
        durationSeconds,
      });

      setGrading({
        accuracyScore: res.accuracyScore,
        passed: res.passed,
        officialTextUsed: res.officialTextUsed,
        diffTokens: res.diffTokens,
        expectedTokens: res.expectedTokens,
        mistakeLogs: res.mistakeLogs,
        submittedAt: res.submittedAt,
        userName: res.userName,
      });
    } catch {
      setSubmitError(tStudy("submitError"));
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
      <h1 className="text-2xl font-semibold">{tRandom("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <span>{reference}</span>
            <Badge>{version}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">{tRandom("typeOnlyReference")}</p>

          <Textarea
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder={tStudy("typedTextPlaceholder")}
            className="w-full text-base leading-7"
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={onSubmit} disabled={submitting || typedText.trim().length === 0}>
              {submitting ? tStudy("loading") : tStudy("submit")}
            </Button>
            {grading && !grading.passed ? (
              <Button variant="outline" onClick={onRetry}>
                {tStudy("retry")}
              </Button>
            ) : null}
          </div>

          {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

          {grading ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="font-semibold">{tStudy("submissionCompleted")}</div>
                <div className="text-sm text-zinc-600">
                  {tStudy("accuracy")}: <span className="font-medium">{grading.accuracyScore}%</span> ·{" "}
                  {grading.passed ? tStudy("passed") : tStudy("failed")}
                </div>
                <div className="text-sm text-zinc-600">
                  {tStudy("submittedAt")}:{" "}
                  {grading.submittedAt ? new Date(grading.submittedAt).toLocaleString() : ""} ·{" "}
                  {tStudy("userName")}: {grading.userName}
                </div>
              </div>

              {grading.passed ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white font-bold text-sm">
                      OK
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-emerald-900">
                        {tRandom("goodPassed")}
                      </div>
                      <div className="text-xs text-emerald-800/80">{tRandom("passedHint")}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-sm font-semibold text-red-800">{tRandom("belowThreshold")}</div>
                    <div className="text-xs text-red-700/80">{tRandom("retryHint")}</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">{tStudy("officialText")}</div>
                    <MistakeHighlighter diffTokens={grading.diffTokens} expectedTokens={grading.expectedTokens} />
                    <pre className="whitespace-pre-wrap text-sm leading-6 rounded-lg border border-zinc-200 bg-white p-4">
                      {grading.officialTextUsed}
                    </pre>
                  </div>

                  {grading.mistakeLogs.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">{tStudy("mistakes")}</div>
                      <div className="space-y-2">
                        {grading.mistakeLogs.map((m, idx) => (
                          <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3">
                            <div className="text-xs text-zinc-500">
                              {tStudy("position")}: {m.position}
                            </div>
                            <div className="text-sm font-medium text-zinc-900">
                              {tStudy("expected")}: {m.expected_text || ""}
                            </div>
                            <div className="text-sm text-zinc-700">
                              {tStudy("actual")}: {m.actual_text || ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

