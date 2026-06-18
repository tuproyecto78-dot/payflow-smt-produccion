import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Create a new workflow. Body: { projectId, name }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { projectId, name } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }
    const project = await db.project.findFirst({
      where: { id: projectId, userId: session.userId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const workflow = await db.workflow.create({
      data: {
        name: name?.trim() || "Untitled Workflow",
        projectId,
        nodesJson: JSON.stringify([]),
        edgesJson: JSON.stringify([]),
      },
    });
    return NextResponse.json({ workflow });
  } catch (err) {
    console.error("[workflow POST] error", err);
    return NextResponse.json({ error: "Failed to create workflow." }, { status: 500 });
  }
}
