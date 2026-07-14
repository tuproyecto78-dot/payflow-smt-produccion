import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { ensureDemoFlowForAdmin } from "@/lib/auto-seed";
import { ROLES } from "@/lib/roles";
import { demoProject } from "@/lib/workflows/demo-whatsapp-ai-payment-flow";

/**
 * GET /api/projects
 * Returns user's projects PLUS the local demo project.
 *
 * The demo project is ALWAYS included so the dashboard never shows an
 * empty state, even when the DB is unavailable.
 */
export async function GET() {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects: Array<{
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    _count?: { workflows: number };
  }> = [];

  // Try Prisma — if not available, we'll still include the demo project.
  try {
    const { db } = await import("@/lib/db");

    // Auto-seed: for admin users, ensure they have at least one project.
    const isAdmin =
      session.role === ROLES.ADMIN || session.role === ROLES.SUPER_ADMIN;
    if (isAdmin) {
      await ensureDemoFlowForAdmin(session.userId);
    }

    const dbProjects = await db.project.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { workflows: true } } },
    });
    for (const p of dbProjects) {
      projects.push({
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        _count: { workflows: p._count?.workflows ?? 0 },
      });
    }
  } catch {
    // Prisma not available — we'll still include the demo project below.
  }

  // ALWAYS include the local demo project (first in the list).
  projects.unshift({
    id: demoProject.id,
    name: demoProject.name,
    description: demoProject.description,
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { workflows: 1 },
  });

  return NextResponse.json({ projects });
}

/**
 * POST /api/projects
 * Creates a new project. Gracefully handles missing DATABASE_URL.
 */
export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    }

    try {
      const { db } = await import("@/lib/db");
      const project = await db.project.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          userId: session.userId,
          workflows: {
            create: [
              {
                name: "New Workflow",
                nodesJson: JSON.stringify([]),
                edgesJson: JSON.stringify([]),
              },
            ],
          },
        },
        include: { workflows: true },
      });
      return NextResponse.json({ project });
    } catch {
      return NextResponse.json(
        { error: "Database not available. Configure DATABASE_URL in Vercel." },
        { status: 503 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Failed to create project." }, { status: 500 });
  }
}
