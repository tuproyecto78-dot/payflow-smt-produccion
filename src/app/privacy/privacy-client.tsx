"use client";

import Link from "next/link";
import {
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
  Shield,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import {
  LegalLayout,
  SectionCard,
  HighlightRow,
  CheckList,
  Callout,
  CardGrid,
  IconCard,
  FeatureCtaCard,
  type LegalSection,
} from "@/components/legal/legal-layout";

const SECTIONS: LegalSection[] = [
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
];

export default function PrivacyClient() {
  return (
    <LegalLayout
      heroBadge="Privacidad y confianza"
      heroTitle="Tus datos, explicados con claridad"
      heroDescription="Sabemos que tu información personal es valiosa. Esta política explica, en lenguaje claro, qué datos recopilamos, para qué los usamos y cómo puedes ejercer tus derechos en cualquier momento."
      sections={SECTIONS}
      sidebarCta={{
        icon: Shield,
        title: "¿Quieres ejercer tus derechos?",
        desc: "Solicita acceso, rectificación o eliminación de tus datos.",
        buttonLabel: "Gestionar mis datos",
        href: "/data-request",
      }}
      footerLinks={[
        { href: "/data-request", label: "Solicitud de datos" },
        { href: "/terms", label: "Términos y Condiciones" },
        { href: "/", label: "Inicio" },
      ]}
    >
      {/* 1. Responsable */}
      <SectionCard
        id="responsable"
        icon={UserCog}
        number="01"
        title="¿Quién es responsable de tus datos?"
      >
        <p>
          PayFlow SMT es responsable del tratamiento de los datos personales recopilados a través de
          este sitio y de sus servicios. Actúa como responsable en virtud de la normativa aplicable
          de protección de datos.
        </p>
        <p>
          Para cualquier consulta relacionada con el tratamiento de tus datos personales, puedes
          dirigirte a través del formulario oficial de solicitudes. Nos comprometemos a responder en
          los plazos que establece la ley.
        </p>
        <HighlightRow
          items={[
            "Responsable único: PayFlow SMT.",
            "Canal de atención habilitado para todas tus solicitudes.",
            "Compromiso de respuesta dentro de los plazos legales.",
          ]}
        />
      </SectionCard>

      {/* 2. Datos */}
      <SectionCard id="datos" icon={Database} number="02" title="¿Qué datos recopilamos?">
        <p>
          Solo recopilamos los datos personales necesarios para prestar nuestros servicios. Esto
          significa que evitamos solicitar información que no tenga una finalidad concreta.
        </p>
        <CardGrid>
          <InfoBlock label="Datos de identificación" desc="Nombre, documento y correo." />
          <InfoBlock label="Datos de contacto" desc="Teléfono, país y ciudad." />
          <InfoBlock label="Datos del negocio" desc="Nombre, tipo y horarios." />
          <InfoBlock label="Datos de uso" desc="Navegador y páginas visitadas." />
          <InfoBlock label="Mensajes de atención" desc="Conversaciones con el asistente." />
          <InfoBlock label="Datos de consentimiento" desc="Preferencias y autorizaciones." />
        </CardGrid>
        <Callout type="info">
          No solicitamos ni almacenamos números completos de tarjetas de pago ni códigos de
          seguridad. Esos datos se gestionan directamente a través de servicios especializados de
          procesamiento de pagos.
        </Callout>
      </SectionCard>

      {/* 3. Finalidad */}
      <SectionCard id="finalidad" icon={Target} number="03" title="¿Para qué utilizamos tus datos?">
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
      <SectionCard id="legal" icon={Scale} number="04" title="¿Cuál es la base legal?">
        <p>
          El tratamiento de tus datos se fundamenta en bases legales válidas. Antes de recopilar
          cualquier información, verificamos que exista una base legítima para ello.
        </p>
        <CardGrid>
          <IconCard icon={FileWarning} title="Ejecución de un contrato" desc="Para brindarte los servicios que contrataste." />
          <IconCard icon={ShieldCheck} title="Consentimiento" desc="Para usos que requieren tu autorización expresa." />
          <IconCard icon={Scale} title="Cumplimiento legal" desc="Para obligaciones fiscales o reglamentarias." />
          <IconCard icon={Shield} title="Interés legítimo" desc="Para mejorar la seguridad y el servicio." />
        </CardGrid>
      </SectionCard>

      {/* 5. Automatización */}
      <SectionCard id="automatizacion" icon={Bot} number="05" title="Automatización">
        <p>
          PayFlow SMT utiliza sistemas automatizados para agilizar la atención y la gestión de
          cobros. Estos sistemas se apoyan en tecnologías de inteligencia artificial para responder
          mensajes y generar enlaces de pago según la información cargada por el administrador del
          negocio.
        </p>
        <Callout type="success">
          Los sistemas automatizados <strong>no toman decisiones con efectos legales</strong> sobre
          ti sin posibilidad de revisión humana. Las acciones críticas requieren aprobación de una
          persona.
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
      <SectionCard id="compartir" icon={Share2} number="06" title="¿Con quién compartimos los datos?">
        <p>
          Compartimos datos personales únicamente con categorías de servicios necesarios para
          prestar la plataforma, bajo acuerdos que aseguran su protección. No vendemos tus datos
          personales.
        </p>
        <CardGrid>
          <IconCard icon={Database} title="Servicios de alojamiento" desc="Para almacenar la información de tu cuenta y tu negocio." />
          <IconCard icon={ShieldCheck} title="Servicios de comunicación" desc="Para enviar mensajes a tus clientes a través de canales de mensajería." />
          <IconCard icon={CreditCard} title="Procesamiento de pagos" desc="Para generar y gestionar enlaces y transacciones de cobro." />
          <IconCard icon={Lock} title="Seguridad y soporte tecnológico" desc="Para monitorear, proteger y dar soporte a la plataforma." />
        </CardGrid>
        <Callout type="info">
          Cada servicio actúa bajo sus propios términos y políticas de privacidad. Compartimos con
          ellos únicamente los datos estrictamente necesarios.
        </Callout>
      </SectionCard>

      {/* 7. Conservación */}
      <SectionCard id="conservacion" icon={Clock} number="07" title="¿Durante cuánto tiempo conservamos los datos?">
        <p>
          Conservamos tus datos mientras exista una relación contractual activa y durante los plazos
          legales aplicables. Una vez que dejan de ser necesarios, los eliminamos o los anonimizamos.
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
      <SectionCard id="derechos" icon={ScrollText} number="08" title="Tus derechos">
        <p>
          Como titular de datos personales, puedes ejercer tus derechos en cualquier momento. Hemos
          habilitado un formulario para que presentes tus solicitudes de forma sencilla.
        </p>
        <CardGrid>
          <IconCard icon={UserCog} title="Acceso" desc="Conocer qué datos tenemos sobre ti." />
          <IconCard icon={ShieldCheck} title="Rectificación" desc="Corregir datos inexactos o incompletos." />
          <IconCard icon={Shield} title="Eliminación" desc="Solicitar la supresión de tus datos." />
          <IconCard icon={Target} title="Limitación" desc="Restringir el tratamiento de tus datos." />
          <IconCard icon={Share2} title="Portabilidad" desc="Recibir tus datos en formato estructurado." />
          <IconCard icon={Scale} title="Oposición" desc="Oponerte al tratamiento de tus datos." />
        </CardGrid>
        <Callout type="success">
          Para ejercer cualquiera de estos derechos, completa el formulario en{" "}
          <Link href="/data-request" className="font-semibold underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-700">
            Solicitud de datos
          </Link>
          .
        </Callout>
      </SectionCard>

      {/* 9. Seguridad */}
      <SectionCard id="seguridad" icon={Lock} number="09" title="Seguridad">
        <p>
          Aplicamos medidas razonables de seguridad técnica y organizativa para proteger tus datos
          personales frente a accesos no autorizados, alteraciones o divulgaciones.
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
          Ningún sistema es 100% seguro. Si ocurriera un incidente de seguridad que afecte tus datos,
          actuaremos conforme a la normativa aplicable.
        </Callout>
      </SectionCard>

      {/* 10. Datos de terceros */}
      <SectionCard id="terceros" icon={Layers} number="10" title="Datos de terceros">
        <p>
          Cuando un negocio utiliza PayFlow SMT, es posible que se procesen datos personales de sus
          propios clientes (por ejemplo, durante conversaciones de atención o gestiones de cobro). En
          esos casos, el negocio es el responsable de dichos datos y PayFlow SMT actúa como
          encargado del tratamiento.
        </p>
        <CheckList
          items={[
            "El negocio debe informar a sus clientes sobre el tratamiento de sus datos.",
            "El negocio debe contar con las autorizaciones necesarias.",
            "PayFlow SMT trata los datos según las instrucciones del negocio.",
            "Los datos de terceros se eliminan o anonimizan cuando dejan de ser necesarios.",
          ]}
        />
      </SectionCard>

      {/* 11. Cambios */}
      <SectionCard id="cambios" icon={FileWarning} number="11" title="Cambios en esta política">
        <p>
          Podemos actualizar esta Política de Privacidad cuando sea necesario para reflejar cambios
          en nuestros servicios o en la normativa aplicable. Publicaremos cualquier modificación en
          esta página junto con la fecha de actualización correspondiente.
        </p>
        <p>
          Te recomendamos revisar esta página periódicamente. El uso continuado de la plataforma
          después de los cambios constituye la aceptación de la política actualizada.
        </p>
      </SectionCard>

      {/* CTA destacada */}
      <FeatureCtaCard
        badge="Tú tienes el control"
        title="Gestiona tus datos personales cuando lo necesites"
        description="Puedes solicitar acceso, rectificación, eliminación, limitación o portabilidad de tus datos a través de nuestro formulario oficial. Tu privacidad es una prioridad."
        buttonLabel="Solicitar gestión de datos"
        href="/data-request"
      />
    </LegalLayout>
  );
}

/* helper local para preservar el estilo de los data pills originales */
function InfoBlock({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
      <p className="text-sm font-semibold text-slate-900 leading-tight">{label}</p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}
