"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { LandingPage } from "@/components/landing/landing-page";
import { Loader2, Workflow } from "lucide-react";

/**
 * Home page — shows landing page always.
 * If user is logged in, they can go to /dashboard via button.
 * Never redirects automatically.
 */
export default function Home() {
  const { initialized, fetchUser } = useAuthStore();

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

  // Always show landing — never redirect
  return <LandingPage onLogin={() => { window.location.href = "/login"; }} />;
}
