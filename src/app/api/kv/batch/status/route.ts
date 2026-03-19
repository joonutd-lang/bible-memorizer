import {NextResponse} from "next/server";
import {isKvConfigured} from "@/lib/kv/kvClient";

export async function GET() {
  return NextResponse.json({enabled: isKvConfigured});
}

