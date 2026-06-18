import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projects = await db.project.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { workflows: true } } },
  });
  return NextResponse.json({ projects });
}

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
  } catch (err) {
    console.error("[projects POST] error", err);
    return NextResponse.json({ error: "Failed to create project." }, { status: 500 });
  }
}
