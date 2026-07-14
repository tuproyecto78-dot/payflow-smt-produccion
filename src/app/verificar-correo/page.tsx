import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <MailCheck className="size-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-950">Confirma tu correo</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Te enviamos un enlace de seguridad. Ábrelo para verificar que el correo te pertenece y continuar con la suscripción.
        </p>
        <p className="mt-3 text-xs text-slate-500">Si no aparece, revisa spam o correo no deseado.</p>
        <Button asChild className="mt-7 w-full"><Link href="/login">Volver a iniciar sesión</Link></Button>
      </section>
    </main>
  );
}
