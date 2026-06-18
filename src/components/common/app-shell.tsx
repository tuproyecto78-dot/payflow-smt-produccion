"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { AuthView } from "@/components/auth/auth-view";
import { Sidebar } from "@/components/common/sidebar";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { ExecutionsView } from "@/components/dashboard/executions-view";
import { EditorView } from "@/components/editor/editor-view";
import { Loader2, Workflow } from "lucide-react";

export function AppShell() {
  const { user, initialized, fetchUser } = useAuthStore();
  const { view, activeWorkflow, goDashboard } = useAppStore();
  const [nav, setNav] = useState<"dashboard" | "executions">("dashboard");

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="size-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <Workflow className="size-6 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Cargando PayFlow SMT…
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  // Editor view takes over the whole screen (no sidebar nav switching)
  if (view === "editor" && activeWorkflow) {
    return (
      <div className="h-screen flex overflow-hidden">
        <Sidebar activeNav="dashboard" onNavigate={(n) => { goDashboard(); setNav(n); }} />
        <EditorView workflow={activeWorkflow} />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar activeNav={nav} onNavigate={setNav} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {nav === "dashboard" ? <DashboardView /> : <ExecutionsView />}
      </main>
    </div>
  );
}
