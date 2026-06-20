"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2, Lock, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function ChangePasswordView() {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (newPwd.length < 8) {
      toast.error("La nueva contraseña debe tener mínimo 8 caracteres.");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("La nueva contraseña y la confirmación no coinciden.");
      return;
    }
    if (newPwd === currentPwd) {
      toast.error("La nueva contraseña no puede ser igual a la actual.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPwd,
          new_password: newPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al cambiar la contraseña.");
        return;
      }
      toast.success("Contraseña actualizada correctamente.");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch {
      toast.error("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto pf-scroll">
      <div className="max-w-xl mx-auto p-6 lg:p-10">
        <div className="mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Lock className="size-5 text-primary" />
            Cambiar contraseña
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Actualiza tu contraseña para mantener tu cuenta segura.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seguridad de la cuenta</CardTitle>
            <CardDescription>
              La nueva contraseña debe tener mínimo 8 caracteres.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-pwd">Contraseña actual</Label>
                <div className="relative">
                  <Input
                    id="current-pwd"
                    type={showCurrent ? "text" : "password"}
                    required
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-pwd">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="new-pwd"
                    type={showNew ? "text" : "password"}
                    required
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {newPwd.length > 0 && newPwd.length < 8 && (
                  <p className="text-xs text-destructive">
                    Mínimo 8 caracteres.
                  </p>
                )}
                {newPwd.length >= 8 && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    Contraseña válida.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-pwd">Confirmar nueva contraseña</Label>
                <Input
                  id="confirm-pwd"
                  type="password"
                  required
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                {confirmPwd.length > 0 && confirmPwd !== newPwd && (
                  <p className="text-xs text-destructive">
                    Las contraseñas no coinciden.
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                Actualizar contraseña
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
