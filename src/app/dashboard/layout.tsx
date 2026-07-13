"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
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
  Users,
  Settings,
  UserPlus,
  ScrollText,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { key: "dashboard", label: "Panel", href: "/dashboard", icon: LayoutDashboard, adminOnly: false },
  { key: "flujos", label: "Flujos", href: "/dashboard/flujos", icon: Workflow, adminOnly: false },
  { key: "ejecuciones", label: "Ejecuciones", href: "/dashboard/ejecuciones", icon: History, adminOnly: false },
  { key: "nuevos-clientes", label: "Nuevos clientes", href: "/dashboard/nuevos-clientes", icon: UserPlus, adminOnly: true },
  { key: "clientes-activos", label: "Clientes activos", href: "/dashboard/clientes-activos", icon: Users, adminOnly: true },
  { key: "solicitudes", label: "Solicitudes", href: "/dashboard/solicitudes", icon: Inbox, adminOnly: true },
  { key: "clientes", label: "Clientes", href: "/dashboard/clientes", icon: Users, adminOnly: true },
  { key: "historial", label: "Historial", href: "/dashboard/historial", icon: ScrollText, adminOnly: true },
  { key: "arquitecto", label: "Arquitecto IA", href: "/dashboard/arquitecto", icon: Brain, adminOnly: true },
  { key: "payphone", label: "PayPhone", href: "/dashboard/payphone/pruebas", icon: CreditCard, adminOnly: true },
  { key: "agent", label: "Agente IA", href: "/dashboard", icon: Bot, adminOnly: false },
  { key: "catalog", label: "Catálogo", href: "/dashboard", icon: Package, adminOnly: false },
  { key: "agenda", label: "Agenda", href: "/dashboard", icon: CalendarClock, adminOnly: false },
  { key: "legal", label: "Legal", href: "/dashboard", icon: Shield, adminOnly: true },
  { key: "configuracion", label: "Configuración", href: "/dashboard/configuracion", icon: Settings, adminOnly: false },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, initialized, fetchUser, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  // Fetch user once on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Redirect to /login if not authenticated (only after init)
  useEffect(() => {
    if (initialized && !user) {
      const next = encodeURIComponent(pathname || "/dashboard");
      window.location.href = `/login?next=${next}`;
    }
  }, [initialized, user, pathname]);

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
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase()).join("");

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-16 lg:w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-3 lg:px-5 h-16 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors">
          <div className="size-9 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/30 shrink-0">
            <Workflow className="size-5 text-primary-foreground" />
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-sm font-bold leading-tight">PayFlow</div>
            <div className="text-xs text-primary font-semibold leading-tight">SMT</div>
          </div>
        </Link>

        <nav className="flex-1 px-2 lg:px-3 py-4 space-y-1 min-h-0 overflow-y-auto">
          {NAV_ITEMS.filter(item => isAdmin || !item.adminOnly).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors justify-center lg:justify-start",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <Icon className="size-5" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div className="border-t border-sidebar-border p-2 lg:p-3">
          <div className="flex items-center gap-2.5 px-1 lg:px-2 py-1.5">
            <div className={cn("size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0", isAdmin ? "bg-amber-500/25 text-amber-300" : "bg-primary/20 text-primary")}>
              {initials || "U"}
            </div>
            <div className="hidden lg:block flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name || "Usuario"}</div>
              <div className="text-xs text-sidebar-foreground/50 truncate">{user.email}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { await logout(); window.location.href = "/login"; }} className="hidden lg:flex size-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" title="Cerrar sesión">
              <LogOut className="size-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={async () => { await logout(); window.location.href = "/login"; }} className="lg:hidden w-full text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <LogOut className="size-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
