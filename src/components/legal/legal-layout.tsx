"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  Shield,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  FileWarning,
  ChevronRight,
  HelpCircle,
  LifeBuoy,
} from "lucide-react";

export interface LegalSection {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface LegalLayoutProps {
  /** Etiqueta corta del hero (ej. "Privacidad y confianza") */
  heroBadge: string;
  /** Título principal h1 del hero */
  heroTitle: string;
  /** Descripción breve del hero */
  heroDescription: string;
  /** Secciones para el índice lateral y scroll spy */
  sections: LegalSection[];
  /** Contenido principal (tarjetas de secciones) */
  children: React.ReactNode;
  /** Configuración del mini-CTA del índice lateral */
  sidebarCta: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    desc: string;
    buttonLabel: string;
    href: string;
  };
  /** Enlaces del footer (a la izquierda va la marca fija) */
  footerLinks: { href: string; label: string }[];
}

/**
 * LegalLayout — Sistema visual compartido para las páginas legales
 * de PayFlow SMT ("Centro de confianza").
 *
 * Lo usan /privacy y /terms para mantener una identidad visual coherente.
 */
export function LegalLayout({
  heroBadge,
  heroTitle,
  heroDescription,
  sections,
  children,
  sidebarCta,
  footerLinks,
}: LegalLayoutProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const CtaIcon = sidebarCta.icon;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ===== Encabezado fijo translúcido ===== */}
      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "bg-white/85 backdrop-blur-xl border-b border-emerald-100 shadow-sm"
            : "bg-white/70 backdrop-blur-md border-b border-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="size-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="size-5 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-slate-900">PayFlow SMT</span>
              <span className="text-[10px] text-emerald-600 font-medium">Centro de confianza</span>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <ArrowLeft className="size-4" />
            Volver al inicio
          </Link>
        </div>
      </header>

      {/* ===== Hero verde oscuro ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#052e1c] via-[#064e3b] to-[#03312a] text-white">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
          aria-hidden
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/15 border border-emerald-300/25 text-emerald-100 text-xs font-medium mb-5 backdrop-blur-sm">
              <Sparkles className="size-3.5" />
              {heroBadge}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
              {heroTitle}
            </h1>
            <p className="text-emerald-50/80 text-base md:text-lg leading-relaxed mb-7 max-w-xl">
              {heroDescription}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-100/70">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm">
                <span className="size-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Actualizada en julio de 2026
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm">
                <FileWarning className="size-3.5" />
                Versión 1.1
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Contenido principal con índice lateral ===== */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16 w-full">
        <div className="grid lg:grid-cols-[260px_1fr] gap-8 lg:gap-12">
          {/* Índice lateral fijo (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 px-3">
                Contenido
              </p>
              <nav className="space-y-1">
                {sections.map((s) => {
                  const Icon = s.icon;
                  const active = activeId === s.id;
                  return (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                        active
                          ? "bg-emerald-50 text-emerald-700 font-semibold"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className={`size-4 shrink-0 ${active ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                      <span className="leading-tight">{s.label}</span>
                      {active && <ChevronRight className="size-3.5 ml-auto text-emerald-500" />}
                    </a>
                  );
                })}
              </nav>

              {/* mini CTA lateral */}
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20">
                <CtaIcon className="size-5 mb-2" />
                <p className="text-sm font-semibold leading-tight">{sidebarCta.title}</p>
                <p className="text-[11px] text-emerald-50/80 mt-1 mb-3 leading-relaxed">
                  {sidebarCta.desc}
                </p>
                <Link
                  href={sidebarCta.href}
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {sidebarCta.buttonLabel}
                  <ArrowLeft className="size-3 rotate-180" />
                </Link>
              </div>
            </div>
          </aside>

          {/* Secciones (tarjetas) */}
          <main className="space-y-6 min-w-0">{children}</main>
        </div>
      </div>

      {/* ===== Footer ===== */}
      <footer className="mt-auto bg-slate-900 text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                <ShieldCheck className="size-4 text-white" />
              </div>
              <div className="leading-none">
                <p className="text-sm font-semibold text-white">PayFlow SMT</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Centro de confianza</p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              {footerLinks.map((l, i) => (
                <span key={l.href} className="flex items-center gap-5">
                  {i > 0 && <span className="text-slate-600">·</span>}
                  <Link href={l.href} className="text-slate-300 hover:text-emerald-400 transition-colors">
                    {l.label}
                  </Link>
                </span>
              ))}
            </nav>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} PayFlow SMT · Versión 1.1 · Actualizada en julio de 2026
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Sub-componentes reutilizables ---------- */

