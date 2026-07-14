"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Workflow,
  MessageCircle,
  Bot,
  CreditCard,
  CheckCircle2,
  Zap,
  Shield,
  Phone,
  Mail,
  ArrowRight,
  Menu,
  X,
  Sparkles,
  Globe,
  Lock,
  Rocket,
  TrendingUp,
  Clock,
  Users,
  ArrowDown,
  Star,
  Cpu,
  Layers,
  Plug,
  Smartphone,
  QrCode,
} from "lucide-react";
import { SubscriptionForm } from "./subscription-form";
import { useLandingAnimations } from "./use-landing-animations";
import { useScrollColorTransition } from "./use-scroll-color-transition";
import { cn } from "@/lib/utils";

interface LandingPageProps {
  onLogin: () => void;
}

type SectionName = "plataforma" | "precios" | "nosotros";

export function LandingPage({ onLogin }: LandingPageProps) {
  const [activeSection, setActiveSection] = useState<SectionName>("plataforma");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [subPlan, setSubPlan] = useState<"trimestral" | "anual" | "choose" | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollColorTransition(rootRef);
  useLandingAnimations(rootRef);

  // Scroll progress bar + navbar state
  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollProgress(progress);
      setScrolled(scrollTop > 20);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Active section observer
  useEffect(() => {
    const sections = ["plataforma", "precios", "nosotros"];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace("section-", "").replace("-content", "");
            if (sections.includes(id)) setActiveSection(id as SectionName);
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(`section-${s}`);
      if (el) observer.observe(el);
      const el2 = document.getElementById(`section-${s}-content`);
      if (el2) observer.observe(el2);
    });
    return () => observer.disconnect();
  }, []);

  function scrollToSection(section: SectionName) {
    setActiveSection(section);
    setMobileMenuOpen(false);
    document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div
      ref={rootRef}
      className="min-h-screen relative transition-colors duration-500 overflow-x-clip"
      style={
        {
          "--page-bg": "#061426",
          "--text-color": "#FFFFFF",
          "--accent-color": "#00D084",
          "--nav-bg": "rgba(10, 22, 40, 0.9)",
          "--nav-text": "rgba(255,255,255,0.85)",
          "--nav-border": "rgba(0, 208, 132, 0.15)",
        } as React.CSSProperties
      }
    >
      {/* Scroll progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-transparent pointer-events-none" aria-hidden>
        <div
          className="h-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 transition-[width] duration-150 ease-out shadow-[0_0_12px_rgba(0,208,132,0.6)]"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Ambient glow blobs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute top-[8%] left-[3%] w-[480px] h-[480px] rounded-full blur-[140px] opacity-25 animate-pf-float-slow"
          style={{ background: "radial-gradient(circle, #00D084 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-[45%] right-[5%] w-[560px] h-[560px] rounded-full blur-[160px] opacity-20 animate-pf-float-slower"
          style={{ background: "radial-gradient(circle, #0B1F33 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-[15%] left-[35%] w-[400px] h-[400px] rounded-full blur-[120px] opacity-15 animate-pf-float-slow"
          style={{ background: "radial-gradient(circle, #20E68A 0%, transparent 70%)" }}
        />
      </div>

      {/* Navbar */}
      <header
        className={cn(
          "sticky top-0 z-40 transition-all duration-300 border-b",
          scrolled
            ? "backdrop-blur-xl shadow-lg shadow-black/20"
            : "backdrop-blur-md"
        )}
        style={{ backgroundColor: "var(--nav-bg)", borderColor: "var(--nav-border)", color: "var(--nav-text)" }}
      >
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => scrollToSection("plataforma")}
            className="flex items-center gap-2 shrink-0 group"
            aria-label="PayFlow SMT inicio"
          >
            <div className="relative">
              <div className="absolute -inset-1 bg-emerald-500/30 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <img
                src="/payflow-logo-dark.png"
                srcSet="/payflow-logo-dark.png 2x"
                alt="PayFlow SMT"
                className="relative h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                draggable={false}
              />
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <NavPill active={activeSection === "plataforma"} onClick={() => scrollToSection("plataforma")}>
              Plataforma
            </NavPill>
            <NavPill active={activeSection === "precios"} onClick={() => scrollToSection("precios")}>
              Precios
            </NavPill>
            <NavPill active={activeSection === "nosotros"} onClick={() => scrollToSection("nosotros")}>
              Nosotros
            </NavPill>
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={onLogin}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => setSubPlan("choose")}
              className="group relative px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/50 hover:-translate-y-0.5"
            >
              <span className="relative z-10 flex items-center gap-1.5">
                Suscribirme
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          </div>

          <button
            className="md:hidden p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-emerald-500/15 px-4 py-3 space-y-1 bg-[#0a1628]/95 backdrop-blur-xl">
            <NavButton active={activeSection === "plataforma"} onClick={() => scrollToSection("plataforma")} full>
              Plataforma
            </NavButton>
            <NavButton active={activeSection === "precios"} onClick={() => scrollToSection("precios")} full>
              Precios
            </NavButton>
            <NavButton active={activeSection === "nosotros"} onClick={() => scrollToSection("nosotros")} full>
              Nosotros
            </NavButton>
            <div className="flex flex-col gap-2 pt-3">
              <button
                onClick={onLogin}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:text-white border border-white/15 w-full text-center transition-colors"
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => {
                  setSubPlan("anual");
                  setMobileMenuOpen(false);
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white w-full text-center transition-colors"
              >
                Suscribirme
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ===== HERO ===== */}
      <section
        id="section-plataforma"
        data-section="hero"
        className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden"
      >
        <div className="absolute inset-0 z-0">
          <img
            data-hero-bg
            src="/hero-bg-modern.png"
            alt="Plataforma de automatización de pagos PayFlow SMT"
            className="size-full object-cover object-center will-change-transform"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, rgba(6,20,38,0.97) 0%, rgba(6,20,38,0.85) 35%, rgba(6,20,38,0.55) 65%, rgba(6,40,30,0.88) 100%)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/25 via-transparent to-emerald-500/10 mix-blend-screen" />
          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(0,208,132,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,208,132,0.4) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            {/* Left content */}
            <div className="lg:col-span-7 max-w-2xl">
              <div data-hero-logo className="mb-6 relative inline-block">
                <div className="absolute -inset-3 bg-emerald-500/20 rounded-full blur-2xl animate-pf-pulse-soft" />
                <img
                  src="/payflow-logo-dark.png"
                  srcSet="/payflow-logo-dark.png 2x"
                  alt="PayFlow SMT"
                  className="relative h-14 md:h-16 w-auto object-contain"
                  draggable={false}
                />
              </div>

              <div data-hero-badge className="mb-5 inline-flex">
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-400/30 backdrop-blur-sm gap-1.5 px-3 py-1.5 text-xs font-medium">
                  <Sparkles className="size-3.5" />
                  Plataforma de automatización de pagos
                </Badge>
              </div>

              <h1
                data-hero-title
                className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight mb-6 leading-[1.05] text-white"
              >
                Automatiza pagos por{" "}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">
                    WhatsApp
                  </span>
                  <svg
                    className="absolute -bottom-2 left-0 w-full h-3 text-emerald-400/60"
                    viewBox="0 0 200 12"
                    fill="none"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M2 9C40 3 160 3 198 9"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>{" "}
                con <span className="text-emerald-400">IA</span>
              </h1>

              <p
                data-hero-desc
                className="text-base md:text-lg text-slate-200/90 max-w-xl leading-relaxed mb-8"
              >
                PayFlow SMT conecta conversaciones de WhatsApp, agentes de IA y canales de pago para
                ayudarte a cobrar más rápido, validar clientes y confirmar pagos de forma simple,
                segura y automatizada.
              </p>

              {/* Capability chips */}
              <div data-hero-cards className="grid grid-cols-2 md:grid-cols-4 gap-2.5 max-w-2xl mb-8">
                {[
                  { icon: MessageCircle, label: "Pagos por WhatsApp" },
                  { icon: Bot, label: "Agentes de IA" },
                  { icon: CreditCard, label: "Integración de pagos" },
                  { icon: CheckCircle2, label: "Confirmación inteligente" },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    data-hero-card
                    className="group flex items-center gap-2 rounded-xl bg-white/[0.07] backdrop-blur-md border border-white/10 px-3 py-2.5 hover:bg-white/[0.12] hover:border-emerald-400/30 transition-all duration-300"
                  >
                    <div className="size-7 rounded-lg bg-emerald-500/15 flex items-center justify-center group-hover:bg-emerald-500/25 transition-colors">
                      <Icon className="size-3.5 text-emerald-400 shrink-0" />
                    </div>
                    <span className="text-xs font-medium text-white/90 leading-tight">{label}</span>
                  </div>
                ))}
              </div>

              <div data-hero-cta className="flex flex-wrap gap-3 items-center">
                <button
                  onClick={() => setSubPlan("choose")}
                  className="group relative px-7 py-3.5 rounded-2xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white shadow-xl shadow-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/50 hover:-translate-y-0.5 overflow-hidden"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span className="relative z-10 flex items-center gap-2">
                    Suscribirme
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
                <button
                  onClick={() => scrollToSection("precios")}
                  className="px-7 py-3.5 rounded-2xl text-sm font-semibold bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/15 hover:border-emerald-400/40 transition-all duration-300"
                >
                  Ver precios
                </button>
              </div>

              {/* Trust mini-row */}
              <div data-hero-trust className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/50">
                <span className="flex items-center gap-1.5">
                  <Lock className="size-3.5 text-emerald-400" /> Pagos seguros
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="size-3.5 text-emerald-400" /> Activación rápida
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe className="size-3.5 text-emerald-400" /> Para toda Latinoamérica
                </span>
              </div>
            </div>

            {/* Right visual composition — phone + metric cards + QR */}
            <div data-hero-mockup className="lg:col-span-5 relative hidden lg:block">
              <HeroVisual />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <button
          onClick={() => scrollToSection("precios")}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-white/50 hover:text-white transition-colors group"
          aria-label="Desplazarse hacia abajo"
        >
          <span className="text-[10px] uppercase tracking-widest">Descubre más</span>
          <div className="p-1.5 rounded-full border border-white/20 group-hover:border-emerald-400/50 transition-colors">
            <ArrowDown className="size-4 animate-bounce" />
          </div>
        </button>
      </section>

      {/* ===== TRUST BAR / STATS ===== */}
      <section
        data-section="trust"
        className="relative z-10 py-12 lg:py-16 px-4 lg:px-6 border-y border-white/5"
        style={{ backgroundColor: "var(--page-bg)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { icon: Clock, value: "2 años", label: "De experiencia" },
              { icon: Zap, value: "100%", label: "Automatización" },
              { icon: Shield, value: "Seguro", label: "Procesos protegidos" },
              { icon: Globe, value: "LATAM", label: "Para toda la región" },
            ].map(({ icon: Icon, value, label }, i) => (
              <div
                key={label}
                data-stat-card={i}
                className="text-center group"
              >
                <div className="inline-flex size-11 rounded-2xl bg-emerald-500/10 items-center justify-center mb-3 group-hover:bg-emerald-500/20 transition-colors">
                  <Icon className="size-5 text-emerald-400" />
                </div>
                <div className="text-2xl md:text-3xl font-bold text-white tracking-tight">{value}</div>
                <div className="text-xs text-white/50 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CAPACIDADES / SERVICIOS ===== */}
      <section
        data-section="capacidades"
        className="relative z-10 py-20 lg:py-28 px-4 lg:px-6"
        style={{ backgroundColor: "var(--page-bg)" }}
      >
        <div className="max-w-7xl mx-auto">
          <div data-cap-header className="text-center mb-14 max-w-3xl mx-auto">
            <Badge className="mb-4 bg-emerald-500/15 text-emerald-300 border-emerald-400/30">
              <Sparkles className="size-3 mr-1" /> Capacidades principales
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 leading-[1.15] text-white">
              Una plataforma completa para{" "}
              <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
                automatizar tus pagos
              </span>
            </h2>
            <p className="text-white/60 text-base md:text-lg leading-relaxed">
              Tecnología, automatización de procesos de pagos e inteligencia artificial integradas en
              una solución empresarial de alto rendimiento.
            </p>
          </div>

          {/* Bento grid de capacidades */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map((cap, i) => (
              <CapabilityCard key={cap.title} {...cap} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== PLATAFORMA SPLIT ===== */}
      <section
        data-section="plataforma"
        id="section-plataforma-content"
        className="relative z-10 py-20 lg:py-32 px-4 lg:px-6"
        style={{ backgroundColor: "var(--page-bg)" }}
      >
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <Badge className="mb-5 bg-emerald-50 text-emerald-700 border-emerald-200">
              Plataforma de automatización de pagos
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-5 leading-[1.15] text-slate-900">
              Flujos de cobro visuales con{" "}
              <span className="text-emerald-600">IA</span>
            </h2>
            <p className="text-base md:text-lg text-slate-500 leading-relaxed mb-6">
              PayFlow SMT permite automatizar cobros por WhatsApp con agentes de IA, integración de
              pagos y confirmaciones inteligentes, ofreciendo una experiencia simple, rápida y
              profesional para negocios y clientes.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Pagos por WhatsApp",
                "Agentes de IA para atención automatizada",
                "Confirmación inteligente de pagos",
                "Integración con canales de pago",
                "Flujos visuales fáciles de gestionar",
              ].map((item) => (
                <li
                  key={item}
                  data-platform-feature
                  className="flex items-center gap-3 text-sm md:text-base text-slate-700"
                >
                  <div className="size-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setSubPlan("choose")}
                className="group px-6 py-3 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-all duration-300 hover:-translate-y-0.5"
              >
                <span className="flex items-center gap-2">
                  Suscribirme
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
              <button
                onClick={() => scrollToSection("precios")}
                className="px-6 py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Ver precios
              </button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-100 to-slate-100 rounded-[2rem] blur-2xl opacity-60" />
            <div
              data-platform-img
              className="relative rounded-[1.5rem] overflow-hidden bg-slate-50 border border-slate-100 shadow-xl shadow-slate-200/60 will-change-transform"
            >
              <img
                src="/platform-phone.png"
                alt="Demo de PayFlow SMT: cobro por WhatsApp con IA"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== CÓMO FUNCIONA ===== */}
      <section
        data-section="how"
        className="relative z-10 py-20 lg:py-28 px-4 lg:px-6 border-y border-white/5"
        style={{ backgroundColor: "var(--page-bg)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div data-how-header className="text-center mb-14">
            <Badge className="mb-4 bg-emerald-500/15 text-emerald-300 border-emerald-400/30">
              <Layers className="size-3 mr-1" /> Cómo funciona
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-3 text-white">
              Tres pasos para automatizar tus cobros
            </h2>
            <p className="text-white/60 max-w-xl mx-auto">
              De la conversación al pago confirmado en minutos, sin código.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* connecting line */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-emerald-400/0 via-emerald-400/40 to-emerald-400/0" />
            {STEPS.map((step, i) => (
              <div key={step.title} data-how-step={i} className="relative text-center">
                <div className="relative inline-flex">
                  <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-md" />
                  <div className="relative size-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-400/30 backdrop-blur-sm flex items-center justify-center mb-4">
                    <step.icon className="size-8 text-emerald-400" />
                    <div className="absolute -top-2 -right-2 size-7 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shadow-lg shadow-emerald-500/40">
                      {i + 1}
                    </div>
                  </div>
                </div>
                <h3 className="font-semibold text-white mb-2 text-lg">{step.title}</h3>
                <p className="text-sm text-white/55 leading-relaxed max-w-xs mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BENEFICIOS ===== */}
      <section
        data-section="beneficios"
        className="relative z-10 py-20 lg:py-28 px-4 lg:px-6"
        style={{ backgroundColor: "var(--page-bg)" }}
      >
        <div className="max-w-7xl mx-auto">
          <div data-benefits-header className="text-center mb-14 max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-3 text-slate-900">
              Todo lo que necesitas para cobrar por WhatsApp
            </h2>
            <p className="text-slate-500">
              Una plataforma completa para automatizar tus cobros de principio a fin.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                data-benefit-card="true"
                className="group relative rounded-2xl bg-white border border-slate-100 p-6 hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 to-emerald-50/0 group-hover:from-emerald-50/50 group-hover:to-transparent transition-all duration-500" />
                <div className="relative">
                  <div className="size-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <Icon className="size-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1.5 text-lg">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRECIOS ===== */}
      <section
        id="section-precios"
        data-section="precios"
        className="relative z-10 py-20 lg:py-28 px-4 lg:px-6"
        style={{ backgroundColor: "var(--page-bg)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div data-prices-header className="text-center mb-14">
            <Badge className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200">
              <CreditCard className="size-3 mr-1" /> Precios
            </Badge>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-3 text-slate-900">
              Planes simples para automatizar tus cobros
            </h2>
            <p className="text-slate-500">Elige el plan que se ajuste a tu negocio.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Plan Mensual */}
            <div
              data-price-card
              className="group relative rounded-3xl border border-slate-200 bg-white p-8 flex flex-col hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 transition-all duration-300"
            >
              <div className="mb-6">
                <Badge className="mb-2 bg-amber-50 text-amber-700 border-amber-200">Plan mensual</Badge>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Plan Mensual</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-slate-900">$49.99</span>
                  <span className="text-sm text-slate-400">/mes</span>
                </div>
                <p className="text-sm text-slate-500 mt-3">
                  Flujo de pagos por WhatsApp con IA
                </p>
              </div>
              <div className="flex-1 space-y-2.5 mb-6">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Incluye:
                </p>
                {PLAN_FEATURES.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setSubPlan("trimestral")}
                className="w-full py-3 rounded-xl text-sm font-semibold border border-emerald-500 text-emerald-600 hover:bg-emerald-50 transition-colors"
              >
                Suscribirme al Plan Mensual
              </button>
            </div>

            {/* Plan Anual - Recomendado */}
            <div
              data-price-card
              className="group relative rounded-3xl border-2 border-emerald-500 bg-white p-8 flex flex-col hover:shadow-2xl hover:shadow-emerald-100 transition-all duration-300 hover:-translate-y-1"
            >
              {/* glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-transparent rounded-3xl pointer-events-none" />
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white border-0 shadow-lg shadow-emerald-500/40 px-4">
                <Star className="size-3 mr-1 fill-white" /> Recomendado
              </Badge>
              <div className="relative mb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Plan Anual</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-slate-900">$249</span>
                  <span className="text-sm text-slate-400">/año</span>
                </div>
                <p className="text-sm text-slate-500 mt-3">
                  Automatización completa anual para pagos por WhatsApp
                </p>
              </div>
              <div className="relative flex-1 space-y-2.5 mb-6">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Incluye:
                </p>
                {PLAN_FEATURES.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setSubPlan("anual")}
                className="relative w-full py-3 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-colors"
              >
                Suscribirme al Plan Anual
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 text-center mt-10 max-w-2xl mx-auto leading-relaxed">
            Los valores corresponden al servicio de plataforma y configuración inicial. La activación
            de integraciones de pago puede requerir credenciales propias del comercio.
          </p>
        </div>
      </section>

      {/* ===== NOSOTROS ===== */}
      <section
        id="section-nosotros"
        data-section="nosotros"
        className="relative z-10 py-20 lg:py-28 px-4 lg:px-6"
        style={{ backgroundColor: "var(--page-bg)" }}
      >
        <div className="max-w-4xl mx-auto">
          <div data-nosotros-block className="text-center mb-14">
            <Badge className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200">Nosotros</Badge>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-5 text-slate-900">
              Somos aliados estratégicos en canales de pago
            </h2>
            <p className="text-slate-500 leading-relaxed max-w-2xl mx-auto">
              En PayFlow SMT ayudamos a negocios, clientes y empresas a implementar flujos de pago por
              WhatsApp de forma rápida, segura y automatizada.
            </p>
            <p className="text-slate-500 leading-relaxed max-w-2xl mx-auto mt-4">
              Contamos con 2 años de experiencia en servicios de plataforma, automatización y soporte
              operativo.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-5 mb-10">
            <div
              data-nosotros-block
              className="rounded-2xl bg-white border border-slate-100 p-7 shadow-sm shadow-slate-200/40 hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="size-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
                <Zap className="size-5 text-white" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1.5">2 años de experiencia</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                En servicios de plataforma, automatización y soporte operativo.
              </p>
            </div>
            <div
              data-nosotros-block
              className="rounded-2xl bg-white border border-slate-100 p-7 shadow-sm shadow-slate-200/40 hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="size-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
                <Shield className="size-5 text-white" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1.5">Procesos seguros</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Trabajamos con procesos seguros, control de acceso y buenas prácticas para proteger la
                información de cada negocio y sus clientes.
              </p>
            </div>
          </div>
          <p className="text-center text-slate-500 leading-relaxed max-w-2xl mx-auto">
            PayFlow SMT está diseñado para negocios que necesitan cobrar más rápido, reducir procesos
            manuales y ofrecer una experiencia moderna de pago por WhatsApp.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            <button
              onClick={() => setSubPlan("choose")}
              className="group px-6 py-3 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-all duration-300 hover:-translate-y-0.5"
            >
              <span className="flex items-center gap-2">
                Suscribirme ahora
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </button>
            <button
              onClick={onLogin}
              className="px-6 py-3 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-white transition-colors"
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      </section>

      {/* ===== CTA BANNER ===== */}
      <section
        data-section="cta"
        className="relative z-10 py-16 lg:py-20 px-4 lg:px-6"
        style={{ backgroundColor: "var(--page-bg)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div
            data-cta-banner
            className="relative overflow-hidden rounded-3xl border border-emerald-400/20 p-8 md:p-12 text-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,208,132,0.12) 0%, rgba(6,20,38,0.6) 50%, rgba(0,208,132,0.08) 100%)",
            }}
          >
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, rgba(0,208,132,0.3), transparent 50%)" }} />
            <div className="relative">
              <div className="inline-flex size-14 rounded-2xl bg-emerald-500/20 items-center justify-center mb-5 backdrop-blur-sm border border-emerald-400/30">
                <Rocket className="size-7 text-emerald-400" />
              </div>
              <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-3 text-white">
                Empieza a automatizar tus cobros hoy
              </h2>
              <p className="text-white/60 max-w-xl mx-auto mb-7 leading-relaxed">
                Únete a los negocios que ya cobran más rápido por WhatsApp con agentes de IA y pagos
                integrados.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => setSubPlan("choose")}
                  className="group px-7 py-3.5 rounded-2xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white shadow-xl shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-0.5"
                >
                  <span className="flex items-center gap-2">
                    Suscribirme ahora
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
                <button
                  onClick={onLogin}
                  className="px-7 py-3.5 rounded-2xl text-sm font-semibold bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/15 transition-colors"
                >
                  Iniciar sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer data-section="footer" className="relative z-10 bg-[#061426] text-white pt-14 pb-8 px-4 lg:px-6 border-t border-emerald-500/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-10">
            {/* Brand */}
            <div className="flex flex-col items-start gap-3">
              <img
                src="/payflow-logo-dark.png"
                srcSet="/payflow-logo-dark.png 2x"
                alt="PayFlow SMT"
                className="h-11 w-auto object-contain"
                draggable={false}
              />
              <p className="text-xs text-white/50 leading-relaxed max-w-xs">
                Automatización de pagos por WhatsApp con IA. Plataforma SaaS para negocios en
                Latinoamérica.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/80 bg-emerald-500/10 border border-emerald-400/20 rounded-full px-2.5 py-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> En operación
                </span>
              </div>
            </div>

            {/* Quick links */}
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">
                Plataforma
              </p>
              <button onClick={() => scrollToSection("plataforma")} className="text-sm text-white/60 hover:text-emerald-300 transition-colors text-left">
                Características
              </button>
              <button onClick={() => scrollToSection("precios")} className="text-sm text-white/60 hover:text-emerald-300 transition-colors text-left">
                Precios
              </button>
              <button onClick={() => scrollToSection("nosotros")} className="text-sm text-white/60 hover:text-emerald-300 transition-colors text-left">
                Nosotros
              </button>
              <button onClick={onLogin} className="text-sm text-white/60 hover:text-emerald-300 transition-colors text-left">
                Iniciar sesión
              </button>
            </div>

            {/* Contact + legal */}
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">
                Contacto y legal
              </p>
              <span className="flex items-center gap-1.5 text-sm text-white/60">
                <Mail className="size-3.5 text-emerald-400/70" /> contacto@payflow.smt
              </span>
              <span className="flex items-center gap-1.5 text-sm text-white/60">
                <Phone className="size-3.5 text-emerald-400/70" /> +593
              </span>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 text-xs">
                <a href="/privacy" className="text-white/50 hover:text-white transition-colors">
                  Política de Privacidad
                </a>
                <span className="text-white/20">·</span>
                <a href="/terms" className="text-white/50 hover:text-white transition-colors">
                  Términos y Condiciones
                </a>
                <a href="/cookies" className="text-white/50 hover:text-white transition-colors">
                  Cookies
                </a>
                <span className="text-white/20">·</span>
                <a href="/data-request" className="text-white/50 hover:text-white transition-colors">
                  Solicitud de Datos
                </a>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs text-white/40">
              © {new Date().getFullYear()} PayFlow SMT. Todos los derechos reservados.
            </p>
            <p className="text-xs text-white/40 flex items-center gap-1.5">
              Hecho con <span className="text-emerald-400">●</span> en Latinoamérica
            </p>
          </div>
        </div>
      </footer>

      {/* Formulario de suscripción */}
      {subPlan && <SubscriptionForm open={!!subPlan} onOpenChange={(o) => !o && setSubPlan(null)} plan={subPlan} />}
    </div>
  );
}

// ---------- Sub-components ----------

function HeroVisual() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Ambient glow */}
      <div className="absolute -inset-10 bg-gradient-to-br from-emerald-500/25 via-transparent to-teal-500/15 rounded-[3rem] blur-3xl animate-pf-pulse-soft pointer-events-none" />

      {/* Phone mockup */}
      <div data-hero-phone className="relative mx-auto w-[240px] will-change-transform">
        <div className="relative rounded-[2.2rem] border-[3px] border-white/15 bg-[#0a1628] shadow-2xl shadow-emerald-900/50 overflow-hidden">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#0a1628] rounded-b-2xl z-20 border-x border-b border-white/10" />
          {/* Screen */}
          <div className="relative aspect-[9/16] bg-gradient-to-b from-[#0d1f36] to-[#061426] px-3 pt-7 pb-3 flex flex-col">
            {/* WhatsApp header */}
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <div className="size-7 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                <MessageCircle className="size-3.5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-white leading-none">Tu Negocio</p>
                <p className="text-[8px] text-emerald-400 leading-none mt-0.5">en línea</p>
              </div>
              <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* Chat bubbles */}
            <div className="flex-1 flex flex-col gap-1.5 py-2 overflow-hidden">
              <div className="self-start max-w-[80%] rounded-lg rounded-tl-sm bg-white/8 px-2 py-1.5">
                <p className="text-[8px] text-white/80 leading-tight">Hola, quiero pagar mi pedido</p>
              </div>
              <div className="self-end max-w-[80%] rounded-lg rounded-tr-sm bg-emerald-600/40 px-2 py-1.5">
                <p className="text-[8px] text-white leading-tight">¡Claro! Generando tu link de pago…</p>
              </div>

              {/* Payment success card */}
              <div className="self-end max-w-[88%] rounded-xl rounded-tr-sm bg-gradient-to-br from-emerald-500/25 to-emerald-600/10 border border-emerald-400/30 px-2.5 py-2 mt-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="size-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                    <CheckCircle2 className="size-3 text-white" />
                  </div>
                  <p className="text-[9px] font-bold text-emerald-300">Pago exitoso</p>
                </div>
                <p className="text-[8px] text-white/60 leading-none">Pago a Tu Negocio</p>
                <p className="text-base font-bold text-white leading-tight mt-0.5">$49.99 <span className="text-[9px] font-normal text-white/50">USD</span></p>
                <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-white/10">
                  <CreditCard className="size-2.5 text-white/40" />
                  <p className="text-[7px] text-white/40 tracking-wider">•••• 1234</p>
                  <span className="ml-auto text-[7px] text-emerald-400 font-medium">Confirmado</span>
                </div>
              </div>
            </div>

            {/* Input bar */}
            <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/5">
              <div className="flex-1 h-5 rounded-full bg-white/5 border border-white/10" />
              <div className="size-5 rounded-full bg-emerald-500 flex items-center justify-center">
                <MessageCircle className="size-2.5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating metric card 1 — Ventas de hoy */}
      <div
        data-float-card-1
        className="absolute -top-2 -left-10 w-[150px] rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-3 shadow-2xl shadow-emerald-900/40 will-change-transform"
      >
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[9px] text-white/60 font-medium uppercase tracking-wide">Ventas de hoy</p>
          <TrendingUp className="size-3 text-emerald-400" />
        </div>
        <p className="text-lg font-bold text-white leading-none">$3,892<span className="text-xs text-white/50">.45</span></p>
        {/* mini bar chart */}
        <div className="flex items-end gap-0.5 h-4 mt-1.5">
          {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-emerald-400/60" style={{ height: `${h}%` }} />
          ))}
        </div>
        <p className="text-[8px] text-emerald-400 mt-1 font-medium">▲ 12% vs ayer</p>
      </div>

      {/* Floating metric card 2 — Transacciones */}
      <div
        data-float-card-2
        className="absolute top-[38%] -right-8 w-[140px] rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-3 shadow-2xl shadow-emerald-900/40 will-change-transform"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="size-7 rounded-lg bg-emerald-500/25 flex items-center justify-center">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
          </div>
          <p className="text-[9px] text-white/60 font-medium uppercase tracking-wide leading-none">Transacciones</p>
        </div>
        <p className="text-2xl font-bold text-white leading-none mt-1">128</p>
        <p className="text-[8px] text-white/50 mt-1">Confirmadas hoy</p>
      </div>

      {/* Floating metric card 3 — Métodos de pago */}
      <div
        data-float-card-3
        className="absolute -bottom-4 -left-6 w-[160px] rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-3 shadow-2xl shadow-emerald-900/40 will-change-transform"
      >
        <p className="text-[9px] text-white/60 font-medium uppercase tracking-wide mb-2">Métodos de pago</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <CreditCard className="size-2.5 text-emerald-400 shrink-0" />
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: "60%" }} />
            </div>
            <span className="text-[8px] text-white/70 font-medium">60%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Smartphone className="size-2.5 text-teal-400 shrink-0" />
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-teal-400 rounded-full" style={{ width: "30%" }} />
            </div>
            <span className="text-[8px] text-white/70 font-medium">30%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <QrCode className="size-2.5 text-cyan-400 shrink-0" />
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-cyan-400 rounded-full" style={{ width: "10%" }} />
            </div>
            <span className="text-[8px] text-white/70 font-medium">10%</span>
          </div>
        </div>
      </div>

      {/* QR code card */}
      <div
        data-float-card-4
        className="absolute -bottom-2 -right-2 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-2.5 shadow-2xl shadow-emerald-900/40 will-change-transform"
      >
        <div className="size-16 rounded-lg bg-white p-1.5 flex items-center justify-center">
          {/* CSS QR pattern */}
          <div
            className="size-full"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #061426 25%, transparent 25%), linear-gradient(-45deg, #061426 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #061426 75%), linear-gradient(-45deg, transparent 75%, #061426 75%)",
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0px",
            }}
          />
        </div>
        <p className="text-[7px] text-white/70 font-semibold text-center mt-1 tracking-wide">PAGA AQUÍ CON QR</p>
      </div>
    </div>
  );
}

