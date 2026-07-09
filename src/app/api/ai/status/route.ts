import { NextResponse } from "next/server";
import { getSafeAIStatus } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/status
 *
 * Returns safe AI provider status (no secrets).
 */
export async function GET() {
  const status = getSafeAIStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
