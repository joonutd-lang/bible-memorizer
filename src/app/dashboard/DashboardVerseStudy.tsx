"use client";

import {useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {Textarea} from "@/components/ui/textarea";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import MistakeHighlighter from "@/components/MistakeHighlighter";
import LiveTokenHighlighter from "@/components/LiveTokenHighlighter";
import {gradeTexts, normalizeText, tokenizeText, type ScoringOptions, type DiffToken} from "@/lib/grading/grading";

type Verse = {
  reference: string;
  versions: Record<string, string>; // versionLabel -> fixedText
};

type Plan = {
  id: string;
  createdAt: string;
  selectedVersion: string;
  verses: Verse[];
  versionLabels: string[];
};

type Progress = {
  planId: string;
  currentIndex: number;
  selectedVersion: string;
  masteredByIndex: Record<string, boolean>;
};

const scoringDefaults: ScoringOptions = {
  caseSensitive: false,
  ignorePunctuation: true,
  collapseWhitespace: true,
  passThreshold: 80,
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(`${name}=`));
  if (!found) return null;
  return decodeURIComponent(found.split("=").slice(1).join("="));
}

function simpleHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

function cleanInputText(raw: string) {
  return (raw ?? "")
    .replace(/[\u202a-\u202e]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\u201c|\u201d/g, '"')
    .trim();
}

function parseVersesFromText(raw: string): {reference: string; fixedText: string}[] {
  const text = cleanInputText(raw);
  const numRe = /^\s*(\d+)\.\s*/gm;
  const starts: {index: number}[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = numRe.exec(text))) starts.push({index: match.index});

  if (starts.length === 0) {
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
    const afterNum = block.replace(/^\s*\d+\.\s*/m, "").trim();
    if (!afterNum) continue;

    // We assume the verse text is wrapped in quotes.
    // Example: 1. Matthew 7:12 "Do to others ..."
    const firstQuote = afterNum.indexOf('"');
    if (firstQuote === -1) continue;
    const lastQuote = afterNum.lastIndexOf('"');
    if (lastQuote <= firstQuote) continue;

    const reference = afterNum.slice(0, firstQuote).trim();
    let fixedText = afterNum.slice(firstQuote + 1, lastQuote).trim();
    fixedText = fixedText.replace(/\s+/g, " ").trim();
    if (!reference || !fixedText) continue;
    found.push({reference, fixedText});
  }
  return found;
}

