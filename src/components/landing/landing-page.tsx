"use client";

import { useState, useRef } from "react";
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
} from "lucide-react";
import { SubscriptionForm } from "./subscription-form";
import { useLandingAnimations } from "./use-landing-animations";
import { useScrollColorTransition } from "./use-scroll-color-transition";
import { cn } from "@/lib/utils";

interface LandingPageProps {
  onLogin: () => void;
}

export function LandingPage({ onLogin }: LandingPageProps) {
  const [activeSection, setActiveSection] = useState<"plataforma" | "precios" | "nosotros">("plataforma");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [subPlan, setSubPlan] = useState<"trimestral" | "anual" | "choose" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollColorTransition(rootRef);
  useLandingAnimations(rootRef);

  function scrollToSection(section: "plataforma" | "precios" | "nosotros") {
    setActiveSection(section);
    setMobileMenuOpen(false);
    document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div
      ref={rootRef}
      className="min-h-screen relative transition-colors duration-300"
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
      {/* Blobs de glow */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] rounded-full blur-[120px] opacity-20" style={{ background: "radial-gradient(circle, #00D084 0%, transparent 70%)" }} />
        <div className="absolute top-[50%] right-[10%] w-[500px] h-[500px] rounded-full blur-[140px] opacity-15" style={{ background: "radial-gradient(circle, #0B1F33 0%, transparent 70%)" }} />
        <div className="absolute bottom-[20%] left-[30%] w-[350px] h-[350px] rounded-full blur-[100px] opacity-10" style={{ background: "radial-gradient(circle, #20E68A 0%, transparent 70%)" }} />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-40 backdrop-blur-md border-b shadow-lg shadow-black/10 transition-colors duration-300" style={{ backgroundColor: "var(--nav-bg)", borderColor: "var(--nav-border)", color: "var(--nav-text)" }}>
        <div className="max-w-6xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          <button onClick={() => scrollToSection("plataforma")} className="flex items-center gap-2 shrink-0">
            <img src="/payflow-logo-dark.png" srcSet="/payflow-logo-dark.png 2x" alt="PayFlow SMT" className="h-11 w-auto object-contain" draggable={false} />
          </button>
          <nav className="hidden md:flex items-center gap-1">
            <NavButton active={activeSection === "plataforma"} onClick={() => scrollToSection("plataforma")}>Plataforma</NavButton>
            <NavButton active={activeSection === "precios"} onClick={() => scrollToSection("precios")}>Precios</NavButton>
            <NavButton active={activeSection === "nosotros"} onClick={() => scrollToSection("nosotros")}>Nosotros</NavButton>
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <button onClick={onLogin} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors">Iniciar sesión</button>
            <button onClick={() => setSubPlan("choose")} className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/30 transition-colors">Suscribirme</button>
          </div>
          <button className="md:hidden p-2 rounded-lg hover:bg-white/10 text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-emerald-500/15 px-4 py-3 space-y-2 bg-[#0a1628]">
            <NavButton active={activeSection === "plataforma"} onClick={() => scrollToSection("plataforma")} full>Plataforma</NavButton>
            <NavButton active={activeSection === "precios"} onClick={() => scrollToSection("precios")} full>Precios</NavButton>
            <NavButton active={activeSection === "nosotros"} onClick={() => scrollToSection("nosotros")} full>Nosotros</NavButton>
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={onLogin} className="px-4 py-2 rounded-lg text-sm font-medium text-white/80 hover:text-white border border-white/15 w-full text-center">Iniciar sesión</button>
              <button onClick={() => { setSubPlan("anual"); setMobileMenuOpen(false); }} className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white w-full text-center">Suscribirme</button>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section id="section-plataforma" data-section="hero" className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img data-hero-bg src="/hero-bg.png" alt="Plataforma de pagos PayFlow SMT" className="size-full object-cover object-center will-change-transform" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, rgba(10,22,40,0.96) 0%, rgba(10,22,40,0.82) 35%, rgba(10,22,40,0.6) 65%, rgba(6,40,30,0.85) 100%)" }} />
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/20 via-transparent to-emerald-500/10 mix-blend-screen" />
        </div>
        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 lg:px-6 py-16 lg:py-24">
          <div className="max-w-2xl">
            <div data-hero-logo className="mb-7 relative inline-block">
              <div className="absolute -inset-3 bg-emerald-500/15 rounded-full blur-2xl" />
              <img src="/payflow-logo-dark.png" srcSet="/payflow-logo-dark.png 2x" alt="PayFlow SMT" className="relative h-16 md:h-20 w-auto object-contain" draggable={false} />
            </div>
            <Badge className="mb-5 bg-emerald-500/20 text-emerald-300 border-emerald-400/30 backdrop-blur-sm">Plataforma de automatización de pagos</Badge>
            <h1 data-hero-title className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.1] text-white">Automatiza pagos por <span className="text-emerald-400">WhatsApp</span> con IA</h1>
            <p className="text-base md:text-lg text-slate-200 max-w-xl leading-relaxed mb-8">PayFlow SMT conecta conversaciones de WhatsApp, agentes de IA y canales de pago para ayudarte a cobrar más rápido, validar clientes y confirmar pagos de forma simple, segura y automatizada.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 max-w-2xl mb-8">
              {[{ icon: MessageCircle, label: "Pagos por WhatsApp" }, { icon: Bot, label: "Agentes de IA" }, { icon: CreditCard, label: "Integración de pagos" }, { icon: CheckCircle2, label: "Confirmación inteligente" }].map(({ icon: Icon, label }) => (
                <div key={label} data-hero-card className="flex items-center gap-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/15 px-2.5 py-2">
                  <Icon className="size-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-medium text-white leading-tight">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setSubPlan("choose")} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-colors">Suscribirme <ArrowRight className="size-4 ml-2 inline" /></button>
              <button onClick={() => scrollToSection("precios")} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-white/10 backdrop-blur-md border border-white/25 text-white hover:bg-white/20 hover:text-white transition-colors">Ver precios</button>
            </div>
          </div>
        </div>
      </section>

      {/* Sección Plataforma split layout */}
      <section data-section="plataforma" id="section-plataforma-content" className="relative z-10 py-20 lg:py-32 px-4 lg:px-6" style={{ backgroundColor: "var(--page-bg)" }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <Badge className="mb-5 bg-emerald-50 text-emerald-700 border-emerald-200">Plataforma de automatización de pagos</Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-5 leading-[1.15] text-slate-900">Flujos de cobro visuales con IA</h2>
            <p className="text-base md:text-lg text-slate-500 leading-relaxed mb-6">PayFlow SMT permite automatizar cobros por WhatsApp con agentes de IA, integración de pagos y confirmaciones inteligentes, ofreciendo una experiencia simple, rápida y profesional para negocios y clientes.</p>
            <ul className="space-y-2.5 mb-8">
              {["Pagos por WhatsApp", "Agentes de IA para atención automatizada", "Confirmación inteligente de pagos", "Integración con canales de pago", "Flujos visuales fáciles de gestionar"].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-slate-700"><CheckCircle2 className="size-4 text-emerald-500 shrink-0" />{item}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setSubPlan("choose")} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-colors">Suscribirme</button>
              <button onClick={() => scrollToSection("precios")} className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">Ver precios</button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-100 to-slate-100 rounded-[2rem] blur-2xl opacity-60" />
            <div data-platform-img className="relative rounded-[1.5rem] overflow-hidden bg-slate-50 border border-slate-100 shadow-xl shadow-slate-200/60 will-change-transform">
              <img src="/platform-phone.png" alt="Demo de PayFlow SMT: cobro por WhatsApp con IA" className="w-full h-auto object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section data-section="beneficios" className="relative z-10 py-20 lg:py-28 px-4 lg:px-6" style={{ backgroundColor: "var(--page-bg)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-3 text-slate-900">Todo lo que necesitas para cobrar por WhatsApp</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Una plataforma completa para automatizar tus cobros de principio a fin.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[{ icon: MessageCircle, title: "Pagos por WhatsApp", desc: "Automatiza solicitudes de cobro directamente desde conversaciones." }, { icon: Bot, title: "Agentes de IA", desc: "Responde, valida y guía a tus clientes en el proceso de pago." }, { icon: CreditCard, title: "Integración de pagos", desc: "Conecta canales de pago para procesar cobros con mayor agilidad." }, { icon: CheckCircle2, title: "Confirmación de pagos", desc: "Automatiza respuestas según pago exitoso, fallido, pendiente o error." }, { icon: Workflow, title: "Flujos visuales", desc: "Administra procesos de cobro con un constructor visual simple." }, { icon: Zap, title: "Automatización para negocios", desc: "Reduce tareas manuales y mejora tiempos de respuesta." }].map(({ icon: Icon, title, desc }) => (
              <div key={title} data-benefit-card="true" className="rounded-2xl bg-white border border-slate-100 p-6 hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5 transition-all duration-300">
                <div className="size-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-4"><Icon className="size-5 text-emerald-600" /></div>
                <h3 className="font-semibold text-slate-900 mb-1.5">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Precios */}
      <section id="section-precios" data-section="precios" className="relative z-10 py-20 lg:py-28 px-4 lg:px-6" style={{ backgroundColor: "var(--page-bg)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-3 text-slate-900">Planes simples para automatizar tus cobros</h2>
            <p className="text-slate-500">Elige el plan que se ajuste a tu negocio.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div data-price-card className="rounded-3xl border border-slate-200 bg-white p-8 flex flex-col hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300">
              <div className="mb-8">
                <Badge className="mb-2 bg-amber-50 text-amber-700 border-amber-200">Promoción trimestral</Badge>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Plan Trimestral</h3>
                <div className="flex items-baseline gap-1"><span className="text-5xl font-bold text-slate-900">$25</span><span className="text-sm text-slate-400">/trimestre</span></div>
                <p className="text-xs text-slate-400 mt-1">Pago mensual</p>
                <p className="text-sm text-slate-500 mt-3">Flujo de pagos por WhatsApp directamente</p>
              </div>
              <div className="flex-1" />
              <button onClick={() => setSubPlan("trimestral")} className="w-full py-2.5 rounded-xl text-sm font-semibold border border-emerald-500 text-emerald-600 hover:bg-emerald-50 transition-colors">Suscribirme al Plan Trimestral</button>
            </div>
            <div data-price-card className="rounded-3xl border-2 border-emerald-500 bg-white p-8 flex flex-col relative hover:shadow-xl hover:shadow-emerald-100 transition-all duration-300">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white border-0">Recomendado</Badge>
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Plan Anual</h3>
                <div className="flex items-baseline gap-1"><span className="text-5xl font-bold text-slate-900">$89</span><span className="text-sm text-slate-400">/año</span></div>
                <p className="text-sm text-slate-500 mt-3">Automatización completa anual para pagos por WhatsApp</p>
              </div>
              <div className="flex-1" />
              <button onClick={() => setSubPlan("anual")} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-colors">Suscribirme al Plan Anual</button>
            </div>
          </div>
          <p className="text-xs text-slate-400 text-center mt-10 max-w-2xl mx-auto leading-relaxed">Los valores corresponden al servicio de plataforma y configuración inicial. La activación de integraciones de pago puede requerir credenciales propias del comercio.</p>
        </div>
      </section>

      {/* Nosotros */}
      <section id="section-nosotros" data-section="nosotros" className="relative z-10 py-20 lg:py-28 px-4 lg:px-6" style={{ backgroundColor: "var(--page-bg)" }}>
        <div className="max-w-4xl mx-auto">
          <div data-nosotros-block className="text-center mb-14">
            <Badge className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200">Nosotros</Badge>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-5 text-slate-900">Somos aliados estratégicos en canales de pago</h2>
            <p className="text-slate-500 leading-relaxed max-w-2xl mx-auto">En PayFlow SMT ayudamos a negocios, clientes y empresas a implementar flujos de pago por WhatsApp de forma rápida, segura y automatizada.</p>
            <p className="text-slate-500 leading-relaxed max-w-2xl mx-auto mt-4">Contamos con 2 años de experiencia en servicios de plataforma, automatización y soporte operativo.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-5 mb-10">
            <div data-nosotros-block className="rounded-2xl bg-white border border-slate-100 p-7 shadow-sm shadow-slate-200/40">
              <div className="size-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-4"><Zap className="size-5 text-emerald-600" /></div>
              <h3 className="font-semibold text-slate-900 mb-1.5">2 años de experiencia</h3>
              <p className="text-sm text-slate-500 leading-relaxed">En servicios de plataforma, automatización y soporte operativo.</p>
            </div>
            <div data-nosotros-block className="rounded-2xl bg-white border border-slate-100 p-7 shadow-sm shadow-slate-200/40">
              <div className="size-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-4"><Shield className="size-5 text-emerald-600" /></div>
              <h3 className="font-semibold text-slate-900 mb-1.5">Procesos seguros</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Trabajamos con procesos seguros, control de acceso y buenas prácticas para proteger la información de cada negocio y sus clientes.</p>
            </div>
          </div>
          <p className="text-center text-slate-500 leading-relaxed max-w-2xl mx-auto">PayFlow SMT está diseñado para negocios que necesitan cobrar más rápido, reducir procesos manuales y ofrecer una experiencia moderna de pago por WhatsApp.</p>
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            <button onClick={() => setSubPlan("choose")} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-colors">Suscribirme ahora</button>
            <button onClick={onLogin} className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-white transition-colors">Iniciar sesión</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer data-section="footer" className="relative z-10 bg-[#061426] text-white py-12 px-4 lg:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <img src="/payflow-logo-dark.png" srcSet="/payflow-logo-dark.png 2x" alt="PayFlow SMT" className="h-12 w-auto object-contain" draggable={false} />
            <p className="text-xs text-white/50 text-center md:text-left">Automatización de pagos por WhatsApp con IA.</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-white/50">
              <span className="flex items-center gap-1"><Mail className="size-3" /> contacto@payflow.smt</span>
              <span className="flex items-center gap-1"><Phone className="size-3" /> +593</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <a href="/privacy" className="text-white/50 hover:text-white transition-colors">Política de Privacidad</a>
              <span className="text-white/20">·</span>
              <a href="/terms" className="text-white/50 hover:text-white transition-colors">Términos y Condiciones</a>
              <span className="text-white/20">·</span>
              <a href="/cookies" className="text-white/50 hover:text-white transition-colors">Cookies</a>
              <span className="text-white/20">·</span>
              <a href="/data-request" className="text-white/50 hover:text-white transition-colors">Solicitud de Datos</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Formulario de suscripción */}
      {subPlan && <SubscriptionForm open={!!subPlan} onOpenChange={(o) => !o && setSubPlan(null)} plan={subPlan} />}
    </div>
  );
}

function NavButton({ children, active, onClick, full }: { children: React.ReactNode; active: boolean; onClick: () => void; full?: boolean }) {
  return (
    <button onClick={onClick} className={cn("px-3 py-2 rounded-lg text-sm font-medium transition-colors", full && "w-full text-left", active ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/5")}>
      {children}
    </button>
  );
}
