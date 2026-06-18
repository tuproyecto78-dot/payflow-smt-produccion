"use client";

import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string; // "user" | "admin"
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  fetchUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  fetchUser: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      set({ user: data.user ?? null, initialized: true });
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
      });
      const data = await res.json();
      if (!res.ok) {
        set({ loading: false });
        return { ok: false, error: data.error || "Error al iniciar sesión" };
      }
      set({ user: data.user, initialized: true });
      return { ok: true };
    } catch {
      set({ loading: false });
      return { ok: false, error: "Error de red" };
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
      const data = await res.json();
      if (!res.ok) {
        set({ loading: false });
        return { ok: false, error: data.error || "Error al crear la cuenta" };
      }
      set({ user: data.user, initialized: true });
      return { ok: true };
    } catch {
      set({ loading: false });
      return { ok: false, error: "Error de red" };
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
