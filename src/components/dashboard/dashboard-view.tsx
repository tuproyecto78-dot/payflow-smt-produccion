"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore, type ProjectSummary, type WorkflowSummary } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  FolderKanban,
  Workflow as WorkflowIcon,
  Trash2,
  ArrowRight,
  Clock,
  Loader2,
  Pencil,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface ProjectWithWorkflows extends ProjectSummary {
  workflows: WorkflowSummary[];
}

export function DashboardView() {
  const { openEditor } = useAppStore();
  const [projects, setProjects] = useState<ProjectWithWorkflows[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newWorkflowFor, setNewWorkflowFor] = useState<string | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectWithWorkflows | null>(null);
  const [deleteWorkflow, setDeleteWorkflow] = useState<{ project: ProjectWithWorkflows; wf: WorkflowSummary } | null>(null);
  const [editProject, setEditProject] = useState<ProjectWithWorkflows | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      const base = (data.projects || []) as ProjectSummary[];
      // Load workflows per project
      const withWorkflows: ProjectWithWorkflows[] = await Promise.all(
        base.map(async (p) => {
          const r = await fetch(`/api/projects/${p.id}`);
          const d = await r.json();
          return { ...p, workflows: d.project?.workflows || [] };
        })
      );
      setProjects(withWorkflows);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  async function createProject(name: string, description: string) {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error || "Failed to create project");
      return;
    }
    toast.success("Project created");
    setNewProjectOpen(false);
    await loadProjects();
  }

  async function createWorkflow(projectId: string, name: string) {
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, name }),
    });
    if (!res.ok) {
      toast.error("Failed to create workflow");
      return;
    }
    toast.success("Workflow created");
    setNewWorkflowFor(null);
    await loadProjects();
  }

  async function confirmDeleteProject() {
    if (!deleteProject) return;
    const res = await fetch(`/api/projects/${deleteProject.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Project deleted");
      setDeleteProject(null);
      await loadProjects();
    } else {
      toast.error("Failed to delete project");
    }
  }

  async function confirmDeleteWorkflow() {
    if (!deleteWorkflow) return;
    const res = await fetch(`/api/workflows/${deleteWorkflow.wf.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Workflow deleted");
      setDeleteWorkflow(null);
      await loadProjects();
    } else {
      toast.error("Failed to delete workflow");
    }
  }

  async function updateProject(id: string, name: string, description: string) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) {
      toast.success("Project updated");
      setEditProject(null);
      await loadProjects();
    } else {
      toast.error("Failed to update project");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto pf-scroll">
      <div className="max-w-6xl mx-auto p-6 lg:p-10">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
              Projects
            </h1>
            <p className="text-muted-foreground mt-1">
              Organize your WhatsApp, payment &amp; AI workflows into projects.
            </p>
          </div>
          <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-2" />
                New project
              </Button>
            </DialogTrigger>
            <ProjectFormDialog
              title="Create project"
              description="A project groups related automation workflows."
              onSubmit={createProject}
              onCancel={() => setNewProjectOpen(false)}
            />
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setNewProjectOpen(true)} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {projects.map((project) => (
              <Card key={project.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FolderKanban className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">
                          {project.name}
                        </CardTitle>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Clock className="size-3" />
                          Updated{" "}
                          {formatDistanceToNow(new Date(project.updatedAt), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                        onClick={() => setEditProject(project)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteProject(project)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {project.description && (
                    <CardDescription className="line-clamp-2 mt-1">
                      {project.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="flex-1 space-y-2">
                  {project.workflows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No workflows yet.
                    </p>
                  ) : (
                    project.workflows.map((wf) => (
                      <div
                        key={wf.id}
                        className="group flex items-center gap-2 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 px-3 py-2 transition-colors"
                      >
                        <WorkflowIcon className="size-4 text-primary shrink-0" />
                        <button
                          onClick={() => openEditor(project, wf)}
                          className="flex-1 text-left text-sm font-medium truncate hover:text-primary"
                        >
                          {wf.name}
                        </button>
                        <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex">
                          {formatDistanceToNow(new Date(wf.updatedAt), {
                            addSuffix: false,
                          })}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                          onClick={() => setDeleteWorkflow({ project, wf })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => openEditor(project, wf)}
                        >
                          <ArrowRight className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>

                <CardFooter className="pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setNewWorkflowFor(project.id)}
                  >
                    <Plus className="size-4 mr-2" />
                    New workflow
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* New workflow dialog */}
      <Dialog open={!!newWorkflowFor} onOpenChange={(o) => !o && setNewWorkflowFor(null)}>
        <WorkflowFormDialog
          onSubmit={(name) => newWorkflowFor && createWorkflow(newWorkflowFor, name)}
          onCancel={() => setNewWorkflowFor(null)}
        />
      </Dialog>

      {/* Edit project dialog */}
      <Dialog open={!!editProject} onOpenChange={(o) => !o && setEditProject(null)}>
        {editProject && (
          <ProjectFormDialog
            title="Edit project"
            description="Update your project details."
            initialName={editProject.name}
            initialDescription={editProject.description || ""}
            submitLabel="Save changes"
            onSubmit={(name, desc) => updateProject(editProject.id, name, desc)}
            onCancel={() => setEditProject(null)}
          />
        )}
      </Dialog>

      {/* Delete project confirm */}
      <AlertDialog open={!!deleteProject} onOpenChange={(o) => !o && setDeleteProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &ldquo;{deleteProject?.name}&rdquo; and all
              its workflows and execution logs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete workflow confirm */}
      <AlertDialog open={!!deleteWorkflow} onOpenChange={(o) => !o && setDeleteWorkflow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &ldquo;{deleteWorkflow?.wf.name}&rdquo; and
              its execution history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteWorkflow}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center text-center py-16">
        <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <FolderKanban className="size-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">No projects yet</h3>
        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
          Create your first project to start building WhatsApp, payment, and AI
          automation workflows.
        </p>
        <Button className="mt-5" onClick={onCreate}>
          <Plus className="size-4 mr-2" />
          Create project
        </Button>
      </CardContent>
    </Card>
  );
}

function ProjectFormDialog({
  title,
  description,
  onSubmit,
  onCancel,
  initialName = "",
  initialDescription = "",
  submitLabel = "Create",
}: {
  title: string;
  description: string;
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
  initialName?: string;
  initialDescription?: string;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDescription);
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="proj-name">Name</Label>
          <Input
            id="proj-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My automation project"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="proj-desc">Description (optional)</Label>
          <Textarea
            id="proj-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What is this project about?"
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => name.trim() && onSubmit(name.trim(), desc.trim())}
          disabled={!name.trim()}
        >
          {submitLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function WorkflowFormDialog({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New workflow</DialogTitle>
        <DialogDescription>
          Give your workflow a name. You can rename it later.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2 py-2">
        <Label htmlFor="wf-name">Workflow name</Label>
        <Input
          id="wf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Order confirmation flow"
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => name.trim() && onSubmit(name.trim())}
          disabled={!name.trim()}
        >
          Create workflow
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
