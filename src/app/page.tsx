"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { LandingPage } from "@/components/landing/landing-page";
import { Loader2, Workflow } from "lucide-react";

/**
 * Home page — lightweight router.
 * - If not initialized → loading spinner
 * - If no user → landing page (with link to /login)
 * - If user → redirect to /dashboard
 *
 * This page is intentionally simple to avoid client-side crashes
 * from importing too many heavy components.
 */
export default function Home() {
  const { user, initialized, fetchUser } = useAuthStore();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user && !redirecting) {
      setRedirecting(true);
      window.location.href = "/dashboard";
    }
  }, [user, redirecting]);

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

  // If user is logged in, show redirecting message
  if (user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="size-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <Workflow className="size-6 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Redirigiendo al panel…
        </div>
      </div>
    );
  }

  // Not authenticated → show landing
  return <LandingPage onLogin={() => { window.location.href = "/login"; }} />;
}
