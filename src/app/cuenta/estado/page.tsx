"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, CreditCard, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type AccountUser = { email: string; active: boolean; clientStatus?: string | null };

export default function AccountStatusPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) return router.replace("/login");
        if (data.user.active) return router.replace("/dashboard");
        setUser(data.user);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (loading || !user) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="size-7 animate-spin text-emerald-600" /></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-2xl border bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-950 text-white"><ShieldCheck className="size-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Tu cuenta está protegida</h1>
            <p className="mt-1 text-sm text-slate-600">{user.email}</p>
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-5">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <h2 className="mt-3 font-semibold">Identidad verificada</h2>
            <p className="mt-1 text-sm text-slate-600">El correo ya fue validado correctamente.</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <CreditCard className="size-5 text-amber-700" />
            <h2 className="mt-3 font-semibold">Suscripción pendiente</h2>
            <p className="mt-1 text-sm text-slate-600">El dashboard se habilitará cuando el pago sea confirmado.</p>
          </div>
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="sm:flex-1"><Link href="/#suscripcion">Seleccionar o revisar plan</Link></Button>
          <Button variant="outline" onClick={logout}><LogOut className="mr-2 size-4" />Cerrar sesión</Button>
        </div>
      </section>
    </main>
  );
}
