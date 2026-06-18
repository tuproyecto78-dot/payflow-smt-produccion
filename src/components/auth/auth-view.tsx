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
      setError(result.error || "Something went wrong");
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background">
      {/* Branding panel */}
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
            Build WhatsApp automation &amp; payment workflows visually.
          </h1>
          <p className="text-sidebar-foreground/70 text-base lg:text-lg">
            Drag, drop, and connect nodes to design powerful automations — no
            code required. Run AI agents, process payments, and trigger
            webhooks from one canvas.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { icon: MessageCircle, label: "WhatsApp messaging" },
              { icon: CreditCard, label: "Payment flows" },
              { icon: Bot, label: "AI agents" },
              { icon: Zap, label: "API & webhooks" },
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
          MVP build · Visual workflow builder
        </div>
      </div>

      {/* Form panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {mode === "login"
                ? "Sign in to open your workflow dashboard."
                : "Start building automation workflows in minutes."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
                  At least 6 characters.
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
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          {mode === "signup" && (
            <div className="mt-6 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Demo tip:</span> we
              create a starter project with a workflow for you automatically.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
