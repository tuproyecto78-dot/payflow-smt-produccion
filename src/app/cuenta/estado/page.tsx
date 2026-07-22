"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  LogOut,
  ArrowRight,
  Mail,
  Building2,
  CreditCard,
  Tag,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MeUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  clientStatus?: string | null;
  active?: boolean;
}

interface SubscriptionRequest {
  id: string;
  selectedPlan?: string;
  selectedPlanLabel?: string;
  selectedPlanPrice?: number | string;
  businessName?: string | null;
  email?: string | null;
  subscriptionStatus?: string | null;
  createdAt?: string;
}

type ProfileStatus =
  | "pending_review"
  | "activated"
  | "active"
  | "rejected"
  | "pending"
  | "unknown";

const STATUS_META: Record<
  ProfileStatus,
  { label: string; tone: "amber" | "emerald" | "red" | "muted"; icon: typeof Clock }
> = {
  pending_review: {
    label: "En revisión",
    tone: "amber",
    icon: Clock,
  },
  pending: {
    label: "Pendiente",
    tone: "amber",
    icon: Clock,
  },
  activated: {
    label: "Activada",
    tone: "emerald",
    icon: CheckCircle2,
  },
  active: {
    label: "Activa",
    tone: "emerald",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rechazada",
    tone: "red",
    icon: XCircle,
  },
  unknown: {
    label: "Sin estado",
    tone: "muted",
    icon: Clock,
  },
};

function resolveStatus(
  user: MeUser | null,
  sub?: SubscriptionRequest | null
): ProfileStatus {
  if (user?.active) return "active";
  if (user?.clientStatus === "active") return "active";
  if (sub?.subscriptionStatus === "activated") return "activated";
  if (sub?.subscriptionStatus === "rejected") return "rejected";
  if (sub?.subscriptionStatus === "pending_review") return "pending_review";
  if (sub?.subscriptionStatus === "active") return "active";
  if (user?.clientStatus === "pending_review" || user?.clientStatus === "pending")
    return "pending";
  return "pending";
}

function StatusBadge({ status }: { status: ProfileStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const toneClass = {
    amber:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    emerald:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    red: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    muted: "bg-muted text-muted-foreground border-border",
  }[meta.tone];
  return (
    <Badge variant="outline" className={cn("gap-1.5 px-2.5 py-1", toneClass)}>
      <Icon className="size-3.5" />
      {meta.label}
    </Badge>
  );
}

export default function CuentaEstadoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, subRes] = await Promise.all([
        fetch("/api/auth/me", { credentials: "include" }),
        fetch("/api/subscriptions", { credentials: "include" }),
      ]);

      let meUser: MeUser | null = null;
      if (meRes.ok) {
        const meData = await meRes.json();
        meUser = meData.user || null;
        setUser(meUser);
      }

      if (subRes.ok) {
        const subData = await subRes.json();
        const requests: SubscriptionRequest[] = Array.isArray(subData.requests)
          ? subData.requests
          : [];
        const email = meUser?.email?.toLowerCase().trim();
        const matching =
          email && requests.length > 0
            ? requests.find(
                (r) => (r.email || "").toLowerCase().trim() === email
              )
            : null;
        setSubscription(matching || requests[0] || null);
      }
    } catch {
      setError("No pudimos cargar tu información. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      setLoggingOut(false);
      window.location.href = "/login";
    }
  }

  const status = resolveStatus(user, subscription);
  const isApproved = status === "active" || status === "activated";
  const isRejected = status === "rejected";

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">
            Estado de tu cuenta
          </h1>
          <p className="text-sm text-muted-foreground">
            Revisa el estado de tu solicitud y los detalles de tu plan.
          </p>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Cargando…</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void loadData()}>
                Reintentar
              </Button>
            </CardContent>
          </Card>
        ) : !user ? (
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No has iniciado sesión.
              </p>
              <Button onClick={() => router.push("/login")}>
                Ir a iniciar sesión
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">Tu solicitud</CardTitle>
                  <CardDescription>
                    Información de tu cuenta y plan contratado.
                  </CardDescription>
                </div>
                <StatusBadge status={status} />
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailRow
                  icon={Mail}
                  label="Correo"
                  value={user.email || "—"}
                />
                <DetailRow
                  icon={Tag}
                  label="Plan solicitado"
                  value={
                    subscription?.selectedPlanLabel ||
                    (subscription?.selectedPlan
                      ? String(subscription.selectedPlan)
                      : "—")
                  }
                />
                <DetailRow
                  icon={CreditCard}
                  label="Precio"
                  value={
                    subscription?.selectedPlanPrice != null
                      ? `$${subscription.selectedPlanPrice}`
                      : "—"
                  }
                />
                <DetailRow
                  icon={Building2}
                  label="Negocio"
                  value={subscription?.businessName || "—"}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5 space-y-4">
                {status === "pending_review" || status === "pending" ? (
                  <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
                    <Clock className="size-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Tu solicitud está en revisión. Te contactaremos pronto.
                    </p>
                  </div>
                ) : isApproved ? (
                  <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-emerald-800 dark:text-emerald-200">
                      ¡Tu cuenta está activa! Ya puedes acceder a tu panel.
                    </p>
                  </div>
                ) : isRejected ? (
                  <div className="flex items-start gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-4">
                    <XCircle className="size-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-800 dark:text-red-200">
                      Tu solicitud fue rechazada. Contacta a soporte.
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col sm:flex-row gap-2">
                  {isApproved && (
                    <Button
                      className="flex-1"
                      onClick={() => router.push("/dashboard")}
                    >
                      Ir al dashboard
                      <ArrowRight className="size-4 ml-2" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className={cn(!isApproved && "w-full")}
                  >
                    {loggingOut ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <LogOut className="size-4 mr-2" />
                    )}
                    Cerrar sesión
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="text-sm font-medium text-right truncate max-w-[60%]">
        {value}
      </div>
    </div>
  );
}
