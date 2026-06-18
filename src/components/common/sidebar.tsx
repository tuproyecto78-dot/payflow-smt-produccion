"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Workflow,
  LayoutDashboard,
  History,
  LogOut,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeNav: "dashboard" | "executions";
  onNavigate: (nav: "dashboard" | "executions") => void;
}

export function Sidebar({ activeNav, onNavigate }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const { activeWorkflow, goDashboard } = useAppStore();
  const isAdmin = user?.role === "admin";

  const initials = (user?.name || user?.email || "U")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <aside className="w-16 lg:w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      {/* Brand */}
      <button
        onClick={goDashboard}
        className="flex items-center gap-2.5 px-3 lg:px-5 h-16 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors"
      >
        <div className="size-9 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/30 shrink-0">
          <Workflow className="size-5 text-primary-foreground" />
        </div>
        <div className="hidden lg:block text-left">
          <div className="text-sm font-bold leading-tight">
            PayFlow
          </div>
          <div className="text-xs text-primary font-semibold leading-tight">
            SMT
          </div>
        </div>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 lg:px-3 py-4 space-y-1 min-h-0 overflow-y-auto pf-scroll">
        <NavItem
          icon={<LayoutDashboard className="size-5" />}
          label="Panel"
          active={activeNav === "dashboard"}
          onClick={() => onNavigate("dashboard")}
        />
        <NavItem
          icon={<History className="size-5" />}
          label="Ejecuciones"
          active={activeNav === "executions"}
          onClick={() => onNavigate("executions")}
        />
        {activeWorkflow && (
          <div className="hidden lg:block pt-4 mt-4 border-t border-sidebar-border">
            <div className="px-3 text-[11px] uppercase tracking-wider text-sidebar-foreground/40 mb-2">
              Flujo activo
            </div>
            <div className="px-3 py-2 rounded-md bg-sidebar-accent/60 text-xs">
              <div className="font-medium truncate">{activeWorkflow.name}</div>
              <button
                onClick={goDashboard}
                className="mt-1 flex items-center gap-1 text-primary hover:underline"
              >
                Volver al panel <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-2 lg:p-3">
        <div className="flex items-center gap-2.5 px-1 lg:px-2 py-1.5">
          <Avatar className="size-8 border border-sidebar-border">
            <AvatarFallback
              className={cn(
                "text-xs font-semibold",
                isAdmin
                  ? "bg-amber-500/25 text-amber-300"
                  : "bg-primary/20 text-primary"
              )}
            >
              {initials || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="hidden lg:block flex-1 min-w-0">
            <div className="text-sm font-medium truncate flex items-center gap-1.5">
              {user?.name || "Usuario"}
              {isAdmin && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300 leading-none">
                  <ShieldCheck className="size-2.5" />
                  ADMIN
                </span>
              )}
            </div>
            <div className="text-xs text-sidebar-foreground/50 truncate">
              {user?.email}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            className="hidden lg:flex size-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            title="Cerrar sesión"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="lg:hidden w-full text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <LogOut className="size-4 mr-2" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors justify-center lg:justify-start",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
