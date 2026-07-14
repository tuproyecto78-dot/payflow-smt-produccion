"use client";

import Link from "next/link";
import { MailCheck, ArrowLeft, Inbox, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function VerificarCorreoPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader className="text-center items-center">
            <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MailCheck className="size-7" />
            </div>
            <CardTitle className="text-xl">Revisa tu correo</CardTitle>
            <CardDescription className="text-center">
              Te enviamos un enlace de confirmación a tu correo.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Inbox className="size-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Revisa tu bandeja de entrada y haz clic en el enlace de
                  confirmación que te enviamos.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  También revisa la carpeta de spam o correo no deseado.
                </p>
              </div>
            </div>

            <Button asChild className="w-full" size="lg">
              <Link href="/login">
                <ArrowLeft className="size-4 mr-2" />
                Volver a iniciar sesión
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
