import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ensureDemoFlowForAdmin } from "@/lib/auto-seed";
import { ROLES } from "@/lib/roles";
import { demoProject } from "@/lib/workflows/demo-workflow";

/**
 * GET /api/projects
 * Returns user's projects. Gracefully handles missing DATABASE_URL.
 *
 * For admin users with 0 projects, includes the demo project as fallback
 * so the dashboard never shows an empty state.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let projects: Array<{
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    _count?: { workflows: number };
  }> = [];

  // Try Prisma — if not available, we'll fall back to the demo project.
  try {
    const { db } = await import("@/lib/db");

    // Auto-seed: for admin users, ensure they have at least one project
    // with the demo flow. This is critical for Vercel where the DB is
    // ephemeral and resets on cold start.
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
    projects = dbProjects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      _count: { workflows: p._count?.workflows ?? 0 },
    }));
  } catch {
    // Prisma not available — we'll fall back to the demo project below.
  }

  // If no projects were found, include the demo project as fallback.
  if (projects.length === 0) {
    projects.push({
      id: demoProject.id,
      name: demoProject.name,
      description: demoProject.description,
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { workflows: 1 },
    });
  }

  return NextResponse.json({ projects });
}

/**
 * POST /api/projects
 * Creates a new project. Gracefully handles missing DATABASE_URL.
 */
export async function POST(req: Request) {
  const session = await getSession();
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
