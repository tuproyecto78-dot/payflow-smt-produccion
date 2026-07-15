import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { collectArchitectContext } from "@/lib/architect-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const context = await collectArchitectContext();
    return NextResponse.json({ ok: true, ...context });
  } catch (error) {
    console.error("[architect/context]", error);
    return NextResponse.json({ error: "No se pudo construir el mapa del sistema." }, { status: 500 });
  }
}
