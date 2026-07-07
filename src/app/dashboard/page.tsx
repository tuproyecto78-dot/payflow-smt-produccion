"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  Workflow,
  LayoutDashboard,
  History,
  Inbox,
  CreditCard,
  Bot,
  Package,
  CalendarClock,
  Shield,
  Lock,
  LogOut,
  Loader2,
  Sparkles,
  FolderKanban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CreateFlowDialog } from "@/components/dashboard/create-flow-dialog";

export default function DashboardPage() {
  const { user, initialized, fetchUser, logout } = useAuthStore();
  const [nav, setNav] = useState<
    "dashboard" | "executions" | "subscriptions" | "payphone" | "agent" | "catalog" | "agenda" | "legal" | "settings"
  >("dashboard");
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);

  // Fetch user on mount — with 8s timeout
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch("/api/auth/me", { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        useAuthStore.setState({
          user: data.user || null,
          initialized: true,
        });
      })
      .catch(() => {
        // Timeout or network error — treat as not logged in
        useAuthStore.setState({ user: null, initialized: true });
      })
      .finally(() => clearTimeout(timeout));
  }, []);

  // Load projects when user is available
  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user]);

  // Redirect to /login if not authenticated (after init)
  useEffect(() => {
    if (initialized && !user && !redirecting) {
      setRedirecting(true);
      window.location.href = "/login";
    }
  }, [initialized, user, redirecting]);

  async function loadProjects() {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // API might not be available
    } finally {
      setLoadingProjects(false);
    }
  }

  async function createFlow() {
    setCreateFlowOpen(true);
  }

  // Loading state
  if (!initialized || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="size-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <Workflow className="size-6 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          {initialized ? "Redirigiendo al login…" : "Cargando PayFlow SMT…"}
        </div>
      </div>
    );
  }

  const isAdmin = user.role === "super_admin" || user.role === "admin";

  const initials = (user.name || user.email || "U")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-16 lg:w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <button
          onClick={() => setNav("dashboard")}
          className="flex items-center gap-2.5 px-3 lg:px-5 h-16 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors"
        >
          <div className="size-9 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/30 shrink-0">
            <Workflow className="size-5 text-primary-foreground" />
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-sm font-bold leading-tight">PayFlow</div>
            <div className="text-xs text-primary font-semibold leading-tight">SMT</div>
          </div>
        </button>

        <nav className="flex-1 px-2 lg:px-3 py-4 space-y-1 min-h-0 overflow-y-auto">
          <NavBtn icon={<LayoutDashboard className="size-5" />} label="Panel" active={nav === "dashboard"} onClick={() => setNav("dashboard")} />
          <NavBtn icon={<History className="size-5" />} label="Ejecuciones" active={nav === "executions"} onClick={() => setNav("executions")} />
          {isAdmin && (
            <>
              <NavBtn icon={<Inbox className="size-5" />} label="Solicitudes" active={nav === "subscriptions"} onClick={() => setNav("subscriptions")} />
              <NavBtn icon={<CreditCard className="size-5" />} label="PayPhone" active={nav === "payphone"} onClick={() => setNav("payphone")} />
              <NavBtn icon={<Bot className="size-5" />} label="Agente IA" active={nav === "agent"} onClick={() => setNav("agent")} />
              <NavBtn icon={<Package className="size-5" />} label="Catálogo" active={nav === "catalog"} onClick={() => setNav("catalog")} />
              <NavBtn icon={<CalendarClock className="size-5" />} label="Agenda" active={nav === "agenda"} onClick={() => setNav("agenda")} />
              <NavBtn icon={<Shield className="size-5" />} label="Legal" active={nav === "legal"} onClick={() => setNav("legal")} />
            </>
          )}
          <NavBtn icon={<Lock className="size-5" />} label="Contraseña" active={nav === "settings"} onClick={() => setNav("settings")} />
        </nav>

        {/* User + Logout */}
        <div className="border-t border-sidebar-border p-2 lg:p-3">
          <div className="flex items-center gap-2.5 px-1 lg:px-2 py-1.5">
            <div className={cn(
              "size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
              isAdmin ? "bg-amber-500/25 text-amber-300" : "bg-primary/20 text-primary"
            )}>
              {initials || "U"}
            </div>
            <div className="hidden lg:block flex-1 min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                {user.name || "Usuario"}
                {isAdmin && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300 leading-none">
                    {user.role === "super_admin" ? "SUPER" : "ADMIN"}
                  </span>
                )}
              </div>
              <div className="text-xs text-sidebar-foreground/50 truncate">{user.email}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await logout();
                window.location.href = "/login";
              }}
              className="hidden lg:flex size-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              title="Cerrar sesión"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout();
              window.location.href = "/login";
            }}
            className="lg:hidden w-full text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <LogOut className="size-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {nav === "dashboard" && <DashboardContent user={user} onCreateFlow={createFlow} loadingProjects={loadingProjects} projects={projects} />}
          {nav === "executions" && <PlaceholderView title="Ejecuciones" desc="Historial de ejecuciones de flujos." />}
          {nav === "subscriptions" && <PlaceholderView title="Solicitudes" desc="Solicitudes de suscripción pendientes." />}
          {nav === "payphone" && <PlaceholderView title="PayPhone" desc="Configuración de PayPhone." />}
          {nav === "agent" && <PlaceholderView title="Agente IA" desc="Configuración del agente comercial." />}
          {nav === "catalog" && <PlaceholderView title="Catálogo" desc="Gestión de productos." />}
          {nav === "agenda" && <PlaceholderView title="Agenda" desc="Gestión de citas." />}
          {nav === "legal" && <PlaceholderView title="Legal" desc="Consentimientos y solicitudes de datos." />}
          {nav === "settings" && <PlaceholderView title="Contraseña" desc="Cambia tu contraseña." />}
        </div>
      </main>
    </div>
  );
}

function DashboardContent({ user, onCreateFlow, loadingProjects, projects }: { user: any; onCreateFlow: () => void; loadingProjects: boolean; projects: any[] }) {
  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Panel administrador
          </h1>
          <p className="text-muted-foreground mt-1">
            Bienvenido, {user.name || user.email}. Gestiona tus flujos de WhatsApp, pagos e IA.
          </p>
        </div>
        <Button onClick={onCreateFlow} className="bg-purple-500 hover:bg-purple-600 text-white">
          <Sparkles className="size-4 mr-2" />
          Crear flujo automático
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Flujos activos" value={String(projects.length)} icon={<Workflow className="size-5" />} />
        <StatCard title="Ejecuciones" value="0" icon={<History className="size-5" />} />
        <StatCard title="Pagos" value="$0" icon={<CreditCard className="size-5" />} />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Proyectos</h2>
        {loadingProjects ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> Cargando proyectos…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <FolderKanban className="size-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">
              No hay proyectos todavía. Crea tu primer flujo automático para empezar.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p: any) => (
              <div key={p.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderKanban className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base truncate">{p.name}</h3>
                    {p.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function PlaceholderView({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-10">
      <h1 className="text-2xl font-bold tracking-tight mb-2">{title}</h1>
      <p className="text-muted-foreground">{desc}</p>
      <div className="mt-6 rounded-xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">Esta sección estará disponible próximamente.</p>
      </div>
    </div>
  );
}

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors justify-center lg:justify-start",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
