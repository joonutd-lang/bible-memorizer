export type ScoringOptions = {
  caseSensitive: boolean;
  ignorePunctuation: boolean;
  collapseWhitespace: boolean;
  passThreshold: number; // 0..100
};

export type DiffTokenStatus = "correct" | "incorrect" | "missing" | "extra";

export type DiffToken = {
  token: string; // token value shown in UI (normalized)
  status: DiffTokenStatus;
  expectedIndex?: number; // token index in expected sequence (normalized)
  actualIndex?: number; // token index in actual sequence (normalized)
};

export type MistakeLog = {
  word_or_phrase: string;
  expected_text: string;
  actual_text: string;
  position: number;
};

export type GradingResult = {
  officialTextUsed: string;
  typedText: string;
  normalizedOfficial: string;
  normalizedTyped: string;
  accuracyScore: number; // 0..100
  passed: boolean;
  expectedTokens: string[];
  actualTokens: string[];
  diffTokens: DiffToken[];
  mistakeLogs: MistakeLog[];
};

const DEFAULT_PUNCTUATION_REGEX =
  // Unicode punctuation + symbols. We keep letters/numbers and whitespace.
  /[\p{P}\p{S}]/gu;

export function normalizeText(text: string, options: Pick<ScoringOptions, "caseSensitive" | "ignorePunctuation" | "collapseWhitespace">) {
  let t = text ?? "";

  if (options.ignorePunctuation) {
    t = t.replace(DEFAULT_PUNCTUATION_REGEX, " ");
  }

  if (!options.caseSensitive) {
    t = t.toLowerCase();
  }

  if (options.collapseWhitespace) {
    t = t.replace(/\s+/g, " ").trim();
  }

  return t;
}

export function tokenizeText(normalizedText: string) {
  if (!normalizedText) return [] as string[];
  // Word-level tokenization. Users memorize in languages that include spaces;
  // for Korean/Japanese this is consistent with common typing practice.
  return normalizedText.split(" ").filter(Boolean);
}

type BacktrackOp =
  | { op: "match"; i: number; j: number; token: string }
  | { op: "sub"; i: number; j: number; expected: string; actual: string }
  | { op: "del"; i: number; j: number; expected: string }
  | { op: "ins"; i: number; j: number; actual: string };

