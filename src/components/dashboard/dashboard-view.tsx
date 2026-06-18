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
import { es } from "date-fns/locale";
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
      const withWorkflows: ProjectWithWorkflows[] = await Promise.all(
        base.map(async (p) => {
          const r = await fetch(`/api/projects/${p.id}`);
          const d = await r.json();
          return { ...p, workflows: d.project?.workflows || [] };
        })
      );
      setProjects(withWorkflows);
    } catch {
      toast.error("Error al cargar los proyectos");
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
      toast.error(d.error || "Error al crear el proyecto");
      return;
    }
    toast.success("Proyecto creado");
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
      toast.error("Error al crear el flujo");
      return;
    }
    toast.success("Flujo creado");
    setNewWorkflowFor(null);
    await loadProjects();
  }

  async function confirmDeleteProject() {
    if (!deleteProject) return;
    const res = await fetch(`/api/projects/${deleteProject.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Proyecto eliminado");
      setDeleteProject(null);
      await loadProjects();
    } else {
      toast.error("Error al eliminar el proyecto");
    }
  }

  async function confirmDeleteWorkflow() {
    if (!deleteWorkflow) return;
    const res = await fetch(`/api/workflows/${deleteWorkflow.wf.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Flujo eliminado");
      setDeleteWorkflow(null);
      await loadProjects();
    } else {
      toast.error("Error al eliminar el flujo");
    }
  }

  async function updateProject(id: string, name: string, description: string) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) {
      toast.success("Proyecto actualizado");
      setEditProject(null);
      await loadProjects();
    } else {
      toast.error("Error al actualizar el proyecto");
    }
  }

  const fmt = (date: string, addSuffix = true) =>
    formatDistanceToNow(new Date(date), { addSuffix, locale: es });

  return (
    <div className="flex-1 overflow-y-auto pf-scroll">
      <div className="max-w-6xl mx-auto p-6 lg:p-10">
        {/* Encabezado */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
              Proyectos
            </h1>
            <p className="text-muted-foreground mt-1">
              Organiza tus flujos de WhatsApp, pagos e IA en proyectos.
            </p>
          </div>
          <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-2" />
                Nuevo proyecto
              </Button>
            </DialogTrigger>
            <ProjectFormDialog
              title="Crear proyecto"
              description="Un proyecto agrupa flujos de automatización relacionados."
              onSubmit={createProject}
              onCancel={() => setNewProjectOpen(false)}
            />
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> Cargando proyectos…
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
                          Actualizado {fmt(project.updatedAt)}
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
                      Aún no hay flujos.
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
                          {fmt(wf.updatedAt, false)}
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
                    Nuevo flujo
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Diálogo nuevo flujo */}
      <Dialog open={!!newWorkflowFor} onOpenChange={(o) => !o && setNewWorkflowFor(null)}>
        <WorkflowFormDialog
          onSubmit={(name) => newWorkflowFor && createWorkflow(newWorkflowFor, name)}
          onCancel={() => setNewWorkflowFor(null)}
        />
      </Dialog>

      {/* Editar proyecto */}
      <Dialog open={!!editProject} onOpenChange={(o) => !o && setEditProject(null)}>
        {editProject && (
          <ProjectFormDialog
            title="Editar proyecto"
            description="Actualiza los detalles de tu proyecto."
            initialName={editProject.name}
            initialDescription={editProject.description || ""}
            submitLabel="Guardar cambios"
            onSubmit={(name, desc) => updateProject(editProject.id, name, desc)}
            onCancel={() => setEditProject(null)}
          />
        )}
      </Dialog>

      {/* Confirmar eliminar proyecto */}
      <AlertDialog open={!!deleteProject} onOpenChange={(o) => !o && setDeleteProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto elimina permanentemente “{deleteProject?.name}” y todos sus
              flujos y registros de ejecución. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar eliminar flujo */}
      <AlertDialog open={!!deleteWorkflow} onOpenChange={(o) => !o && setDeleteWorkflow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar flujo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto elimina permanentemente “{deleteWorkflow?.wf.name}” y su
              historial de ejecución.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteWorkflow}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
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
        <h3 className="text-lg font-semibold">Aún no hay proyectos</h3>
        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
          Crea tu primer proyecto para empezar a construir flujos de WhatsApp,
          pagos e IA.
        </p>
        <Button className="mt-5" onClick={onCreate}>
          <Plus className="size-4 mr-2" />
          Crear proyecto
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
  submitLabel = "Crear",
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
          <Label htmlFor="proj-name">Nombre</Label>
          <Input
            id="proj-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mi proyecto de automatización"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="proj-desc">Descripción (opcional)</Label>
          <Textarea
            id="proj-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="¿De qué trata este proyecto?"
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
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
        <DialogTitle>Nuevo flujo</DialogTitle>
        <DialogDescription>
          Ponle un nombre a tu flujo. Puedes renombrarlo después.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2 py-2">
        <Label htmlFor="wf-name">Nombre del flujo</Label>
        <Input
          id="wf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Flujo de confirmación de pedido"
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() => name.trim() && onSubmit(name.trim())}
          disabled={!name.trim()}
        >
          Crear flujo
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
