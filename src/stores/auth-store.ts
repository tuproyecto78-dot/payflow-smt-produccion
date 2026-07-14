"use client";

import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  clientId?: string | null;
  clientStatus?: string | null;
  modules?: string[];
  active?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  fetchUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; next?: string }>;
  signup: (email: string, password: string, name: string) => Promise<{ ok: boolean; error?: string; next?: string; requiresEmailConfirmation?: boolean }>;
  logout: () => Promise<void>;
}

function safeUser(data: unknown): AuthUser | null {
  if (!data || typeof data !== "object") return null;
  const u = data as Record<string, unknown>;
  if (!u.id || !u.email) return null;
  return {
    id: String(u.id),
    email: String(u.email),
    name: (u.name as string | null) ?? null,
    role: (u.role as string) ?? "applicant",
    clientId: (u.clientId as string | null) ?? null,
    clientStatus: (u.clientStatus as string | null) ?? null,
    modules: Array.isArray(u.modules) ? (u.modules as string[]) : [],
    active: Boolean(u.active),
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  fetchUser: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      set({ user: safeUser(data.user), initialized: true });
    } catch {
      set({ user: null, initialized: true });
    } finally {
      set({ loading: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set({ loading: false });
        return { ok: false, error: data.error || "Correo o contraseña incorrectos." };
      }

      const data = await res.json();
      set({ user: safeUser(data.user), initialized: true });
      return { ok: true, next: typeof data.next === "string" ? data.next : undefined };
    } catch (err) {
      set({ loading: false });
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, error: `Error de conexión: ${msg}` };
    } finally {
      set({ loading: false });
    }
  },

  signup: async (email, password, name) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set({ loading: false });
        return { ok: false, error: data.error || "Error al crear la cuenta." };
      }

      const data = await res.json();
      set({ user: safeUser(data.user), initialized: true });
      return {
        ok: true,
        next: typeof data.next === "string" ? data.next : undefined,
        requiresEmailConfirmation: data.requiresEmailConfirmation === true,
      };
    } catch (err) {
      set({ loading: false });
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, error: `Error de conexión: ${msg}` };
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    set({ user: null });
  },
}));
