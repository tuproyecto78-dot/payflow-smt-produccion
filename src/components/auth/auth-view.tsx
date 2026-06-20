"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
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
  ArrowLeft,
} from "lucide-react";

export function AuthView() {
  const { login, signup, loading } = useAuthStore();
  const { setActiveProject } = useAppStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Volver a la landing page pública.
  function goLanding() {
    setActiveProject(null);
    // Reset del estado de auth para mostrar landing.
    window.location.href = "/";
  }

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
      <div className="relative lg:w-1/2 bg-[#0a1628] text-white p-8 lg:p-14 flex flex-col justify-between overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #00D084 0, transparent 40%), radial-gradient(circle at 80% 70%, #20E68A 0, transparent 45%)",
          }}
        />
        {/* Logo clickeable que lleva a la landing */}
        <button
          onClick={goLanding}
          className="relative flex items-center gap-3 group"
          title="Volver a PayFlow SMT"
        >
          <img
            src="/payflow-logo-dark.png"
            srcSet="/payflow-logo-dark.png 2x"
            alt="PayFlow SMT"
            className="h-10 w-auto object-contain group-hover:opacity-80 transition-opacity"
            draggable={false}
          />
        </button>

        <div className="relative space-y-6 max-w-md">
          <h1 className="text-3xl lg:text-4xl font-bold leading-tight">
            Crea flujos de automatización de WhatsApp y pagos visualmente.
          </h1>
          <p className="text-white/70 text-base lg:text-lg">
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
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <Icon className="size-4 text-emerald-400" />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-sm text-white/50">
          <CheckCircle2 className="size-4 text-emerald-400" />
          Plataforma de automatización de pagos
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
        {/* Enlace para volver a la landing */}
        <button
          onClick={goLanding}
          className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Volver a PayFlow SMT
        </button>

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
        </div>
      </div>
    </div>
  );
}
