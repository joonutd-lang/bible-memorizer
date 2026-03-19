import type {NextRequest} from "next/server";

type AIVerseRequest = {
  references: string[];
  version: string;
  model?: string;
};

export async function POST(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  if (!openaiKey) {
    return new Response(JSON.stringify({error: "OPENAI_API_KEY is not set"}), {
      status: 501,
      headers: {"content-type": "application/json"},
    });
  }

  const body = (await req.json()) as AIVerseRequest;
  const references = Array.isArray(body.references) ? body.references : [];
  const version = (body.version ?? "").trim();
  const model = (body.model ?? "gpt-4o-mini").trim();

  if (!references.length) {
    return new Response(JSON.stringify({error: "references is required"}), {
      status: 400,
      headers: {"content-type": "application/json"},
    });
  }
  if (!version) {
    return new Response(JSON.stringify({error: "version is required"}), {
      status: 400,
      headers: {"content-type": "application/json"},
    });
  }

  // Note: we rely on the model to output bible text verbatim.
  // For production-grade accuracy, consider integrating a dedicated Bible API.
  const systemPrompt =
    "You are a Bible verse text generator. You must output STRICT JSON only. No markdown, no extra keys.";

  const userPrompt = [
    `Bible version: ${version}`,
    "For each reference below, return the verse text exactly as used in that version.",
    "If a reference cannot be resolved, return empty text.",
    "Output JSON in the following shape:",
    '{ "verses": [ { "reference": "book chapter:verse", "text": "verse text" } ] }',
    "",
    "References:",
    ...references.map((r, i) => `${i + 1}. ${r}`),
  ].join("\n");

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {role: "system", content: systemPrompt},
        {role: "user", content: userPrompt},
      ],
    }),
  });

  if (!upstream.ok) {
    const txt = await upstream.text();
    return new Response(JSON.stringify({error: txt || "AI request failed"}), {
      status: 502,
      headers: {"content-type": "application/json"},
    });
  }

  const data = await upstream.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";

  // Best-effort parse (model sometimes adds whitespace).
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? content.slice(start, end + 1) : content;

  try {
    const parsed = JSON.parse(jsonText) as {verses: {reference: string; text: string}[]};
    return new Response(JSON.stringify(parsed), {status: 200, headers: {"content-type": "application/json"}});
  } catch (e) {
    return new Response(JSON.stringify({error: "Failed to parse AI response"}), {
      status: 500,
      headers: {"content-type": "application/json"},
    });
  }
}

