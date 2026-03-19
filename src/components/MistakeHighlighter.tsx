import type {DiffToken, DiffTokenStatus} from "@/lib/grading/grading";

const statusClass: Record<DiffTokenStatus, string> = {
  correct: "text-zinc-900",
  incorrect: "text-red-700 bg-red-50 border border-red-200",
  missing: "text-zinc-900 bg-zinc-200/60 border border-zinc-300 line-through",
  extra: "text-amber-800 bg-amber-50 border border-amber-200",
};

export default function MistakeHighlighter({
  diffTokens,
  expectedTokens,
}: {
  diffTokens: DiffToken[];
  expectedTokens: string[];
  // actualTokens isn't necessary for rendering; expectedTokens helps with tooltips.
  actualTokens?: string[];
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 overflow-x-auto">
      <div className="flex flex-wrap gap-1">
        {diffTokens.map((t, idx) => {
          const expected =
            t.expectedIndex !== undefined ? expectedTokens[t.expectedIndex] : undefined;
          const title =
            t.status === "incorrect" && expected
              ? `expected: ${expected}`
              : t.status === "missing" && expected
                ? `missing: ${expected}`
                : undefined;

          return (
            <span
              key={idx}
              title={title}
              className={[
                "inline-flex items-center rounded px-1 py-0.5 text-sm",
                statusClass[t.status],
              ].join(" ")}
            >
              {t.token}
            </span>
          );
        })}
      </div>
    </div>
  );
}