function NavPill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
        active ? "text-white" : "text-white/60 hover:text-white"
      )}
    >
      {active && (
        <span className="absolute inset-0 rounded-full bg-white/10 border border-white/10" />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

function NavButton({ children, active, onClick, full }: { children: React.ReactNode; active: boolean; onClick: () => void; full?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        full && "w-full text-left",
        active ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}

function CapabilityCard({
  icon: Icon,
  title,
  desc,
  tag,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  tag: string;
  index: number;
}) {
  return (
    <div
      data-cap-card={index}
      className="group relative rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-sm p-6 hover:bg-white/[0.07] hover:border-emerald-400/30 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
    >
      {/* hover glow */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/0 group-hover:from-emerald-500/10 group-hover:to-transparent transition-all duration-500 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className="size-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-400/20 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
            <Icon className="size-6 text-emerald-400" />
          </div>
          <span className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {tag}
          </span>
        </div>
        <h3 className="font-semibold text-white mb-2 text-lg">{title}</h3>
        <p className="text-sm text-white/55 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ---------- Data ----------

const CAPABILITIES = [
  {
    icon: Cpu,
    title: "Tecnología",
    desc: "Plataforma moderna construida sobre Next.js, React y arquitectura escalable lista para crecer contigo.",
    tag: "Core",
  },
  {
    icon: Zap,
    title: "Automatización de procesos de pagos",
    desc: "Conecta conversaciones, validaciones y cobros en flujos visuales que se ejecutan solos, 24/7.",
    tag: "Automatización",
  },
  {
    icon: Bot,
    title: "Inteligencia Artificial",
    desc: "Agentes de IA que responden, validan clientes y guían el proceso de pago de forma natural.",
    tag: "IA",
  },
  {
    icon: Layers,
    title: "Solución empresarial",
    desc: "Diseñada para comercios y empresas que necesitan cobrar más rápido con control y seguridad.",
    tag: "Empresa",
  },
  {
    icon: Workflow,
    title: "Sistema de automatización",
    desc: "Constructor visual de flujos con nodos de WhatsApp, pagos, IA, condiciones e integraciones.",
    tag: "Sistema",
  },
  {
    icon: Plug,
    title: "Integraciones",
    desc: "Conecta PayPhone API Link, webhooks y APIs externas para una experiencia completa.",
    tag: "Integración",
  },
] as const;

const STEPS = [
  {
    icon: MessageCircle,
    title: "Conversación por WhatsApp",
    desc: "Tu cliente escribe por WhatsApp y el agente de IA lo recibe al instante.",
  },
  {
    icon: Bot,
    title: "La IA crea el pago",
    desc: "El agente valida los datos y genera el link de pago automáticamente.",
  },
  {
    icon: CheckCircle2,
    title: "Pago confirmado",
    desc: "El sistema confirma el estado y responde a tu cliente en tiempo real.",
  },
] as const;

const BENEFITS = [
  { icon: MessageCircle, title: "Pagos por WhatsApp", desc: "Automatiza solicitudes de cobro directamente desde conversaciones." },
  { icon: Bot, title: "Agentes de IA", desc: "Responde, valida y guía a tus clientes en el proceso de pago." },
  { icon: CreditCard, title: "Integración de pagos", desc: "Conecta canales de pago para procesar cobros con mayor agilidad." },
  { icon: CheckCircle2, title: "Confirmación de pagos", desc: "Automatiza respuestas según pago exitoso, fallido, pendiente o error." },
  { icon: Workflow, title: "Flujos visuales", desc: "Administra procesos de cobro con un constructor visual simple." },
  { icon: Zap, title: "Automatización para negocios", desc: "Reduce tareas manuales y mejora tiempos de respuesta." },
] as const;

const PLAN_FEATURES = [
  "Constructor visual de flujos",
  "Agente IA para WhatsApp",
  "Integración PayPhone API Link",
  "Simulador de conversaciones",
  "Agenda de citas",
  "Catálogo de productos",
  "Historial de ejecuciones",
  "Soporte por WhatsApp",
] as const;
