"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { LandingPage } from "@/components/landing/landing-page";
import { AuthView } from "@/components/auth/auth-view";
import { Sidebar } from "@/components/common/sidebar";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { ExecutionsView } from "@/components/dashboard/executions-view";
import { SubscriptionsView } from "@/components/dashboard/subscriptions-view";
import { ChangePasswordView } from "@/components/dashboard/change-password-view";
import { PayPhoneConfigView } from "@/components/dashboard/payphone-config-view";
import { CommercialAgentView } from "@/components/dashboard/commercial-agent-view";
import { CatalogView } from "@/components/dashboard/catalog-view";
import { AgendaView } from "@/components/dashboard/agenda-view";
import { EditorView } from "@/components/editor/editor-view";
import { Loader2, Workflow } from "lucide-react";

type AdminNav = "dashboard" | "executions" | "subscriptions" | "payphone" | "agent" | "catalog" | "agenda" | "settings";

export function AppShell() {
  const { user, initialized, fetchUser } = useAuthStore();
  const { view, activeWorkflow, goDashboard } = useAppStore();
  const [nav, setNav] = useState<AdminNav>("dashboard");
  const [showAuth, setShowAuth] = useState(false);

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

  // No autenticado → landing page (con opción a abrir auth)
  if (!user) {
    if (showAuth) {
      return <AuthView />;
    }
    return <LandingPage onLogin={() => setShowAuth(true)} />;
  }

  // Editor view takes over the whole screen
  if (view === "editor" && activeWorkflow) {
    return (
      <div className="h-screen flex overflow-hidden">
        <Sidebar activeNav="dashboard" onNavigate={(n) => { goDashboard(); setNav(n as AdminNav); }} />
        <EditorView workflow={activeWorkflow} />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar activeNav={nav} onNavigate={setNav} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {nav === "dashboard" && <DashboardView />}
        {nav === "executions" && <ExecutionsView />}
        {nav === "subscriptions" && <SubscriptionsView />}
        {nav === "payphone" && <PayPhoneConfigView />}
        {nav === "agent" && <CommercialAgentView />}
        {nav === "catalog" && <CatalogView />}
        {nav === "agenda" && <AgendaView />}
        {nav === "settings" && <ChangePasswordView />}
      </main>
    </div>
  );
}
