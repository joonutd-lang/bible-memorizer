"use client";

import {useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import Link from "next/link";
import {gradeTexts} from "@/lib/grading/grading";
import MistakeHighlighter from "@/components/MistakeHighlighter";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";

type Verse = {
  id: string;
  reference: string;
  versions: Record<string, string>; // versionLabel -> fixedText
};

type BatchPlan = {
  id: string;
  createdAt: string;
  importedAt: string;
  verses: Verse[];
  versionLabels: string[];
};

type VerseProgress = {
  lastAccuracyScore?: number;
  lastPassed?: boolean;
  lastSubmittedAt?: string;
  lastTypedText?: string;
  lastOfficialTextUsed?: string;
  // For rendering result diff (optional)
  diffTokens?: any[];
  expectedTokens?: string[];
};

type BatchProgress = {
  planId: string;
  currentIndex: number;
  selectedVersion: string;
  verseProgress: Record<string, VerseProgress>;
  updatedAt: string;
};

const STORAGE_PREFIX = "batchStudy:";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(`${name}=`));
  if (!found) return null;
  return decodeURIComponent(found.split("=").slice(1).join("="));
}

function stableVerseId(reference: string): string {
  // Avoid importing crypto in the browser; stable id from reference.
  return reference.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

function cleanInputText(raw: string) {
  return (raw ?? "")
    .replace(/[\u202a-\u202e]/g, "") // direction marks
    .replace(/\r\n/g, "\n")
    .replace(/\u201c|\u201d/g, '"')
    .trim();
}

function parseVersesFromText(raw: string) {
  const text = cleanInputText(raw);

  // Robust-ish parser:
  // - Each verse entry starts with a line that begins with `n.`
  // - Inside each block, the first `"` is treated as start of verse text
  // - Verse text runs until the end of the block (next `n.` or end-of-input)
  // This avoids breaking on nested quotes inside the verse.
  const numRe = /^\s*(\d+)\.\s*/gm;
  const starts: {index: number; num: string}[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = numRe.exec(text))) {
    starts.push({index: match.index, num: match[1]});
  }

  if (starts.length === 0) {
    // Fall back to a looser match of quoted strings.
    const reLoose = /"([^"]+)"\s*/g;
    const quotes = Array.from(text.matchAll(reLoose))
      .map((x) => x[1]?.trim())
      .filter(Boolean);
    return quotes.map((q, idx) => ({reference: `Verse ${idx + 1}`, fixedText: q}));
  }

  const found: {reference: string; fixedText: string}[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const end = i + 1 < starts.length ? starts[i + 1]!.index : text.length;
    const block = text.slice(start.index, end).trim();

    // Remove the leading `n.` prefix.
    const afterNum = block.replace(/^\s*\d+\.\s*/m, "").trim();
    if (!afterNum) continue;

    const firstQuote = afterNum.indexOf('"');
    if (firstQuote === -1) continue;

    const reference = afterNum.slice(0, firstQuote).trim();
    let fixedText = afterNum.slice(firstQuote + 1).trim();

    // Trim trailing quote(s) if present (some pasted lists include ending smart quotes).
    fixedText = fixedText.replace(/"+$/g, "").trim();

    if (!reference || !fixedText) continue;
    found.push({reference, fixedText});
  }

  return found;
}

function computePlanId(userId: string, referenceText: string) {
  // Stable string id for localStorage. Keep it short.
  const base = `${userId}::${referenceText}`.slice(0, 2000);
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  return `plan-${hash.toString(16)}`;
}

