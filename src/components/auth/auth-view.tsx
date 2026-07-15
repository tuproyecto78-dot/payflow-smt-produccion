"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  MessageCircle,
  CreditCard,
  Bot,
  Zap,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";

function readUrlParams(): { mode: "login" | "signup"; showBanner: boolean } {
  if (typeof window === "undefined") return { mode: "login", showBanner: false };
  const params = new URLSearchParams(window.location.search);
  return {
    mode: params.get("mode") === "signup" ? "signup" : "login",
    showBanner: params.get("subscription") === "completed",
  };
}

export function AuthView() {
  const { login, signup, loading } = useAuthStore();
  const { setActiveProject } = useAppStore();
  const initial = readUrlParams();
  const [mode, setMode] = useState<"login" | "signup">(initial.mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showSubscriptionBanner] = useState(initial.showBanner);

  function goLanding() {
    setActiveProject(null);
    window.location.href = "/";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      return;
    }

    const result =
      mode === "login"
        ? await login(email, password)
        : await signup(email, password, name);

    if (!result.ok) {
      setError(result.error || "Algo salió mal");
      return;
    }

    if (mode === "signup") {
      window.location.href =
        result.next ||
        (result.requiresEmailConfirmation ? "/verificar-correo" : "/cuenta/estado");
      return;
    }

    // The server decides whether the account may enter the dashboard or must
    // finish verification/subscription first.
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("next");
    window.location.href = result.next || requested || "/dashboard";
  }

  function onGoogle() {
    setError(null);
    setGoogleLoading(true);
    const params = new URLSearchParams(window.location.search);
    const nextParam = params.get("next") || "/cuenta/estado";
    window.location.href = `/api/auth/google?next=${encodeURIComponent(nextParam)}`;
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background">
      {/* ─── Panel de marca ─── */}
      <div className="relative lg:w-1/2 bg-[#0a1628] text-white px-6 pt-8 pb-10 sm:px-8 sm:pt-10 sm:pb-14 lg:p-14 flex flex-col justify-between overflow-hidden shrink-0">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #00D084 0, transparent 40%), radial-gradient(circle at 80% 70%, #20E68A 0, transparent 45%)",
          }}
        />

        {/* Logo */}
        <button
          onClick={goLanding}
          className="relative flex items-center gap-3 group"
          title="Volver a PayFlow SMT"
        >
          <img
            src="/payflow-logo-dark.png"
            srcSet="/payflow-logo-dark.png 2x"
            alt="PayFlow SMT"
            className="h-8 sm:h-10 w-auto object-contain group-hover:opacity-80 transition-opacity"
            draggable={false}
          />
        </button>

        {/* Texto branding */}
        <div className="relative space-y-6 max-w-md py-6 sm:py-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
            Crea flujos de automatización de WhatsApp y pagos visualmente.
          </h1>
          <p className="text-white/70 text-sm sm:text-base lg:text-lg">
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
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs sm:text-sm"
              >
                <Icon className="size-4 text-emerald-400 shrink-0" />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Footer branding */}
        <div className="relative flex items-center gap-2 text-sm text-white/50">
          <CheckCircle2 className="size-4 text-emerald-400" />
          Plataforma de automatización de pagos
        </div>
      </div>

      {/* ─── Panel de formulario ─── */}
      {/* Mobile: single column, no absolute positioning, clean flow */}
      {/* Desktop: side by side, link is absolute top-left */}
      <div className="lg:w-1/2 flex flex-col items-center justify-center px-6 pt-12 pb-12 sm:px-8 sm:pt-14 sm:pb-16 lg:p-12 lg:relative">
        {/* "Volver" link — normal flow on mobile, absolute on desktop only */}
        <div className="w-full max-w-sm mb-8 lg:absolute lg:top-6 lg:left-6 lg:mb-0 lg:max-w-none">
          <button
            onClick={goLanding}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Volver a PayFlow SMT
          </button>
        </div>

        {/* Form container */}
        <div className="w-full max-w-sm">
          {/* Title — clean spacing, no overlap */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              {mode === "login"
                ? "Inicia sesión para abrir tu panel de flujos."
                : "Comienza a crear flujos de automatización en minutos."}
            </p>
          </div>

          {showSubscriptionBanner && (
            <Alert className="mb-5 border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
              <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
              <AlertTitle>¡Solicitud enviada!</AlertTitle>
              <AlertDescription className="text-emerald-700 dark:text-emerald-300">
                Regístrate o inicia sesión para continuar.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
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
                  Mínimo 10 caracteres.
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
              disabled={loading || googleLoading}
            >
              {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
              {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </Button>
          </form>

          {/* Separator */}
          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              o continúa con
            </span>
            <Separator className="flex-1" />
          </div>

          {/* Google OAuth */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            onClick={onGoogle}
            disabled={loading || googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <GoogleIcon className="size-4 mr-2" />
            )}
            Continuar con Google
          </Button>

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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
