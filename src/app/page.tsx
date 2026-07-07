"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { Loader2, Workflow } from "lucide-react";

/**
 * Home page — ultra lightweight.
 * Just checks if user is logged in and redirects.
 * No heavy imports to avoid client-side crashes.
 */
export default function Home() {
  const { user, initialized, fetchUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (initialized) {
      if (user) {
        router.replace("/dashboard");
      }
      // If no user, show landing (rendered below)
    }
  }, [initialized, user, router]);

  if (!initialized || (initialized && user)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="size-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <Workflow className="size-6 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          {user ? "Redirigiendo al panel…" : "Cargando PayFlow SMT…"}
        </div>
      </div>
    );
  }

  // User is not logged in — redirect to /login
  // (avoids importing LandingPage which has gsap and heavy components)
  router.replace("/login");
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <div className="size-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
        <Workflow className="size-6 text-primary-foreground" />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        Redirigiendo…
      </div>
    </div>
  );
}