export default function DashboardVerseStudy() {
  const t = useTranslations("dashboardVerseStudy");
  const tCommon = useTranslations("common");

  const localUserName = useMemo(() => getCookie("LOCAL_USER_NAME") ?? "", []);
  const storageKey = useMemo(() => `dashVerse:${localUserName}`, [localUserName]);

  const [mode, setMode] = useState<"paste" | "ai">("paste");
  const [rawInput, setRawInput] = useState("");
  const [references, setReferences] = useState("");
  const [versionLabel, setVersionLabel] = useState("BBTS 4");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [step, setStep] = useState<"read" | "typing" | "result">("read");

  const currentVerse = useMemo(() => {
    if (!plan || !progress) return null;
    return plan.verses[progress.currentIndex] ?? null;
  }, [plan, progress]);

  const currentOfficialText = useMemo(() => {
    if (!currentVerse || !progress) return "";
    const desired = progress.selectedVersion;
    return (
      currentVerse.versions[desired] ??
      currentVerse.versions[Object.keys(currentVerse.versions)[0] ?? ""] ??
      ""
    );
  }, [currentVerse, progress]);

  const isVerseMastered = (idx: number) => {
    if (!progress) return false;
    return Boolean(progress.masteredByIndex?.[String(idx)]);
  };

  const [typedText, setTypedText] = useState("");

  const [grading, setGrading] = useState<{
    accuracyScore: number;
    passed: boolean;
    diffTokens: DiffToken[];
    expectedTokens: string[];
    officialTextUsed: string;
  } | null>(null);

  useEffect(() => {
    if (!localUserName) return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        plan: Plan;
        progress: Progress;
        typedText?: string;
        step?: "read" | "typing" | "result";
      };
      if (parsed?.plan && parsed?.progress) {
        setPlan(parsed.plan);
        setProgress({
          ...parsed.progress,
          masteredByIndex: parsed.progress.masteredByIndex ?? {},
        });
        setTypedText(parsed.typedText ?? "");
        setStep(parsed.step ?? "read");
      }
    } catch {
      // ignore
    }
  }, [localUserName, storageKey]);

  useEffect(() => {
    if (!localUserName || !plan || !progress) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        plan,
        progress,
        typedText,
        step,
      }),
    );
  }, [localUserName, storageKey, plan, progress, typedText, step]);

  const onStart = (inputVersion: string) => {
    if (!rawInput.trim()) return;
    const parsed = parseVersesFromText(rawInput);
    if (!parsed.length) return;

    const chosenVersion = inputVersion.trim() || "Custom";

    const verses: Verse[] = parsed.map((p) => ({
      reference: p.reference,
      versions: {[chosenVersion]: p.fixedText},
    }));

    const planId = `dash-plan-${simpleHash(localUserName + "::" + verses.map((v) => v.reference).join("|"))}`;
    const nextPlan: Plan = {
      id: planId,
      createdAt: new Date().toISOString(),
      selectedVersion: chosenVersion,
      verses,
      versionLabels: [chosenVersion],
    };
    const nextProgress: Progress = {
      planId,
      currentIndex: 0,
      selectedVersion: chosenVersion,
      masteredByIndex: {},
    };
    setPlan(nextPlan);
    setProgress(nextProgress);
    setStep("read");
    setTypedText("");
    setGrading(null);
  };

  const onFetchWithAI = async () => {
    setAiError(null);
    setAiBusy(true);
    try {
      const v = versionLabel.trim();
      const allowed = ["KJV", "NIV", "개역개정", "개역한글"];
      if (!allowed.includes(v)) {
        setAiError(t("aiVersionNotSupported"));
        return;
      }
      const refs = references
        .split(/\r?\n/g)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!refs.length) {
        setAiError(t("aiReferencesRequired"));
        return;
      }

      const res = await fetch("/api/ai/verses", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({references: refs, version: v}),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `AI request failed (${res.status})`);
      }

      const json = (await res.json()) as {verses: {reference: string; text: string}[]};
      const verses = json.verses ?? [];
      if (!verses.length) {
        setAiError(t("aiNoResults"));
        return;
      }

      const generatedRaw = verses
        .map((vr, idx) => {
          const reference = (vr.reference ?? "").trim();
          const text = (vr.text ?? "").trim();
          return `${idx + 1}. ${reference} "${text}"`;
        })
        .join("\n");

      setRawInput(generatedRaw);
      setMode("paste");
      setAiError(null);
      // Start automatically
      if (generatedRaw.trim()) {
        // Ensure state is updated before start is called
        setTimeout(() => onStart(v), 0);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
    } finally {
      setAiBusy(false);
    }
  };

  const normalizeVerseRef = (ref: string) => ref.trim().replace(/\s+/g, " ");

  const ensurePlanVersionLoaded = async (targetVersion: string) => {
    if (!plan || !progress) return;
    const alreadyLoaded = plan.verses.every((v) => Boolean(v.versions[targetVersion]));
    if (alreadyLoaded) {
      setProgress({...progress, selectedVersion: targetVersion});
      setTypedText("");
      setGrading(null);
      setStep("read");
      return;
    }

    setAiError(null);
    setAiBusy(true);
    try {
      const refs = plan.verses.map((v) => v.reference);

      const res = await fetch("/api/ai/verses", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({references: refs, version: targetVersion}),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `AI request failed (${res.status})`);
      }

      const json = (await res.json()) as {verses: {reference: string; text: string}[]};
      const aiVerses = json.verses ?? [];

      const byRef = new Map<string, string>();
      for (const v of aiVerses) {
        const refKey = normalizeVerseRef(v.reference ?? "");
        if (!refKey) continue;
        byRef.set(refKey, (v.text ?? "").trim());
      }

      const nextVerses = plan.verses.map((verse, idx) => {
        const aiTextByRef = byRef.get(normalizeVerseRef(verse.reference));
        const aiTextByIdx = (aiVerses[idx]?.text ?? "").trim();
        const nextText = aiTextByRef ?? aiTextByIdx;
        if (!nextText) return verse;
        return {
          ...verse,
          versions: {
            ...verse.versions,
            [targetVersion]: nextText,
          },
        };
      });

      setPlan({
        ...plan,
        verses: nextVerses,
        versionLabels: Array.from(new Set([...plan.versionLabels, targetVersion])),
      });
      setProgress({...progress, selectedVersion: targetVersion});
      setTypedText("");
      setGrading(null);
      setStep("read");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
    } finally {
      setAiBusy(false);
    }
  };

  const buildPlanIdFromParsed = (parsed: {reference: string}[]) =>
    `dash-plan-${simpleHash(localUserName + "::" + parsed.map((p) => normalizeVerseRef(p.reference)).join("|"))}`;

  const generateVersionsFromPaste = async (targetVersions: string[], selectVersion?: string) => {
    if (!localUserName) return;
    const input = rawInput.trim();
    if (!input) return;

    const parsed = parseVersesFromText(input);
    if (!parsed.length) {
      setAiError(t("aiNoResults"));
      return;
    }

    const inputVersion = versionLabel.trim() || "BBTS 4";
    const planId = buildPlanIdFromParsed(parsed);

    const existingProgress =
      progress && progress.planId === planId ? progress : null;
    const masteredByIndex = existingProgress?.masteredByIndex ?? {};
    const currentIndex = existingProgress?.currentIndex ?? 0;

    const baseVerses: Verse[] = parsed.map((p) => ({
      reference: p.reference,
      versions: {[inputVersion]: p.fixedText},
    }));

    let nextPlan: Plan = {
      id: planId,
      createdAt: new Date().toISOString(),
      selectedVersion: existingProgress?.selectedVersion ?? inputVersion,
      verses: baseVerses,
      versionLabels: Array.from(new Set([inputVersion, ...targetVersions])),
    };

    setAiError(null);
    setAiBusy(true);
    try {
      for (const targetVersion of targetVersions) {
        const allHave = nextPlan.verses.every((v) => Boolean(v.versions[targetVersion]));
        if (allHave) continue;

        const res = await fetch("/api/ai/verses", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            references: parsed.map((p) => p.reference),
            version: targetVersion,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `AI request failed (${res.status})`);
        }

        const json = (await res.json()) as {verses: {reference: string; text: string}[]};
        const aiVerses = json.verses ?? [];

        const byRef = new Map<string, string>();
        for (const v of aiVerses) {
          const refKey = normalizeVerseRef(v.reference ?? "");
          if (!refKey) continue;
          byRef.set(refKey, (v.text ?? "").trim());
        }

        nextPlan = {
          ...nextPlan,
          verses: nextPlan.verses.map((verse) => {
            const key = normalizeVerseRef(verse.reference);
            const nextText = byRef.get(key);
            if (!nextText) return verse;
            return {
              ...verse,
              versions: {...verse.versions, [targetVersion]: nextText},
            };
          }),
        };
      }

      setPlan(nextPlan);
      setProgress({
        planId,
        currentIndex,
        selectedVersion: selectVersion ?? nextPlan.selectedVersion,
        masteredByIndex,
      });
      setStep("read");
      setTypedText("");
      setGrading(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
    } finally {
      setAiBusy(false);
    }
  };

  const expectedTokens = useMemo(() => {
    const normalizedOfficial = normalizeText(currentOfficialText, scoringDefaults);
    return tokenizeText(normalizedOfficial);
  }, [currentOfficialText]);

  const actualTokens = useMemo(() => {
    const normalizedTyped = normalizeText(typedText, scoringDefaults);
    return tokenizeText(normalizedTyped);
  }, [typedText]);

  const onSubmitTyping = () => {
    if (!currentVerse || !progress) return;
    const result = gradeTexts({
      officialTextUsed: currentOfficialText,
      typedText,
      scoring: scoringDefaults,
    });
    setGrading({
      accuracyScore: result.accuracyScore,
      passed: result.passed,
      diffTokens: result.diffTokens,
      expectedTokens: result.expectedTokens,
      officialTextUsed: result.officialTextUsed,
    });
    if (result.passed) {
      setProgress((prev) => {
        if (!prev) return prev;
        const key = String(prev.currentIndex);
        return {
          ...prev,
          masteredByIndex: {...prev.masteredByIndex, [key]: true},
        };
      });
    }
    setStep("result");
  };

  const onNext = () => {
    if (!plan || !progress) return;
    const nextIndex = progress.currentIndex + 1;
    if (nextIndex >= plan.verses.length) return;
    setProgress({...progress, currentIndex: nextIndex});
    setTypedText("");
    setGrading(null);
    setStep("read");
  };

  const supportedVersions = ["KJV", "NIV", "개역개정", "개역한글", "BBTS 4", "Custom"];
  const autoGenerateTargets = ["개역한글", "개역개정", "KJV", "NIV"] as const;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
            <span>{t("title")}</span>
            {plan && progress ? (
              <Badge variant="secondary">
                {t("progress")} {progress.currentIndex + 1}/{plan.verses.length}
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={mode === "paste" ? "default" : "outline"}
              onClick={() => {
                setMode("paste");
                setAiError(null);
              }}
            >
              {t("modePaste")}
            </Button>
            <Button
              type="button"
              variant={mode === "ai" ? "default" : "outline"}
              onClick={() => {
                setMode("ai");
                setAiError(null);
              }}
            >
              {t("modeAI")}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-zinc-700">{t("versionLabel")}</div>
            <select
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              className="w-full border border-zinc-200 rounded-md px-2 py-2 text-sm bg-white"
            >
              {supportedVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {mode === "paste" ? (
            <div className="space-y-2">
              <div className="text-sm text-zinc-700">{t("pasteLabel")}</div>
              <Textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={t("pastePlaceholder")}
                className="min-h-[180px]"
              />

              <div className="space-y-2">
                <div className="text-sm text-zinc-700">{t("autoGenerateFromPaste")}</div>
                <div className="flex flex-wrap gap-2">
                  {autoGenerateTargets.map((v) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void generateVersionsFromPaste([v], v)}
                      disabled={!rawInput.trim() || aiBusy}
                    >
                      {t("generateVersion", {version: v})}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void generateVersionsFromPaste([...autoGenerateTargets], autoGenerateTargets[0])}
                  disabled={!rawInput.trim() || aiBusy}
                >
                  {t("generateAllVersions")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-zinc-700">{t("aiReferencesLabel")}</div>
              <Textarea
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                placeholder={t("aiReferencesPlaceholder")}
                className="min-h-[180px]"
              />
              {aiError ? <p className="text-sm text-red-600">{aiError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onFetchWithAI} disabled={!references.trim() || aiBusy}>
                  {aiBusy ? tCommon("loading") : t("fetchViaAI")}
                </Button>
              </div>
            </div>
          )}

          {mode === "paste" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => onStart(versionLabel)} disabled={!rawInput.trim()}>
                {t("parseAndStart")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {plan && progress && currentVerse ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
              <span>
                {progress.currentIndex + 1}. {currentVerse.reference}
              </span>
              <div className="flex items-center gap-2">
                {isVerseMastered(progress.currentIndex) ? (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-800 border border-emerald-400 font-semibold text-xs">
                    OK
                  </span>
                ) : null}
                <Badge>{progress.selectedVersion}</Badge>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm text-zinc-600">{t("learnVersionLabel")}</div>
              <div className="flex flex-wrap gap-2">
                {(["개역한글", "개역개정", "KJV", "NIV"] as const).map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={progress.selectedVersion === v ? "default" : "outline"}
                    onClick={() => void ensurePlanVersionLoaded(v)}
                    disabled={aiBusy}
                  >
                    {v}
                  </Button>
                ))}
              </div>
              {aiError ? <p className="text-sm text-red-600">{aiError}</p> : null}
            </div>

            {step === "read" ? (
              <div className="space-y-3">
                <div className="text-sm text-zinc-600">{t("stepRead")}</div>
                <pre className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-4 text-base leading-7">
                  {currentOfficialText}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => setStep("typing")}>
                    {t("startTyping")}
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "typing" ? (
              <div className="space-y-3">
                <div className="text-sm text-zinc-600">{t("stepTyping")}</div>
                <LiveTokenHighlighter expectedTokens={expectedTokens} actualTokens={actualTokens} />
                <Textarea
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder={t("typedPlaceholder")}
                  className="min-h-[120px]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={onSubmitTyping} disabled={typedText.trim().length === 0}>
                    {t("submit")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setStep("read")}>
                    {t("backToRead")}
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "result" && grading ? (
              <div className="space-y-4">
                <div className="text-sm text-zinc-700">
                  {t("resultAccuracy")} <span className="font-semibold">{grading.accuracyScore}%</span> ·{" "}
                  <span className={grading.passed ? "text-emerald-800" : "text-red-700 font-medium"}>
                    {grading.passed ? t("passed") : t("failed")}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("mistakes")}</div>
                  <MistakeHighlighter diffTokens={grading.diffTokens} expectedTokens={grading.expectedTokens} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={onNext} disabled={progress.currentIndex + 1 >= plan.verses.length}>
                    {progress.currentIndex + 1 < plan.verses.length ? t("nextVerse") : t("finish")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setStep("typing")}>
                    {t("retry")}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {plan && progress ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("learningToolsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {plan.verses.map((v, idx) => {
                const mastered = isVerseMastered(idx);
                const isCurrent = idx === progress.currentIndex;
                return (
                  <div
                    key={`${v.reference}:${idx}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200/70 p-3"
                  >
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <span
                        className={[
                          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                          mastered
                            ? "bg-emerald-500/20 text-emerald-800 border-emerald-400"
                            : "bg-zinc-100 text-zinc-600 border-zinc-300",
                        ].join(" ")}
                      >
                        {mastered ? "OK" : idx + 1}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{v.reference}</div>
                        <div className="text-xs text-zinc-600">
                          {mastered ? t("mastered") : t("studyThisVerse")}
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={isCurrent ? "default" : "outline"}
                      onClick={() => {
                        setProgress({...progress, currentIndex: idx});
                        setTypedText("");
                        setGrading(null);
                        setStep("read");
                      }}
                    >
                      {isCurrent ? t("studyThisVerse") : t("openVerse")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

