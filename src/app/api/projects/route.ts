import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/projects
 * Returns user's projects. Gracefully handles missing DATABASE_URL.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Try Prisma — if not available, return empty list
  try {
    const { db } = await import("@/lib/db");
    const projects = await db.project.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { workflows: true } } },
    });
    return NextResponse.json({ projects });
  } catch {
    // Prisma not available (no DATABASE_URL in production without Supabase)
    return NextResponse.json({ projects: [] });
  }
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
