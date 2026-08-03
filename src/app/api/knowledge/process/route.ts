import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  processKnowledgeSource,
  mergeDetectedKnowledge,
  formatDetectedKnowledgeForPrompt,
  type KnowledgeSource,
  type KnowledgeSourceType,
} from "@/lib/knowledge-processor";

/**
 * POST /api/knowledge/process
 *
 * Accepts knowledge sources (file metadata + manual text) and returns
 * detected/structured knowledge that feeds the AI, catalog, agenda, FAQ.
 *
 * Body:
 *   {
 *     sources: [
 *       {
 *         source_id: string,
 *         type: "pdf" | "excel" | "csv" | "txt" | "image" | "manual" | "faq",
 *         name: string,
 *         rawText?: string,   // extracted text or manual text
 *         rows?: Record<string,string>[],  // for CSV/Excel
 *         headers?: string[]  // for CSV/Excel
 *       }
 *     ]
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     results: ProcessResult[],     // per-source
 *     merged: DetectedKnowledge,    // all sources merged
 *     promptBlock: string           // formatted for AI system prompt
 *   }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const allowedTypes = new Set<KnowledgeSourceType>([
      "pdf", "excel", "csv", "txt", "image", "manual", "faq",
    ]);
    const sources: KnowledgeSource[] = (body.sources || [])
      .filter((s: unknown) => s && typeof s === "object")
      .map((s: Record<string, unknown>) => {
        const requestedType = String(s.type || "manual") as KnowledgeSourceType;
        const type = allowedTypes.has(requestedType) ? requestedType : "manual";
        return {
          source_id: String(s.source_id || `src_${Date.now()}`),
          type,
          name: String(s.name || "manual"),
          rawText: typeof s.rawText === "string" ? s.rawText : undefined,
          rows: Array.isArray(s.rows) ? s.rows as Record<string,string>[] : undefined,
          headers: Array.isArray(s.headers) ? s.headers.map(String) : undefined,
        };
      });

    if (sources.length === 0) {
      return NextResponse.json(
        { error: "No se proporcionaron fuentes de conocimiento." },
        { status: 400 }
      );
    }

    // Process each source
    const results = sources.map((s) => processKnowledgeSource(s));

    // Merge all detected knowledge
    const merged = mergeDetectedKnowledge(results);

    // Format for AI prompt
    const promptBlock = formatDetectedKnowledgeForPrompt(merged);

    return NextResponse.json({
      ok: true,
      results,
      merged,
      promptBlock,
      active: false,
      activationRequired: true,
    });
  } catch (err) {
    console.error("[/api/knowledge/process] error:", err);
    return NextResponse.json(
      { error: "Error al procesar el conocimiento." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