export function compareTexts(
  expectedTokens: string[],
  actualTokens: string[]
): {
  accuracyScore: number;
  passed: boolean;
  diffTokens: DiffToken[];
  mistakeLogs: MistakeLog[];
} {
  const n = expectedTokens.length;
  const m = actualTokens.length;

  // Levenshtein DP on token sequences.
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  const parent: ("match" | "sub" | "del" | "ins")[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill("match")
  );

  for (let i = 0; i <= n; i++) {
    dp[i][0] = i;
    if (i > 0) parent[i][0] = "del";
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j;
    if (j > 0) parent[0][j] = "ins";
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const expected = expectedTokens[i - 1];
      const actual = actualTokens[j - 1];

      const costSub = expected === actual ? 0 : 1;
      const subTotal = dp[i - 1][j - 1] + costSub;
      const delTotal = dp[i - 1][j] + 1;
      const insTotal = dp[i][j - 1] + 1;

      const best = Math.min(subTotal, delTotal, insTotal);
      dp[i][j] = best;

      // Prefer match/sub over del/ins when tied (helps UI stability).
      if (best === subTotal) parent[i][j] = expected === actual ? "match" : "sub";
      else if (best === delTotal) parent[i][j] = "del";
      else parent[i][j] = "ins";
    }
  }

  // Backtrack to build a token diff alignment.
  const ops: BacktrackOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const p = parent[i][j];
    if (p === "match") {
      const expected = expectedTokens[i - 1];
      const actual = actualTokens[j - 1];
      ops.push({ op: expected === actual ? "match" : "sub", i: i - 1, j: j - 1, token: expected, ...(expected === actual ? {} : { expected, actual }) } as any);
      i -= 1;
      j -= 1;
    } else if (p === "sub") {
      ops.push({ op: "sub", i: i - 1, j: j - 1, expected: expectedTokens[i - 1], actual: actualTokens[j - 1] });
      i -= 1;
      j -= 1;
    } else if (p === "del") {
      ops.push({ op: "del", i: i - 1, j: j, expected: expectedTokens[i - 1] });
      i -= 1;
    } else {
      ops.push({ op: "ins", i: i, j: j - 1, actual: actualTokens[j - 1] });
      j -= 1;
    }
  }
  ops.reverse();

  const diffTokens: DiffToken[] = [];
  let correctCount = 0;

  for (const op of ops) {
    if (op.op === "match") {
      correctCount += 1;
      diffTokens.push({
        token: expectedTokens[op.i] ?? op.token,
        status: "correct",
        expectedIndex: op.i,
        actualIndex: op.j,
      });
    } else if (op.op === "sub") {
      diffTokens.push({
        token: op.actual,
        status: "incorrect",
        expectedIndex: op.i,
        actualIndex: op.j,
      });
    } else if (op.op === "del") {
      diffTokens.push({
        token: op.expected,
        status: "missing",
        expectedIndex: op.i,
      });
    } else {
      diffTokens.push({
        token: op.actual,
        status: "extra",
        actualIndex: op.j,
      });
    }
  }

  const expectedCount = Math.max(1, n);
  const accuracyScore = (correctCount / expectedCount) * 100;

  // Mistake grouping: merge consecutive non-correct tokens into phrases.
  const mistakeLogs: MistakeLog[] = [];
  let cursor = 0;
  while (cursor < diffTokens.length) {
    if (diffTokens[cursor].status === "correct") {
      cursor += 1;
      continue;
    }

    const start = cursor;
    const statuses: DiffTokenStatus[] = [];
    while (cursor < diffTokens.length && diffTokens[cursor].status !== "correct") {
      statuses.push(diffTokens[cursor].status);
      cursor += 1;
    }

    const chunk = diffTokens.slice(start, cursor);
    const expectedPart = chunk
      .filter((t) => t.status === "missing" || t.status === "incorrect")
      .map((t) => expectedTokens[t.expectedIndex ?? -1] ?? t.token)
      .join(" ")
      .trim();

    const actualPart = chunk
      .filter((t) => t.status === "extra" || t.status === "incorrect")
      .map((t) => actualTokens[t.actualIndex ?? -1] ?? t.token)
      .join(" ")
      .trim();

    const first = chunk[0];
    const position = first.expectedIndex ?? first.actualIndex ?? start;

    // If both sides end up empty, skip.
    if (!expectedPart && !actualPart) continue;

    mistakeLogs.push({
      word_or_phrase: expectedPart || actualPart,
      expected_text: expectedPart,
      actual_text: actualPart,
      position,
    });
  }

  return {
    accuracyScore: Math.round(accuracyScore * 10) / 10,
    // passed is decided by external scoring settings. We'll default to false here;
    // grading wrapper will set it.
    passed: false,
    diffTokens,
    mistakeLogs,
  };
}

export function calculateAccuracy(expectedTokens: string[], actualTokens: string[], options: Pick<ScoringOptions, "passThreshold">) {
  const {accuracyScore} = compareTexts(expectedTokens, actualTokens);
  return {
    accuracyScore,
    passed: accuracyScore >= options.passThreshold,
  };
}

export function gradeTexts(args: {
  officialTextUsed: string;
  typedText: string;
  scoring: ScoringOptions;
}): GradingResult {
  const {officialTextUsed, typedText, scoring} = args;

  const normalizedOfficial = normalizeText(officialTextUsed, scoring);
  const normalizedTyped = normalizeText(typedText, scoring);

  const expectedTokens = tokenizeText(normalizedOfficial);
  const actualTokens = tokenizeText(normalizedTyped);

  const comparison = compareTexts(expectedTokens, actualTokens);

  const passed = comparison.accuracyScore >= scoring.passThreshold;

  return {
    officialTextUsed,
    typedText,
    normalizedOfficial,
    normalizedTyped,
    accuracyScore: comparison.accuracyScore,
    passed,
    expectedTokens,
    actualTokens,
    diffTokens: comparison.diffTokens,
    mistakeLogs: comparison.mistakeLogs,
  };
}

