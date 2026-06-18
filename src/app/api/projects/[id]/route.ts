import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const project = await db.project.findFirst({
    where: { id, userId: session.userId },
    include: { workflows: { orderBy: { updatedAt: "desc" } } },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { name, description } = await req.json();
    const project = await db.project.findFirst({ where: { id, userId: session.userId } });
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const updated = await db.project.update({
      where: { id },
      data: {
        name: name?.trim() ?? undefined,
        description: description?.trim() ?? undefined,
      },
    });
    return NextResponse.json({ project: updated });
  } catch (err) {
    console.error("[project PATCH] error", err);
    return NextResponse.json({ error: "Failed to update project." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const project = await db.project.findFirst({ where: { id, userId: session.userId } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
