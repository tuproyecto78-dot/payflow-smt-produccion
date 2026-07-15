"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  ShieldCheck,
  UserCog,
  Database,
  Target,
  Scale,
  Bot,
  Share2,
  Clock,
  ScrollText,
  Lock,
  Layers,
  FileWarning,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  ChevronRight,
} from "lucide-react";

const SECTIONS = [
  { id: "responsable", label: "Responsable", icon: UserCog },
  { id: "datos", label: "Datos que recopilamos", icon: Database },
  { id: "finalidad", label: "Para qué los usamos", icon: Target },
  { id: "legal", label: "Base legal", icon: Scale },
  { id: "automatizacion", label: "Automatización", icon: Bot },
  { id: "compartir", label: "Con quién compartimos", icon: Share2 },
  { id: "conservacion", label: "Conservación", icon: Clock },
  { id: "derechos", label: "Tus derechos", icon: ScrollText },
  { id: "seguridad", label: "Seguridad", icon: Lock },
  { id: "terceros", label: "Datos de terceros", icon: Layers },
  { id: "cambios", label: "Cambios", icon: FileWarning },
] as const;

export default function PrivacyClient() {
  const [activeId, setActiveId] = useState<string>("responsable");
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
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

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

      {/* ===== HERO verde oscuro ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#052e1c] via-[#064e3b] to-[#03312a] text-white">
        {/* glow */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>
        {/* grid */}
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
              Privacidad y confianza
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
              Tus datos, explicados con claridad
            </h1>
            <p className="text-emerald-50/80 text-base md:text-lg leading-relaxed mb-7 max-w-xl">
              Sabemos que tu información personal es valiosa. Esta política explica, en lenguaje
              claro, qué datos recopilamos, para qué los usamos y cómo puedes ejercer tus derechos
              en cualquier momento.
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
                {SECTIONS.map((s) => {
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

              {/* mini CTA */}
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20">
                <Shield className="size-5 mb-2" />
                <p className="text-sm font-semibold leading-tight">¿Quieres ejercer tus derechos?</p>
                <p className="text-[11px] text-emerald-50/80 mt-1 mb-3 leading-relaxed">
                  Solicita acceso, rectificación o eliminación de tus datos.
                </p>
                <Link
                  href="/data-request"
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Gestionar mis datos
                  <ArrowLeft className="size-3 rotate-180" />
                </Link>
              </div>
            </div>
          </aside>

          {/* Secciones en tarjetas */}
          <main className="space-y-6 min-w-0">
            {/* 1. Responsable */}
            <SectionCard
              id="responsable"
              icon={UserCog}
              number="01"
              title="¿Quién es responsable de tus datos?"
            >
              <p>
                PayFlow SMT es responsable del tratamiento de los datos personales recopilados a
                través de este sitio y de sus servicios. Actúa como responsable en virtud de la
                normativa aplicable de protección de datos.
              </p>
              <p>
                Para cualquier consulta relacionada con el tratamiento de tus datos personales,
                puedes dirigirte a través del formulario oficial de solicitudes. Nos comprometemos a
                responder en los plazos que establece la ley.
              </p>
              <HighlightRow
                items={[
                  "Responsable único: PayFlow SMT.",
                  "Canal de atención habilitado para todas tus solicitudes.",
                  "Compromiso de respuesta dentro de los plazos legales.",
                ]}
              />
            </SectionCard>

            {/* 2. Datos que recopilamos */}
            <SectionCard
              id="datos"
              icon={Database}
              number="02"
              title="¿Qué datos recopilamos?"
            >
              <p>
                Solo recopilamos los datos personales necesarios para prestar nuestros servicios.
                Esto significa que evitamos solicitar información que no tenga una finalidad concreta.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <DataPill label="Datos de identificación" desc="Nombre, documento y correo." />
                <DataPill label="Datos de contacto" desc="Teléfono, país y ciudad." />
                <DataPill label="Datos del negocio" desc="Nombre, tipo y horarios." />
                <DataPill label="Datos de uso" desc="Navegador y páginas visitadas." />
                <DataPill label="Mensajes de atención" desc="Conversaciones con el asistente." />
                <DataPill label="Datos de consentimiento" desc="Preferencias y autorizaciones." />
              </div>
              <Callout type="info">
                No solicitamos ni almacenamos números completos de tarjetas de pago ni códigos de
                seguridad. Esos datos se gestionan directamente a través de servicios especializados
                de procesamiento de pagos.
              </Callout>
            </SectionCard>

            {/* 3. Finalidad */}
            <SectionCard
              id="finalidad"
              icon={Target}
              number="03"
              title="¿Para qué utilizamos tus datos?"
            >
              <p>
                Utilizamos tus datos personales únicamente para fines determinados, legítimos y
                explícitos. No los tratamos de forma incompatible con dichos fines.
              </p>
              <HighlightRow
                items={[
                  "Gestionar tu cuenta y tu suscripción.",
                  "Prestar el servicio de atención automatizada a tus clientes.",
                  "Agendar citas y administrar tu catálogo de productos.",
                  "Brindar soporte y resolver incidencias.",
                  "Cumplir obligaciones legales y fiscales aplicables.",
                  "Mejorar la calidad del servicio y desarrollar nuevas funciones.",
                ]}
              />
            </SectionCard>

            {/* 4. Base legal */}
            <SectionCard
              id="legal"
              icon={Scale}
              number="04"
              title="¿Cuál es la base legal?"
            >
              <p>
                El tratamiento de tus datos se fundamenta en bases legales válidas. Antes de
                recopilar cualquier información, verificamos que exista una base legítima para ello.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <BaseLegalCard title="Ejecución de un contrato" desc="Para brindarte los servicios que contrataste." />
                <BaseLegalCard title="Consentimiento" desc="Para usos que requieren tu autorización expresa." />
                <BaseLegalCard title="Cumplimiento legal" desc="Para obligaciones fiscales o reglamentarias." />
                <BaseLegalCard title="Interés legítimo" desc="Para mejorar la seguridad y el servicio." />
              </div>
            </SectionCard>

            {/* 5. Automatización */}
            <SectionCard
              id="automatizacion"
              icon={Bot}
              number="05"
              title="Automatización"
            >
              <p>
                PayFlow SMT utiliza sistemas automatizados para agilizar la atención y la gestión de
                cobros. Estos sistemas se apoyan en tecnologías de inteligencia artificial para
                responder mensajes y generar enlaces de pago según la información cargada por el
                administrador del negocio.
              </p>
              <Callout type="success">
                Los sistemas automatizados <strong>no toman decisiones con efectos legales</strong>{" "}
                sobre ti sin posibilidad de revisión humana. Las acciones críticas requieren
                aprobación de una persona.
              </Callout>
              <HighlightRow
                items={[
                  "La automatización se basa en la información configurada por el negocio.",
                  "Las decisiones importantes cuentan con revisión humana.",
                  "Puedes solicitar revisión de cualquier decisión automatizada.",
                ]}
              />
            </SectionCard>

            {/* 6. Compartir */}
            <SectionCard
              id="compartir"
              icon={Share2}
              number="06"
              title="¿Con quién compartimos los datos?"
            >
              <p>
                Compartimos datos personales únicamente con categorías de servicios necesarios para
                prestar la plataforma, bajo acuerdos que aseguran su protección. No vendemos tus
                datos personales.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <CategoryCard
                  icon={Database}
                  title="Servicios de alojamiento"
                  desc="Para almacenar la información de tu cuenta y tu negocio."
                />
                <CategoryCard
                  icon={ShieldCheck}
                  title="Servicios de comunicación"
                  desc="Para enviar mensajes a tus clientes a través de canales de mensajería."
                />
                <CategoryCard
                  icon={CreditCardIcon}
                  title="Procesamiento de pagos"
                  desc="Para generar y gestionar enlaces y transacciones de cobro."
                />
                <CategoryCard
                  icon={Lock}
                  title="Seguridad y soporte tecnológico"
                  desc="Para monitorear, proteger y dar soporte a la plataforma."
                />
              </div>
              <Callout type="info">
                Cada servicio actúa bajo sus propios términos y políticas de privacidad. Compartimos
                con ellos únicamente los datos estrictamente necesarios.
              </Callout>
            </SectionCard>

            {/* 7. Conservación */}
            <SectionCard
              id="conservacion"
              icon={Clock}
              number="07"
              title="¿Durante cuánto tiempo conservamos los datos?"
            >
              <p>
                Conservamos tus datos mientras exista una relación contractual activa y durante los
                plazos legales aplicables. Una vez que dejan de ser necesarios, los eliminamos o los
                anonimizamos.
              </p>
              <HighlightRow
                items={[
                  "Datos de cuenta: mientras dure la relación contractual.",
                  "Datos de consentimiento: durante toda la relación y los plazos legales.",
                  "Datos de uso: el tiempo necesario para fines analíticos y de seguridad.",
                  "Al finalizar: eliminación o anonimización de los datos.",
                ]}
              />
            </SectionCard>

            {/* 8. Derechos */}
            <SectionCard
              id="derechos"
              icon={ScrollText}
              number="08"
              title="Tus derechos"
            >
              <p>
                Como titular de datos personales, puedes ejercer tus derechos en cualquier momento.
                Hemos habilitado un formulario para que presentes tus solicitudes de forma sencilla.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <RightCard icon={UserCog} title="Acceso" desc="Conocer qué datos tenemos sobre ti." />
                <RightCard icon={CheckCircle2} title="Rectificación" desc="Corregir datos inexactos o incompletos." />
                <RightCard icon={Shield} title="Eliminación" desc="Solicitar la supresión de tus datos." />
                <RightCard icon={Target} title="Limitación" desc="Restringir el tratamiento de tus datos." />
                <RightCard icon={Share2} title="Portabilidad" desc="Recibir tus datos en formato estructurado." />
                <RightCard icon={Scale} title="Oposición" desc="Oponerte al tratamiento de tus datos." />
              </div>
              <Callout type="success">
                Para ejercer cualquiera de estos derechos, completa el formulario en{" "}
                <Link href="/data-request" className="font-semibold underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-700">
                  Solicitud de datos
                </Link>
                .
              </Callout>
            </SectionCard>

            {/* 9. Seguridad */}
            <SectionCard
              id="seguridad"
              icon={Lock}
              number="09"
              title="Seguridad"
            >
              <p>
                Aplicamos medidas razonables de seguridad técnica y organizativa para proteger tus
                datos personales frente a accesos no autorizados, alteraciones o divulgaciones.
              </p>
              <HighlightRow
                items={[
                  "Cifrado de las comunicaciones mediante conexiones seguras.",
                  "Control de acceso basado en roles y privilegios mínimos.",
                  "No almacenamiento de datos sensibles de tarjetas ni códigos de seguridad.",
                  "Registro y auditoría de acciones administrativas relevantes.",
                  "Revisión periódica de las medidas de seguridad.",
                ]}
              />
              <Callout type="info">
                Ningún sistema es 100% seguro. Si ocurriera un incidente de seguridad que afecte tus
                datos, actuaremos conforme a la normativa aplicable.
              </Callout>
            </SectionCard>

            {/* 10. Datos de terceros */}
            <SectionCard
              id="terceros"
              icon={Layers}
              number="10"
              title="Datos de terceros"
            >
              <p>
                Cuando un negocio utiliza PayFlow SMT, es posible que se procesen datos personales
                de sus propios clientes (por ejemplo, durante conversaciones de atención o gestiones
                de cobro). En esos casos, el negocio es el responsable de dichos datos y PayFlow SMT
                actúa como encargado del tratamiento.
              </p>
              <HighlightRow
                items={[
                  "El negocio debe informar a sus clientes sobre el tratamiento de sus datos.",
                  "El negocio debe contar con las autorizaciones necesarias.",
                  "PayFlow SMT trata los datos según las instrucciones del negocio.",
                  "Los datos de terceros se eliminan o anonimizan cuando dejan de ser necesarios.",
                ]}
              />
            </SectionCard>

            {/* 11. Cambios */}
            <SectionCard
              id="cambios"
              icon={FileWarning}
              number="11"
              title="Cambios en esta política"
            >
              <p>
                Podemos actualizar esta Política de Privacidad cuando sea necesario para reflejar
                cambios en nuestros servicios o en la normativa aplicable. Publicaremos cualquier
                modificación en esta página junto con la fecha de actualización correspondiente.
              </p>
              <p>
                Te recomendamos revisar esta página periódicamente. El uso continuado de la
                plataforma después de los cambios constituye la aceptación de la política
                actualizada.
              </p>
            </SectionCard>

            {/* ===== Tarjeta destacada "Tú tienes el control" ===== */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-emerald-700 text-white p-7 md:p-9 shadow-xl shadow-emerald-500/20">
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" aria-hidden />
              <div className="absolute -bottom-12 -left-8 w-44 h-44 rounded-full bg-emerald-300/10 blur-2xl pointer-events-none" aria-hidden />
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-xs font-medium mb-4 backdrop-blur-sm">
                  <Shield className="size-3.5" />
                  Tú tienes el control
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">
                  Gestiona tus datos personales cuando lo necesites
                </h2>
                <p className="text-emerald-50/85 text-sm md:text-base leading-relaxed mb-6 max-w-xl">
                  Puedes solicitar acceso, rectificación, eliminación, limitación o portabilidad de
                  tus datos a través de nuestro formulario oficial. Tu privacidad es una prioridad.
                </p>
                <Link
                  href="/data-request"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-emerald-700 font-semibold text-sm hover:bg-emerald-50 transition-colors shadow-lg shadow-emerald-900/20"
                >
                  Solicitar gestión de datos
                  <ArrowLeft className="size-4 rotate-180" />
                </Link>
              </div>
            </div>
          </main>
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
              <Link href="/data-request" className="text-slate-300 hover:text-emerald-400 transition-colors">
                Solicitud de datos
              </Link>
              <span className="text-slate-600">·</span>
              <Link href="/terms" className="text-slate-300 hover:text-emerald-400 transition-colors">
                Términos y Condiciones
              </Link>
              <span className="text-slate-600">·</span>
              <Link href="/" className="text-slate-300 hover:text-emerald-400 transition-colors">
                Inicio
              </Link>
            </nav>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} PayFlow SMT · Política de Privacidad v1.1 · Actualizada en julio de 2026
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Sub-componentes ---------- */

function SectionCard({
  id,
  icon: Icon,
  number,
  title,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
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

function HighlightRow({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm md:text-base text-slate-700">
          <span className="mt-0.5 shrink-0 size-5 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
          </span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DataPill({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
      <p className="text-sm font-semibold text-slate-900 leading-tight">{label}</p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}

function Callout({
  type,
  children,
}: {
  type: "info" | "success";
  children: React.ReactNode;
}) {
  const styles =
    type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : "bg-sky-50 border-sky-200 text-sky-900";
  return (
    <div className={`mt-2 rounded-xl border p-4 text-sm leading-relaxed ${styles}`}>
      {children}
    </div>
  );
}

function BaseLegalCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 hover:border-emerald-200 hover:shadow-sm transition-all">
      <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}

function CategoryCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 hover:border-emerald-200 hover:shadow-sm transition-all">
      <div className="size-9 rounded-lg bg-emerald-50 flex items-center justify-center mb-2.5">
        <Icon className="size-4.5 text-emerald-600" />
      </div>
      <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}

function RightCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3.5 hover:border-emerald-200 hover:shadow-sm transition-all">
      <div className="size-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
        <Icon className="size-4.5 text-emerald-600" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ícono local de tarjeta de crédito con nombre seguro (sin conflicto de tipado) */
function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}