export function SectionCard({
  id,
  icon: Icon,
  number,
  title,
  children,
}: {
  id: string;
  icon: ComponentType<{ className?: string }>;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 bg-white rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50 p-6 md:p-8"
    >
      <div className="flex items-start gap-4 mb-5">
        <div className="size-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <Icon className="size-6 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <span className="text-xs font-semibold text-emerald-600 tracking-wider">{number}</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight mt-0.5">
            {title}
          </h2>
        </div>
      </div>
      <div className="space-y-4 text-slate-600 text-sm md:text-base leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export function HighlightRow({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm md:text-base text-slate-700">
          <span className="mt-0.5 shrink-0 size-5 rounded-full bg-emerald-100 flex items-center justify-center">
            <Shield className="size-3 text-emerald-600" />
          </span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Listas con check verde (igual que /privacy) */
export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm md:text-base text-slate-700">
          <span className="mt-0.5 shrink-0 size-5 rounded-full bg-emerald-100 flex items-center justify-center">
            <Shield className="size-3 text-emerald-600" />
          </span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function InfoCard({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
      <p className="text-sm font-semibold text-slate-900 leading-tight">{label}</p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}

export function Callout({
  type,
  children,
}: {
  type: "info" | "success" | "warning";
  children: React.ReactNode;
}) {
  const styles =
    type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : type === "warning"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-sky-50 border-sky-200 text-sky-900";
  return (
    <div className={`mt-2 rounded-xl border p-4 text-sm leading-relaxed ${styles}`}>
      {children}
    </div>
  );
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-3 mt-2">{children}</div>;
}

export function IconCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 hover:border-emerald-200 hover:shadow-sm transition-all">
      <div className="size-9 rounded-lg bg-emerald-50 flex items-center justify-center mb-2.5">
        <Icon className="size-4 text-emerald-600" />
      </div>
      <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}

/** Tarjeta destacada grande con CTA (la del final) */
export function FeatureCtaCard({
  badge,
  title,
  description,
  buttonLabel,
  href,
}: {
  badge: string;
  title: string;
  description: string;
  buttonLabel: string;
  href: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-emerald-700 text-white p-7 md:p-9 shadow-xl shadow-emerald-500/20">
      <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" aria-hidden />
      <div className="absolute -bottom-12 -left-8 w-44 h-44 rounded-full bg-emerald-300/10 blur-2xl pointer-events-none" aria-hidden />
      <div className="relative">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-xs font-medium mb-4 backdrop-blur-sm">
          <Shield className="size-3.5" />
          {badge}
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">{title}</h2>
        <p className="text-emerald-50/85 text-sm md:text-base leading-relaxed mb-6 max-w-xl">
          {description}
        </p>
        <Link
          href={href}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-emerald-700 font-semibold text-sm hover:bg-emerald-50 transition-colors shadow-lg shadow-emerald-900/20"
        >
          {buttonLabel}
          <ArrowLeft className="size-4 rotate-180" />
        </Link>
      </div>
    </div>
  );
}

/** Íconos útiles para reutilizar en ambas páginas */
export const LegalIcons = {
  Shield,
  ShieldCheck,
  HelpCircle,
  LifeBuoy,
  ArrowLeft,
};
