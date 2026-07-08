import { NextResponse } from "next/server";
import { getSafePayphoneStatus } from "@/lib/payphone/config";

/**
 * GET /api/payphone/config/status
 *
 * Returns the current PayPhone configuration status.
 *
 * SECURITY: NEVER returns the token. NEVER returns the full Store ID.
 * Only returns masked fields safe for display in the admin UI.
 *
 * Public-read (no session required) so the CreateFlowDialog can call it
 * to show whether PayPhone is configured. The response contains no secrets.
 */
export async function GET() {
  try {
    const status = getSafePayphoneStatus();
    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[/api/payphone/config/status] unexpected error:", err);
    return NextResponse.json(
      {
        configured: false,
        env: "disabled",
        mode: "link",
        tokenConfigured: false,
        storeIdConfigured: false,
        storeIdLastFour: null,
        storeIdMasked: "—",
        externalNotificationEnabled: false,
        preregistrationEnabled: false,
        missingVars: ["PAYPHONE_ENV", "PAYPHONE_TOKEN", "PAYPHONE_STORE_ID"],
      },
      { status: 200 }
    );
  }
}

export const dynamic = "force-dynamic";
