import type {ReactNode} from "react";

type TokenStatus = "correct" | "incorrect" | "missing" | "extra";

const statusClass: Record<TokenStatus, string> = {
  correct: "text-emerald-800 bg-emerald-50 border border-emerald-200",
  incorrect: "text-red-700 bg-red-50 border border-red-200",
  missing: "text-zinc-600 bg-zinc-50 border border-zinc-200 opacity-80",
  extra: "text-amber-800 bg-amber-50 border border-amber-200",
};

function TokenSpan({
  token,
  status,
}: {
  token: string;
  status: TokenStatus;
  children?: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded px-1 py-0.5 text-sm leading-6 border",
        statusClass[status],
      ].join(" ")}
    >
      {token}
    </span>
  );
}

export default function LiveTokenHighlighter({
  expectedTokens,
  actualTokens,
}: {
  expectedTokens: string[];
  actualTokens: string[];
}) {
  const tokens: ReactNode[] = [];

  for (let i = 0; i < expectedTokens.length; i++) {
    const expected = expectedTokens[i] ?? "";
    const actual = actualTokens[i];
    let status: TokenStatus;
    if (actualTokens.length <= i) {
      status = "missing";
    } else if (actual === expected) {
      status = "correct";
    } else {
      status = "incorrect";
    }

    tokens.push(<TokenSpan key={`e:${i}`} token={expected} status={status} />);
  }

  // Extra tokens typed beyond expected length
  if (actualTokens.length > expectedTokens.length) {
    for (let j = expectedTokens.length; j < actualTokens.length; j++) {
      const extra = actualTokens[j] ?? "";
      tokens.push(<TokenSpan key={`x:${j}`} token={extra} status="extra" />);
    }
  }

  return <div className="flex flex-wrap gap-1">{tokens}</div>;
}

