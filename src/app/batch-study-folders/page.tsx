"use client";

import {useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import Link from "next/link";
import {gradeTexts} from "@/lib/grading/grading";
import MistakeHighlighter from "@/components/MistakeHighlighter";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
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
  folderId: string;
  verses: Verse[];
  versionLabels: string[];
};

type VerseProgress = {
  lastAccuracyScore?: number;
  lastPassed?: boolean;
  lastSubmittedAt?: string;
  lastTypedText?: string;
  lastOfficialTextUsed?: string;
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

type SemesterMeta = {
  id: string;
  name: string;
  category: "homework" | "memorization";
  createdAt: string;
};

const STORAGE_PREFIX = "batchStudyFolders:";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(`${name}=`));
  if (!found) return null;
  return decodeURIComponent(found.split("=").slice(1).join("="));
}

function stableVerseId(reference: string): string {
  // Avoid importing crypto in the browser.
  return reference.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

function cleanInputText(raw: string) {
  return (raw ?? "")
    .replace(/[\u202a-\u202e]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\u201c|\u201d/g, '"')
    .trim();
}

function parseVersesFromText(raw: string) {
  const text = cleanInputText(raw);

  const numRe = /^\s*(\d+)\.\s*/gm;
  const starts: {index: number}[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = numRe.exec(text))) {
    starts.push({index: match.index});
  }

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

    const firstQuote = afterNum.indexOf('"');
    if (firstQuote === -1) continue;

    const reference = afterNum.slice(0, firstQuote).trim();
    let fixedText = afterNum.slice(firstQuote + 1).trim();
    fixedText = fixedText.replace(/"+$/g, "").trim();

    if (!reference || !fixedText) continue;
    found.push({reference, fixedText});
  }
  return found;
}

function simpleHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function computeSetId(userId: string, folderId: string, referenceList: string[]) {
  const refKey = referenceList.map((r) => r.trim()).join("|").slice(0, 2000);
  return `set-${simpleHash(`${userId}::${folderId}::${refKey}`)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function BatchStudyFoldersPage() {
  const tFolders = useTranslations("batchStudyFolders");
  const tApp = useTranslations("batchStudy");
  const tCommon = useTranslations("common");

  const localUserName = useMemo(() => getCookie("LOCAL_USER_NAME") ?? "", []);

  const [kvEnabled, setKvEnabled] = useState<boolean | null>(null);

  const indexKey = useMemo(() => `${STORAGE_PREFIX}index:${localUserName}`, [localUserName]);
  const planKey = (planId: string) => `${STORAGE_PREFIX}plan:${localUserName}:${planId}`;
  const progressKey = (planId: string) => `${STORAGE_PREFIX}progress:${localUserName}:${planId}`;

  const [index, setIndex] = useState<{
    semesters: SemesterMeta[];
    setsBySemester: Record<string, string[]>;
  }>({semesters: [], setsBySemester: {}});

  const [semesterName, setSemesterName] = useState("");
  const [semesterCategory, setSemesterCategory] = useState<"homework" | "memorization">("memorization");
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);

  const [step, setStep] = useState<"import" | "read" | "typing" | "result">("import");
  const [rawInput, setRawInput] = useState("");
  const [importMode, setImportMode] = useState<"paste" | "ai">("paste");
  const [aiReferences, setAiReferences] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [versionLabel, setVersionLabel] = useState("BBTS 4");
  const [customVersion, setCustomVersion] = useState("");
  const [plan, setPlan] = useState<BatchPlan | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);

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
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/kv/batch/status");
        const json = (await res.json()) as {enabled: boolean};
        if (!cancelled) setKvEnabled(Boolean(json?.enabled));
      } catch {
        if (!cancelled) setKvEnabled(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [localUserName]);

  const kvCall = async (action: any, data: any = {}) => {
    const res = await fetch("/api/kv/batch/study", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        action,
        name: localUserName,
        ...data,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as any;
    if (!json?.ok && json?.error) throw new Error(json.error);
    return json;
  };

  const persistIndex = async (nextIndex: typeof index) => {
    if (kvEnabled) {
      await kvCall("index_set", {index: nextIndex});
      return;
    }
    writeJson(indexKey, nextIndex);
  };

  const persistPlan = async (setId: string, nextPlan: BatchPlan | null) => {
    if (kvEnabled) {
      await kvCall("plan_set", {setId, plan: nextPlan});
      return;
    }
    localStorage.setItem(planKey(setId), JSON.stringify(nextPlan));
  };

  const persistProgress = async (setId: string, nextProgress: BatchProgress | null) => {
    if (kvEnabled) {
      await kvCall("progress_set", {setId, progress: nextProgress});
      return;
    }
    localStorage.setItem(progressKey(setId), JSON.stringify(nextProgress));
  };

  useEffect(() => {
    if (!localUserName) return;
    if (kvEnabled === null) return;

    let cancelled = false;

    const run = async () => {
      const fallback: typeof index = {semesters: [], setsBySemester: {}};

      let loaded: typeof index = fallback;
      if (kvEnabled) {
        const res = await kvCall("index_get");
        loaded = (res?.index ?? fallback) as typeof index;
      } else {
        loaded = readJson(indexKey, fallback);
      }

      if (cancelled) return;
      setIndex(loaded);
      const firstSemester = loaded.semesters.length > 0 ? loaded.semesters[0] : null;
      setSelectedSemesterId((prev) => prev ?? (firstSemester ? firstSemester.id : null));
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [indexKey, localUserName, kvEnabled]);

  useEffect(() => {
    if (!localUserName) return;
    if (kvEnabled === null) return;
    void persistIndex(index);
  }, [indexKey, index, localUserName, kvEnabled]);

  const selectedSemester = useMemo(() => {
    if (!selectedSemesterId) return null;
    return index.semesters.find((s) => s.id === selectedSemesterId) ?? null;
  }, [index.semesters, selectedSemesterId]);

  const selectedSetIds: string[] = useMemo(() => {
    if (!selectedSemesterId) return [];
    return index.setsBySemester[selectedSemesterId] ?? [];
  }, [index.setsBySemester, selectedSemesterId]);

  const selectedSetPlanProgress = useMemo(() => {
    if (!selectedSetId) return null;
    const p = readJson<BatchPlan | null>(planKey(selectedSetId), null as any);
    const pr = readJson<BatchProgress | null>(progressKey(selectedSetId), null as any);
    return {p, pr};
  }, [selectedSetId]);

  useEffect(() => {
    if (!selectedSetId) return;
    if (kvEnabled === null) return;

    let cancelled = false;

    const run = async () => {
      const fallbackPlan = null;
      let loadedPlan: BatchPlan | null = fallbackPlan;
      let loadedProgress: BatchProgress | null = null;

      if (kvEnabled) {
        const planRes = await kvCall("plan_get", {setId: selectedSetId});
        loadedPlan = (planRes?.plan ?? null) as BatchPlan | null;
        const prRes = await kvCall("progress_get", {setId: selectedSetId});
        loadedProgress = (prRes?.progress ?? null) as BatchProgress | null;
      } else {
        loadedPlan = readJson<BatchPlan | null>(planKey(selectedSetId), null as any);
        loadedProgress = readJson<BatchProgress | null>(progressKey(selectedSetId), null as any);
      }

      if (cancelled || !loadedPlan) return;
      setPlan(loadedPlan);

      if (loadedProgress) {
        setProgress(loadedProgress);
        setStep("read");
        return;
      }

      const newProgress: BatchProgress = {
        planId: loadedPlan.id,
        currentIndex: 0,
        selectedVersion: loadedPlan.versionLabels[0] ?? versionLabel,
        verseProgress: {},
        updatedAt: new Date().toISOString(),
      };

      setProgress(newProgress);
      setStep("read");
      if (selectedSetId) await persistProgress(selectedSetId, newProgress);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedSetId, kvEnabled, versionLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentVerse: Verse | null = useMemo(() => {
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

  const supportedVersions = useMemo(() => plan?.versionLabels ?? [versionLabel], [plan, versionLabel]);

  const onCreateSemester = () => {
    if (!semesterName.trim()) return;
    // Stable id so other devices can find the same semester by name.
    const id = `sem-${simpleHash(`${localUserName}::${semesterName}::${semesterCategory}`)}`;
    const newSemester: SemesterMeta = {
      id,
      name: semesterName.trim().slice(0, 60),
      category: semesterCategory,
      createdAt: new Date().toISOString(),
    };
    const newSetsBySemester = {...index.setsBySemester, [id]: []};
    const next = {
      semesters: [newSemester, ...index.semesters],
      setsBySemester: newSetsBySemester,
    };
    setIndex(next);
    setSelectedSemesterId(id);
    setSelectedSetId(null);
    setPlan(null);
    setProgress(null);
    setStep("import");
    setRawInput("");
    setGradingResult(null);
  };

  const onSelectSet = (setId: string) => {
    setSelectedSetId(setId);
    setTypedText("");
    setGradingResult(null);
    setStep("read");
  };

  const onStartImport = async (inputText?: string) => {
    if (!selectedSemesterId) return;
    const text = (inputText ?? rawInput).trim();
    if (!text) return;
    const parsed = parseVersesFromText(text);
    if (!parsed || parsed.length === 0) return;

    const chosenVersion =
      versionLabel.trim() === "Custom" ? (customVersion.trim() || "Custom") : versionLabel.trim();
    const referenceList = parsed.map((p) => p.reference);
    const setId = computeSetId(localUserName, selectedSemesterId, referenceList);

    // Load existing plan (for version-merge) if any.
    const kvMode = kvEnabled === true;
    const existingPlan = kvMode
      ? (await kvCall("plan_get", {setId})).plan ?? null
      : readJson<BatchPlan | null>(planKey(setId), null as any);
    const existingProgress = kvMode
      ? (await kvCall("progress_get", {setId})).progress ?? null
      : readJson<BatchProgress | null>(progressKey(setId), null as any);

    const verseMap = new Map<string, Verse>();
    // If existing plan exists, start from it so progress is preserved.
    if (existingPlan?.verses?.length) {
      for (const v of existingPlan.verses) {
        verseMap.set(v.id, {...v, versions: {...v.versions}});
      }
    }

    for (const p of parsed) {
      const reference = p.reference.trim();
      const id = stableVerseId(reference);
      const fixedText = p.fixedText;

      const existing = verseMap.get(id);
      if (!existing) {
        verseMap.set(id, {
          id,
          reference,
          versions: {[chosenVersion]: fixedText},
        });
      } else {
        existing.versions[chosenVersion] = fixedText;
        existing.reference = reference;
      }
    }

    const verses = Array.from(verseMap.values());
    const versionLabels = Array.from(new Set(verses.flatMap((v) => Object.keys(v.versions))));

    const newPlan: BatchPlan = {
      id: setId,
      createdAt: existingPlan?.createdAt ?? new Date().toISOString(),
      importedAt: new Date().toISOString(),
      folderId: selectedSemesterId,
      verses,
      versionLabels,
    };

    const newProgress: BatchProgress = existingProgress
      ? {
          ...existingProgress,
          selectedVersion: chosenVersion,
          updatedAt: new Date().toISOString(),
        }
      : {
          planId: setId,
          currentIndex: 0,
          selectedVersion: chosenVersion,
          verseProgress: {},
          updatedAt: new Date().toISOString(),
        };

    await persistPlan(setId, newPlan);
    await persistProgress(setId, newProgress);

    // Update index to include this set under the semester.
    const prevSets = index.setsBySemester[selectedSemesterId] ?? [];
    const nextSets = prevSets.includes(setId) ? prevSets : [setId, ...prevSets];
    const nextIndex = {
      ...index,
      setsBySemester: {
        ...index.setsBySemester,
        [selectedSemesterId]: nextSets,
      },
    };
    setIndex(nextIndex);

    setPlan(newPlan);
    setProgress(newProgress);
    setSelectedSetId(setId);
    setStep("read");
    setTypedText("");
    setGradingResult(null);
  };

  const onFetchWithAI = async () => {
    setAiError(null);
    setAiLoading(true);
    try {
      const v = versionLabel.trim();
      const allowed = ["KJV", "NIV", "개역개정", "개역한글"];
      if (!allowed.includes(v)) {
        setAiError(tFolders("aiVersionNotSupported"));
        return;
      }

      const refs = aiReferences
        .split(/\r?\n/g)
        .map((line) =>
          line
            .trim()
            .replace(/^\s*\d+\.\s*/g, "")
            .replace(/[“”"]/g, "")
            .split("|")[0]
            .split(";")[0]
            .trim(),
        )
        .filter(Boolean)
        .map((x) => x.split(",")[0].trim())
        .filter((x) => x.includes(":"));

      if (!refs.length) {
        setAiError(tFolders("aiReferencesRequired"));
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
        setAiError(tFolders("aiNoResults"));
        return;
      }

      const generatedRaw = verses
        .map((vr, idx) => {
          const reference = (vr.reference ?? "").trim();
          const text = (vr.text ?? "")
            .replace(/\r?\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return `${idx + 1}. ${reference} "${text}"`;
        })
        .join("\n");

      setRawInput(generatedRaw);
      setImportMode("paste");
      setAiReferences("");
      setStep("import");
      await onStartImport(generatedRaw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const onChangeSelectedVersion = (v: string) => {
    if (!progress) return;
    setProgress({...progress, selectedVersion: v, updatedAt: new Date().toISOString()});
    if (selectedSetId) {
      void persistProgress(selectedSetId, {...progress, selectedVersion: v, updatedAt: new Date().toISOString()});
    }
    setStep("read");
    setTypedText("");
    setGradingResult(null);
  };

  const onSubmitTyping = () => {
    if (!currentVerse || !plan || !progress) return;

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
      const vp: VerseProgress = {
        lastAccuracyScore: result.accuracyScore,
        lastPassed: result.passed,
        lastSubmittedAt: new Date().toISOString(),
        lastTypedText: typed,
        lastOfficialTextUsed: officialTextUsed,
        diffTokens: result.diffTokens,
        expectedTokens: result.expectedTokens,
      };

      const next: BatchProgress = {
        ...prev,
        selectedVersion: prev.selectedVersion,
        updatedAt: new Date().toISOString(),
        verseProgress: {
          ...prev.verseProgress,
          [verseId]: vp,
        },
      };

      if (selectedSetId) void persistProgress(selectedSetId, next);
      return next;
    });

    setStep("result");
  };

  const onNextVerse = () => {
    if (!plan || !progress) return;
    const nextIndex = progress.currentIndex + 1;
    if (nextIndex >= plan.verses.length) return;
    const next: BatchProgress = {...progress, currentIndex: nextIndex, updatedAt: new Date().toISOString()};
    setProgress(next);
    if (selectedSetId) void persistProgress(selectedSetId, next);
    setStep("read");
    setTypedText("");
    setGradingResult(null);
  };

  const onRetryTyping = () => {
    setStep("typing");
    setTypedText("");
    setGradingResult(null);
  };

  const showLearning = Boolean(plan && progress && currentVerse);
  const folderLabel = selectedSemester?.name ?? "";
  const folderTypeLabel =
    selectedSemester?.category === "homework" ? tFolders("typeHomework") : tFolders("typeMemorization");

  const totalVerses = plan?.verses.length ?? 0;
  const doneCount = useMemo(() => {
    if (!plan || !progress) return 0;
    let c = 0;
    for (const v of plan.verses) {
      if (progress.verseProgress[v.id]?.lastAccuracyScore !== undefined) c++;
    }
    return c;
  }, [plan, progress]);

  if (!localUserName) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">{tFolders("title")}</h1>
        <p className="text-sm text-zinc-600">{tFolders("loginRequired")}</p>
        <Link href="/login" className="text-sm text-zinc-900 underline">
          {tFolders("goLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <h1 className="text-2xl font-semibold">{tFolders("title")}</h1>
          <p className="text-sm text-zinc-600 mt-1">{tFolders("subtitle")}</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {selectedSemester ? (
            <Badge variant="secondary">
              {folderLabel} · {folderTypeLabel}
            </Badge>
          ) : null}

          {plan && progress ? (
            <Badge>
              {tFolders("progress")} {doneCount}/{totalVerses}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Semesters + Sets */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tFolders("semesters")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">{tFolders("semesterName")}</div>
                <Input value={semesterName} onChange={(e) => setSemesterName(e.target.value)} placeholder={tFolders("semesterNamePlaceholder")} />
              </div>

              <div className="space-y-2">
                <div className="text-xs text-zinc-500">{tFolders("semesterType")}</div>
                <select
                  value={semesterCategory}
                  onChange={(e) => setSemesterCategory(e.target.value as any)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-2 text-sm bg-white"
                >
                  <option value="homework">{tFolders("typeHomework")}</option>
                  <option value="memorization">{tFolders("typeMemorization")}</option>
                </select>
              </div>

              <Button onClick={onCreateSemester} className="w-full" disabled={!semesterName.trim()}>
                {tFolders("createSemester")}
              </Button>

              <div className="pt-2 space-y-2">
                {index.semesters.length === 0 ? (
                  <div className="text-sm text-zinc-600">{tFolders("noSemesters")}</div>
                ) : (
                  index.semesters.map((s) => {
                    const isActive = s.id === selectedSemesterId;
                    const isHomework = s.category === "homework";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSemesterId(s.id);
                          setSelectedSetId(null);
                          setPlan(null);
                          setProgress(null);
                          setStep("import");
                          setTypedText("");
                          setGradingResult(null);
                        }}
                        className={[
                          "w-full text-left rounded-lg border px-3 py-2 text-sm",
                          isActive ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-xs opacity-80">{isHomework ? "숙제" : "암기"}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tFolders("sets")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedSemesterId ? (
                <div className="text-sm text-zinc-600">{tFolders("selectSemester")}</div>
              ) : selectedSetIds.length === 0 ? (
                <div className="text-sm text-zinc-600">{tFolders("noSets")}</div>
              ) : (
                selectedSetIds.map((setId, idx) => {
                  const p = readJson<BatchPlan | null>(planKey(setId), null as any);
                  const pr = readJson<BatchProgress | null>(progressKey(setId), null as any);
                  if (!p) return null;
                  const currentProgress = pr;
                  const done = currentProgress
                    ? p.verses.reduce((acc, v) => acc + (currentProgress.verseProgress[v.id]?.lastAccuracyScore !== undefined ? 1 : 0), 0)
                    : 0;

                  return (
                    <button
                      key={setId}
                      type="button"
                      onClick={() => onSelectSet(setId)}
                      className={[
                        "w-full text-left rounded-lg border px-3 py-2 text-sm",
                        setId === selectedSetId
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-900",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{tFolders("setLabel")} {idx + 1}</span>
                        <span className="text-xs opacity-80">
                          {done}/{p.verses.length}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-600 mt-1">
                        {p.verses[0]?.reference ?? ""}
                        {p.verses.length > 1 ? ` +${p.verses.length - 1}` : ""}
                      </div>
                    </button>
                  );
                })
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedSetId(null);
                  setPlan(null);
                  setProgress(null);
                  setStep("import");
                  setTypedText("");
                  setGradingResult(null);
                }}
              >
                {tApp("importNew")}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Main */}
        <div className="lg:col-span-2 space-y-4">
          {step === "import" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>{tApp("importTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm text-zinc-700">{tApp("versionLabel")}</div>
                    <select
                      value={versionLabel}
                      onChange={(e) => setVersionLabel(e.target.value)}
                      className="w-full border border-zinc-200 rounded-md px-2 py-2 text-sm bg-white"
                    >
                      {["BBTS 4", "KJV", "NIV", "개역개정", "개역한글", "Custom"].map((v) => (
                        <option key={v} value={v}>
                          {v === "Custom" ? tApp("custom") : v}
                        </option>
                      ))}
                    </select>
                    {versionLabel === "Custom" ? (
                      <div className="mt-2">
                        <Input
                          value={customVersion}
                          onChange={(e) => setCustomVersion(e.target.value)}
                          placeholder={tApp("customPlaceholder")}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-zinc-700">{tApp("importMode")}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={importMode === "paste" ? "default" : "outline"}
                        onClick={() => {
                          setImportMode("paste");
                          setAiError(null);
                        }}
                      >
                        {tApp("importModePaste")}
                      </Button>
                      <Button
                        type="button"
                        variant={importMode === "ai" ? "default" : "outline"}
                        onClick={() => {
                          setImportMode("ai");
                          setAiError(null);
                        }}
                      >
                        {tApp("importModeAI")}
                      </Button>
                    </div>
                  </div>

                  {importMode === "paste" ? (
                    <div className="space-y-2">
                      <div className="text-sm text-zinc-700">{tApp("pasteLabel")}</div>
                      <Textarea
                        value={rawInput}
                        onChange={(e) => setRawInput(e.target.value)}
                        placeholder={tApp("pastePlaceholder")}
                        className="min-h-[280px]"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm text-zinc-700">{tFolders("aiReferencesLabel")}</div>
                      <Textarea
                        value={aiReferences}
                        onChange={(e) => setAiReferences(e.target.value)}
                        placeholder={tFolders("aiReferencesPlaceholder")}
                        className="min-h-[280px]"
                      />
                      {!["KJV", "NIV", "개역개정", "개역한글"].includes(versionLabel.trim()) ? (
                        <div className="text-sm text-amber-800">
                          {tFolders("aiVersionNotSupported")}
                        </div>
                      ) : null}
                      {aiError ? <p className="text-sm text-red-600">{aiError}</p> : null}
                    </div>
                  )}

                  {importMode === "paste" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                      onClick={() => void onStartImport()}
                        disabled={!rawInput.trim() || !selectedSemesterId}
                      >
                        {tApp("parseAndStart")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => onFetchWithAI()}
                        disabled={!aiReferences.trim() || !selectedSemesterId || aiLoading}
                      >
                        {aiLoading ? tCommon("loading") : tFolders("fetchViaAI")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>{tApp("exampleTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-zinc-700">
                  <p>{tApp("exampleHint")}</p>
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 whitespace-pre-wrap">
                    {tApp("exampleContent")}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {showLearning && plan && progress && currentVerse ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{tApp("verseList")}</CardTitle>
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
                            const next = {
                              ...progress,
                              currentIndex: idx,
                              updatedAt: new Date().toISOString(),
                            };
                            setProgress(next);
                            if (selectedSetId) void persistProgress(selectedSetId, next);
                            setStep("read");
                            setTypedText("");
                            setGradingResult(null);
                          }}
                          className={[
                            "w-full text-left rounded-lg border px-3 py-2 text-sm",
                            isCurrent ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{idx + 1}. {v.reference}</span>
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
                      <div className="flex items-center gap-2">
                        <Badge>{progress.selectedVersion}</Badge>
                        <select
                          value={progress.selectedVersion}
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
                            <MistakeHighlighter
                              diffTokens={gradingResult.diffTokens}
                              expectedTokens={gradingResult.expectedTokens}
                            />
                          ) : null}
                        </div>

                        <details className="rounded-lg border border-zinc-200 bg-white p-3">
                          <summary className="cursor-pointer text-sm font-medium">{tApp("showTexts")}</summary>
                          <div className="space-y-3 mt-3 text-sm">
                            <div>
                              <div className="text-xs text-zinc-500">{tApp("officialText")}</div>
                              <pre className="whitespace-pre-wrap text-sm leading-6">{currentOfficialText}</pre>
                            </div>
                            <div>
                              <div className="text-xs text-zinc-500">{tApp("typedText")}</div>
                              <pre className="whitespace-pre-wrap text-sm leading-6">{typedText}</pre>
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
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

