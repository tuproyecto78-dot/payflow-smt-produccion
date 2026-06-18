"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Workflow,
  MessageCircle,
  CreditCard,
  Bot,
  Zap,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";

export function AuthView() {
  const { login, signup, loading } = useAuthStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result =
      mode === "login"
        ? await login(email, password)
        : await signup(email, password, name);
    if (!result.ok) {
      setError(result.error || "Algo salió mal");
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background">
      {/* Panel de marca */}
      <div className="relative lg:w-1/2 bg-sidebar text-sidebar-foreground p-8 lg:p-14 flex flex-col justify-between overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #10b981 0, transparent 40%), radial-gradient(circle at 80% 70%, #22c55e 0, transparent 45%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Workflow className="size-6 text-primary-foreground" />
          </div>
          <div className="text-xl font-bold tracking-tight">
            PayFlow <span className="text-primary">SMT</span>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <h1 className="text-3xl lg:text-4xl font-bold leading-tight">
            Crea flujos de automatización de WhatsApp y pagos visualmente.
          </h1>
          <p className="text-sidebar-foreground/70 text-base lg:text-lg">
            Arrastra, suelta y conecta nodos para diseñar automatizaciones
            potentes — sin código. Ejecuta agentes de IA, procesa pagos y
            dispara webhooks desde un solo lienzo.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { icon: MessageCircle, label: "Mensajería WhatsApp" },
              { icon: CreditCard, label: "Flujos de pago" },
              { icon: Bot, label: "Agentes de IA" },
              { icon: Zap, label: "API y webhooks" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg bg-sidebar-accent/60 px-3 py-2 text-sm"
              >
                <Icon className="size-4 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-sm text-sidebar-foreground/60">
          <CheckCircle2 className="size-4 text-primary" />
          Versión MVP · Constructor visual de flujos
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {mode === "login"
                ? "Inicia sesión para abrir tu panel de flujos."
                : "Comienza a crear flujos de automatización en minutos."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Nombre completo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
              {mode === "signup" && (
                <p className="text-xs text-muted-foreground">
                  Mínimo 6 caracteres.
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2 border border-destructive/20">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
              {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                ¿No tienes una cuenta?{" "}
                <button
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                >
                  Regístrate
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes una cuenta?{" "}
                <button
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                >
                  Inicia sesión
                </button>
              </>
            )}
          </div>

          {mode === "login" && (
            <div className="mt-6 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300 mb-1">
                <ShieldCheck className="size-3.5" />
                Acceso de administrador
              </div>
              <div className="text-amber-800/80 dark:text-amber-200/70 space-y-0.5 font-mono text-[11px]">
                <div>Correo: admin@payflow.smt</div>
                <div>Contraseña: admin123</div>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div className="mt-6 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Consejo:</span> te
              creamos un proyecto inicial con un flujo automáticamente.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
