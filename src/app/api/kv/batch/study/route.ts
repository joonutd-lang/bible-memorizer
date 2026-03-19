import type {NextRequest} from "next/server";
import {NextResponse} from "next/server";
import {
  getBatchIndexByName,
  setBatchIndexByName,
  getBatchPlanByName,
  setBatchPlanByName,
  getBatchProgressByName,
  setBatchProgressByName,
} from "@/lib/kv/kvBatchStudyDb";
import {isKvConfigured} from "@/lib/kv/kvClient";

type Action =
  | "index_get"
  | "index_set"
  | "plan_get"
  | "plan_set"
  | "progress_get"
  | "progress_set";

export async function POST(req: NextRequest) {
  if (!isKvConfigured) {
    return NextResponse.json({ok: false, error: "KV_NOT_CONFIGURED"}, {status: 501});
  }

  const body = (await req.json()) as {
    action: Action;
    name: string;
    setId?: string;
    index?: any;
    plan?: any;
    progress?: any;
  };

  const {action, name} = body;
  if (!name) return NextResponse.json({ok: false, error: "name is required"}, {status: 400});
  if (!action) return NextResponse.json({ok: false, error: "action is required"}, {status: 400});

  try {
    if (action === "index_get") {
      const index = await getBatchIndexByName(name);
      return NextResponse.json({ok: true, index});
    }

    if (action === "index_set") {
      await setBatchIndexByName(name, body.index);
      return NextResponse.json({ok: true});
    }

    if (action === "plan_get") {
      if (!body.setId) return NextResponse.json({ok: false, error: "setId is required"}, {status: 400});
      const plan = await getBatchPlanByName(name, body.setId);
      return NextResponse.json({ok: true, plan});
    }

    if (action === "plan_set") {
      if (!body.setId) return NextResponse.json({ok: false, error: "setId is required"}, {status: 400});
      await setBatchPlanByName(name, body.setId, body.plan);
      return NextResponse.json({ok: true});
    }

    if (action === "progress_get") {
      if (!body.setId) return NextResponse.json({ok: false, error: "setId is required"}, {status: 400});
      const progress = await getBatchProgressByName(name, body.setId);
      return NextResponse.json({ok: true, progress});
    }

    if (action === "progress_set") {
      if (!body.setId) return NextResponse.json({ok: false, error: "setId is required"}, {status: 400});
      await setBatchProgressByName(name, body.setId, body.progress);
      return NextResponse.json({ok: true});
    }

    return NextResponse.json({ok: false, error: "unknown action"}, {status: 400});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ok: false, error: msg}, {status: 500});
  }
}

