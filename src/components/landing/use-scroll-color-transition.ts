"use client";
import { useEffect } from "react";

const THEMES = {
  dark: { "--page-bg": "#061426", "--text-color": "#FFFFFF", "--accent-color": "#00D084", "--nav-bg": "rgba(10, 22, 40, 0.9)", "--nav-text": "rgba(255,255,255,0.85)", "--nav-border": "rgba(0, 208, 132, 0.15)" },
  light: { "--page-bg": "#FFFFFF", "--text-color": "#07111F", "--accent-color": "#00B070", "--nav-bg": "rgba(255, 255, 255, 0.85)", "--nav-text": "rgba(7, 17, 31, 0.8)", "--nav-border": "rgba(0, 0, 0, 0.06)" },
  grey: { "--page-bg": "#F5F7FA", "--text-color": "#07111F", "--accent-color": "#00B070", "--nav-bg": "rgba(255, 255, 255, 0.85)", "--nav-text": "rgba(7, 17, 31, 0.8)", "--nav-border": "rgba(0, 0, 0, 0.06)" },
} as const;

type ThemeName = keyof typeof THEMES;

export function useScrollColorTransition(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = rootRef.current;
    if (!root) return;

    const applyTheme = (theme: ThemeName) => {
      Object.entries(THEMES[theme]).forEach(([k, v]) => root.style.setProperty(k, v));
    };
    applyTheme("dark");

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      try {
        const { gsap } = await import("gsap");
        const { ScrollTrigger } = await import("gsap/ScrollTrigger");
        if (cancelled || !rootRef.current) return;

        gsap.registerPlugin(ScrollTrigger);
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        let ctx: { revert: () => void } | undefined;
        ctx = gsap.context(() => {
          const transitionTo = (theme: ThemeName) => {
            const target = THEMES[theme];
            const current: Record<string, string> = {};
            Object.keys(target).forEach((k) => {
              current[k] = root.style.getPropertyValue(k) || THEMES.dark[k as keyof typeof THEMES.dark];
            });
            const proxy: Record<string, number> = {};
            const varKeys = Object.keys(target);
            const fromTheme = { ...current };
            const toTheme = { ...target };
            gsap.to(proxy, {
              duration: prefersReduced ? 0 : 0.6,
              ease: "power2.inOut",
              onUpdate: function () {
                const progress = this.progress();
                varKeys.forEach((k) => {
                  root.style.setProperty(k, interpolateColor(fromTheme[k], toTheme[k as keyof typeof toTheme], progress));
                });
              },
            });
          };
          const sections: Record<string, ThemeName> = { hero: "dark", plataforma: "light", beneficios: "grey", precios: "light", nosotros: "dark", footer: "dark" };
          Object.entries(sections).forEach(([section, theme]) => {
            const el = root.querySelector(`[data-section='${section}']`);
            if (el) ScrollTrigger.create({ trigger: el, start: section === "hero" ? "top 80%" : "top 70%", end: "bottom 20%", onEnter: () => transitionTo(theme), onEnterBack: () => transitionTo(theme) });
          });
        }, rootRef);

        cleanup = () => {
          ctx?.revert();
          ScrollTrigger.getAll().forEach((t) => t.kill());
        };
      } catch {
        // gsap failed — page works without scroll color transitions
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [rootRef]);
}

function interpolateColor(from: string, to: string, t: number): string {
  const f = parseColor(from);
  const t2 = parseColor(to);
  if (!f || !t2) return to;
  const r = Math.round(f.r + (t2.r - f.r) * t);
  const g = Math.round(f.g + (t2.g - f.g) * t);
  const b = Math.round(f.b + (t2.b - f.b) * t);
  const a = f.a + (t2.a - f.a) * t;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function parseColor(val: string): { r: number; g: number; b: number; a: number } | null {
  const v = val.trim();
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (m) return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]), a: m[4] ? parseFloat(m[4]) : 1 };
  const h = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (h) return { r: parseInt(h[1], 16), g: parseInt(h[2], 16), b: parseInt(h[3], 16), a: 1 };
  return null;
}