export default function BatchStudyPage() {
  const tApp = useTranslations("batchStudy");
  const tCommon = useTranslations("common");

  const localUserName = useMemo(() => getCookie("LOCAL_USER_NAME") ?? "", []);
  const storageKeyPlan = `${STORAGE_PREFIX}plan:${localUserName}`;
  const storageKeyProgress = `${STORAGE_PREFIX}progress:${localUserName}`;

  const [rawInput, setRawInput] = useState("");
  const [versionLabel, setVersionLabel] = useState("BBTS 4");

  const [plan, setPlan] = useState<BatchPlan | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);

  const [step, setStep] = useState<"import" | "read" | "typing" | "result">("import");
  const [typedText, setTypedText] = useState("");
  const [gradingResult, setGradingResult] = useState<{
    accuracyScore: number;
    passed: boolean;
    diffTokens: any[];
    expectedTokens: string[];
    mistakeLogs: any[];
    officialTextUsed: string;
    normalizedOfficial: string;
    normalizedTyped: string;
  } | null>(null);

  const scoringDefaults = useMemo(
    () => ({
      caseSensitive: false,
      ignorePunctuation: true,
      collapseWhitespace: true,
      passThreshold: 80,
    }),
    [],
  );

  useEffect(() => {
    if (!localUserName) return;

    const storedPlan = localStorage.getItem(storageKeyPlan);
    const storedProgress = localStorage.getItem(storageKeyProgress);

    if (storedPlan) {
      try {
        setPlan(JSON.parse(storedPlan) as BatchPlan);
      } catch {
        // ignore
      }
    }

    if (storedProgress) {
      try {
        setProgress(JSON.parse(storedProgress) as BatchProgress);
      } catch {
        // ignore
      }
    }
  }, [localUserName, storageKeyPlan, storageKeyProgress]);

  useEffect(() => {
    if (!localUserName) return;
    if (!plan || !progress) return;
    localStorage.setItem(storageKeyPlan, JSON.stringify(plan));
    localStorage.setItem(storageKeyProgress, JSON.stringify(progress));
  }, [localUserName, plan, progress, storageKeyPlan, storageKeyProgress]);

  const currentVerse: Verse | null = useMemo(() => {
    if (!plan || !progress) return null;
    return plan.verses[progress.currentIndex] ?? null;
  }, [plan, progress]);

  const currentOfficialText = useMemo(() => {
    if (!currentVerse || !progress) return "";
    const desired = progress.selectedVersion;
    return currentVerse.versions[desired] ?? currentVerse.versions[Object.keys(currentVerse.versions)[0] ?? ""] ?? "";
  }, [currentVerse, progress]);

  const supportedVersions = useMemo(() => plan?.versionLabels ?? [versionLabel], [plan, versionLabel]);

  const availableVersionOptions = useMemo(() => {
    const base = ["KJV", "NIV", "개역개정", "개역한글", "BBTS 4", "ESV", "NRSV", "Custom"];
    return base;
  }, []);

  const onStartImport = () => {
    if (!rawInput.trim()) return;
    const parsed = parseVersesFromText(rawInput);
    if (!parsed || parsed.length === 0) return;

    const version = versionLabel.trim() || "Custom";

    const verseMap = new Map<string, Verse>();
    for (const p of parsed) {
      const reference = p.reference.trim();
      const id = stableVerseId(reference);
      const existing = verseMap.get(id);
      if (!existing) {
        verseMap.set(id, {id, reference, versions: {[version]: p.fixedText}});
      } else {
        existing.versions[version] = p.fixedText;
      }
    }

    const planId = computePlanId(localUserName || "anon", JSON.stringify(parsed.map((x) => x.reference)).slice(0, 1000));
    // Merge into existing plan (so re-importing a different version keeps the list + progress).
    if (plan && plan.id === planId) {
      const existingVerseMap = new Map(plan.verses.map((v) => [v.id, v] as const));
      for (const v of verseMap.values()) {
        const existing = existingVerseMap.get(v.id);
        if (existing) {
          existing.reference = v.reference;
          existing.versions[version] = v.versions[version];
        } else {
          existingVerseMap.set(v.id, v);
        }
      }

      const mergedVerses = Array.from(existingVerseMap.values());
      const versionLabels = Array.from(new Set(mergedVerses.flatMap((v) => Object.keys(v.versions))));

      const mergedPlan: BatchPlan = {
        ...plan,
        importedAt: new Date().toISOString(),
        verses: mergedVerses,
        versionLabels,
      };

      setPlan(mergedPlan);
      if (progress && progress.planId === planId) {
        setProgress({
          ...progress,
          selectedVersion: version,
          currentIndex: Math.min(progress.currentIndex, Math.max(0, mergedVerses.length - 1)),
          updatedAt: new Date().toISOString(),
        });
      } else {
        setProgress({
          planId: mergedPlan.id,
          currentIndex: 0,
          selectedVersion: version,
          verseProgress: {},
          updatedAt: new Date().toISOString(),
        });
      }

      setStep("read");
      setTypedText("");
      setGradingResult(null);
      return;
    }

    const verses = Array.from(verseMap.values());
    const versionLabels = Array.from(new Set(verses.flatMap((v) => Object.keys(v.versions)).filter(Boolean)));

    const newPlan: BatchPlan = {
      id: planId,
      createdAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
      verses,
      versionLabels,
    };

    const newProgress: BatchProgress = {
      planId: newPlan.id,
      currentIndex: 0,
      selectedVersion: version,
      verseProgress: {},
      updatedAt: new Date().toISOString(),
    };

    setPlan(newPlan);
    setProgress(newProgress);
    setStep("read");
    setTypedText("");
    setGradingResult(null);
  };

  const onResume = () => {
    if (!plan || !progress) return;
    setStep("read");
    setTypedText(progress.verseProgress[plan.verses[progress.currentIndex]?.id ?? ""]?.lastTypedText ?? "");
    setGradingResult(null);
  };

  const onChangeSelectedVersion = (v: string) => {
    if (!progress) return;
    setProgress({
      ...progress,
      selectedVersion: v,
      updatedAt: new Date().toISOString(),
    });
    setStep("read");
    setTypedText("");
    setGradingResult(null);
  };

  const onSubmitTyping = () => {
    if (!currentVerse || !progress) return;
    const officialTextUsed = currentOfficialText;
    const typed = typedText ?? "";

    const result = gradeTexts({
      officialTextUsed,
      typedText: typed,
      scoring: scoringDefaults,
    });

    setGradingResult({
      accuracyScore: result.accuracyScore,
      passed: result.passed,
      diffTokens: result.diffTokens,
      expectedTokens: result.expectedTokens,
      mistakeLogs: result.mistakeLogs,
      officialTextUsed: result.officialTextUsed,
      normalizedOfficial: result.normalizedOfficial,
      normalizedTyped: result.normalizedTyped,
    });

    setProgress((prev) => {
      if (!prev) return prev;
      const verseId = currentVerse.id;
      const nextVerseProgress: VerseProgress = {
        lastAccuracyScore: result.accuracyScore,
        lastPassed: result.passed,
        lastSubmittedAt: new Date().toISOString(),
        lastTypedText: typed,
        lastOfficialTextUsed: officialTextUsed,
        diffTokens: result.diffTokens,
        expectedTokens: result.expectedTokens,
      };
      return {
        ...prev,
        verseProgress: {
          ...prev.verseProgress,
          [verseId]: nextVerseProgress,
        },
        updatedAt: new Date().toISOString(),
      };
    });

    setStep("result");
  };

  const onNextVerse = () => {
    if (!plan || !progress) return;
    const nextIndex = progress.currentIndex + 1;
    if (nextIndex >= plan.verses.length) {
      // Finished: keep result screen but clamp index.
      return;
    }
    setProgress({
      ...progress,
      currentIndex: nextIndex,
      updatedAt: new Date().toISOString(),
    });
    setStep("read");
    setTypedText("");
    setGradingResult(null);
  };

  const onRetryTyping = () => {
    setStep("typing");
    setTypedText("");
    setGradingResult(null);
  };

  if (!localUserName) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">{tApp("title")}</h1>
        <p className="text-sm text-zinc-600">{tApp("loginRequired")}</p>
        <Link href="/login" className="text-sm text-zinc-900 underline">
          {tApp("goLogin")}
        </Link>
      </div>
    );
  }

  if (plan && progress && plan.id === progress.planId && step === "import") {
    // If stored progress exists, start with resume actions.
    // (step defaults to import; we treat "resume" button as the entry)
  }

  const showResumePanel = Boolean(plan && progress && plan.id === progress.planId);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{tApp("title")}</h1>
          <p className="text-sm text-zinc-600 mt-1">{tApp("subtitle")}</p>
        </div>

        {plan ? (
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary">
              {tApp("progress")} {progress?.currentIndex !== undefined ? progress.currentIndex + 1 : 1}/{plan.verses.length}
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-600">{tApp("version")}</span>
              <select
                value={progress?.selectedVersion ?? versionLabel}
                onChange={(e) => onChangeSelectedVersion(e.target.value)}
                className="border border-zinc-200 rounded-md px-2 py-1 text-sm bg-white"
              >
                {supportedVersions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      {step === "import" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{tApp("importTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm text-zinc-700">{tApp("versionLabel")}</div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    className="border border-zinc-200 rounded-md px-2 py-1 text-sm bg-white"
                  >
                    {availableVersionOptions.map((v) => (
                      <option key={v} value={v === "Custom" ? "Custom" : v}>
                        {v === "Custom" ? tApp("custom") : v}
                      </option>
                    ))}
                  </select>

                  {versionLabel === "Custom" ? <InputVersion onChange={setVersionLabel} tApp={tApp} /> : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-zinc-700">{tApp("pasteLabel")}</div>
                <Textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={tApp("pastePlaceholder")}
                  className="min-h-[280px]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={onStartImport} disabled={!rawInput.trim()}>
                  {tApp("parseAndStart")}
                </Button>
                {showResumePanel ? (
                  <Button variant="outline" onClick={onResume}>
                    {tApp("resume")}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tApp("exampleTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-700">
              <p>{tApp("exampleHint")}</p>
              <div className="rounded-lg border border-zinc-200 bg-white p-3 whitespace-pre-wrap">
                {tApp("exampleContent")}
              </div>
              {showResumePanel ? (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2">
                  {tApp("resumeAvailable")}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step !== "import" && plan && progress && currentVerse ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>{tApp("verseList")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {plan.verses.map((v, idx) => {
                  const isCurrent = idx === progress.currentIndex;
                  const vp = progress.verseProgress[v.id];
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setProgress({
                          ...progress,
                          currentIndex: idx,
                          updatedAt: new Date().toISOString(),
                        });
                        setStep("read");
                        setTypedText("");
                        setGradingResult(null);
                      }}
                      className={[
                        "w-full text-left rounded-lg border px-3 py-2",
                        isCurrent ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {idx + 1}. {v.reference}
                        </span>
                      </div>
                      {vp?.lastAccuracyScore !== undefined ? (
                        <div className="text-xs mt-1 opacity-80">
                          {tApp("lastAccuracy")} {Math.round(vp.lastAccuracyScore)}%
                        </div>
                      ) : (
                        <div className="text-xs mt-1 opacity-60">{tApp("notStarted")}</div>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    {progress.currentIndex + 1}. {currentVerse.reference}
                  </span>
                  <Badge>{progress.selectedVersion}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {step === "read" ? (
                  <div className="space-y-3">
                    <div className="text-sm text-zinc-600">{tApp("stepRead")}</div>
                    <pre className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-4 text-base leading-7">
                      {currentOfficialText}
                    </pre>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setStep("typing")}>{tApp("startTyping")}</Button>
                      <Button variant="outline" onClick={() => setStep("read")}>
                        {tApp("showOfficial")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {step === "typing" ? (
                  <div className="space-y-3">
                    <div className="text-sm text-zinc-600">{tApp("stepTyping")}</div>
                    <Textarea
                      value={typedText}
                      onChange={(e) => setTypedText(e.target.value)}
                      placeholder={tApp("typedPlaceholder")}
                      className="min-h-[160px]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={onSubmitTyping} disabled={typedText.trim().length === 0}>
                        {tApp("submit")}
                      </Button>
                      <Button variant="outline" onClick={() => setStep("read")}>
                        {tApp("backToRead")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {step === "result" ? (
                  <div className="space-y-4">
                    <div className="text-sm text-zinc-700">
                      {tApp("resultAccuracy")}{" "}
                      <span className="font-semibold">{gradingResult?.accuracyScore ?? 0}%</span>{" "}
                      ·{" "}
                      <span className={gradingResult?.passed ? "text-emerald-800" : "text-red-700 font-medium"}>
                        {gradingResult?.passed ? tApp("passed") : tApp("failed")}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium text-zinc-900">{tApp("mistakes")}</div>
                      {gradingResult ? (
                        <MistakeHighlighter diffTokens={gradingResult.diffTokens} expectedTokens={gradingResult.expectedTokens} />
                      ) : null}
                    </div>

                    <details className="rounded-lg border border-zinc-200 bg-white p-3">
                      <summary className="cursor-pointer text-sm font-medium">{tApp("showTexts")}</summary>
                      <div className="space-y-2 mt-3 text-sm">
                        <div>
                          <div className="text-xs text-zinc-500">{tApp("officialText")}</div>
                          <pre className="whitespace-pre-wrap text-sm leading-6">{currentOfficialText}</pre>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">{tApp("typedText")}</div>
                          <pre className="whitespace-pre-wrap text-sm leading-6">{typedText || progress.verseProgress[currentVerse.id]?.lastTypedText || ""}</pre>
                        </div>
                      </div>
                    </details>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={onNextVerse}>
                        {progress.currentIndex + 1 < plan.verses.length ? tApp("nextVerse") : tApp("finish")}
                      </Button>
                      <Button variant="outline" onClick={onRetryTyping}>
                        {tApp("retry")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setStep("import");
                        }}
                      >
                        {tApp("importNew")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InputVersion({
  onChange,
  tApp,
}: {
  onChange: (v: string) => void;
  tApp: (key: string) => string;
}) {
  // Placeholder-only input for custom version label
  // (keeps the main page simpler).
  const [custom, setCustom] = useState("");

  return (
    <input
      className="border border-zinc-200 rounded-md px-2 py-1 text-sm bg-white"
      value={custom}
      onChange={(e) => {
        const v = e.target.value;
        setCustom(v);
        if (v.trim()) onChange(v.trim());
      }}
      placeholder={tApp("customPlaceholder")}
    />
  );
}

