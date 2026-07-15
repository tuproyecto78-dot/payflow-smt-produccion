"use client";

import Link from "next/link";
import {
  Briefcase,
  UserPlus,
  ShieldCheck,
  Store,
  MessagesSquare,
  CreditCard,
  ServerCog,
  KeyRound,
  Copyright,
  Ban,
  AlertTriangle,
  FileWarning,
  HelpCircle,
  Shield,
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
  { id: "naturaleza", label: "Naturaleza del servicio", icon: Briefcase },
  { id: "cuenta", label: "Cuenta y uso", icon: UserPlus },
  { id: "uso-permitido", label: "Uso permitido", icon: ShieldCheck },
  { id: "responsabilidades", label: "Responsabilidades del negocio", icon: Store },
  { id: "comunicaciones", label: "Comunicaciones y automatización", icon: MessagesSquare },
  { id: "pagos", label: "Pagos y suscripciones", icon: CreditCard },
  { id: "disponibilidad", label: "Disponibilidad del servicio", icon: ServerCog },
  { id: "seguridad-cuenta", label: "Seguridad de la cuenta", icon: KeyRound },
  { id: "propiedad", label: "Propiedad intelectual", icon: Copyright },
  { id: "suspension", label: "Suspensión o cancelación", icon: Ban },
  { id: "responsabilidad", label: "Limitación de responsabilidad", icon: AlertTriangle },
  { id: "datos", label: "Protección de datos", icon: ShieldCheck },
  { id: "cambios", label: "Cambios y contacto", icon: FileWarning },
];

export default function TermsClient() {
  return (
    <LegalLayout
      heroBadge="Condiciones de uso"
      heroTitle="Reglas claras para trabajar juntos"
      heroDescription="Estos términos establecen las condiciones bajo las que prestamos el servicio. Están redactados en lenguaje claro para que sepas exactamente qué esperamos de ti y qué puedes esperar de nosotros."
      sections={SECTIONS}
      sidebarCta={{
        icon: HelpCircle,
        title: "¿Tienes dudas sobre los términos?",
        desc: "Estamos para ayudarte a entender cada condición.",
        buttonLabel: "Solicitar ayuda",
        href: "/data-request",
      }}
      footerLinks={[
        { href: "/privacy", label: "Política de Privacidad" },
        { href: "/data-request", label: "Solicitud de datos" },
        { href: "/", label: "Inicio" },
      ]}
    >
      {/* 1. Naturaleza del servicio */}
      <SectionCard
        id="naturaleza"
        icon={Briefcase}
        number="01"
        title="Naturaleza del servicio"
      >
        <p>
          PayFlow SMT es una plataforma de software como servicio (SaaS) que permite a los negocios
          gestionar flujos de atención, agendar citas, administrar catálogos de productos y procesar
          cobros mediante canales de comunicación y proveedores de pago autorizados.
        </p>
        <p>
          El servicio se presta bajo suscripción y no constituye una relación laboral, societaria ni
          de representación comercial entre PayFlow SMT y el cliente. El cliente mantiene siempre la
          titularidad de su negocio y de la relación con sus propios clientes.
        </p>
        <Callout type="info">
          PayFlow SMT es una herramienta de apoyo. La operación comercial, la oferta de productos y
          la relación con los clientes finales corresponden al negocio.
        </Callout>
      </SectionCard>

      {/* 2. Cuenta y uso */}
      <SectionCard
        id="cuenta"
        icon={UserPlus}
        number="02"
        title="Creación y uso de la cuenta"
      >
        <p>
          Para utilizar la plataforma, el cliente debe crear una cuenta proporcionando información
          veraz, completa y actualizada. El cliente es responsable de mantener la confidencialidad
          de sus credenciales de acceso y de todas las actividades realizadas desde su cuenta.
        </p>
        <HighlightRow
          items={[
            "La cuenta es personal e intransferible.",
            "El cliente debe notificar de inmediato cualquier uso no autorizado.",
            "La información proporcionada debe mantenerse actualizada.",
            "No se permiten cuentas compartidas entre negocios distintos.",
          ]}
        />
      </SectionCard>

      {/* 3. Uso permitido */}
      <SectionCard
        id="uso-permitido"
        icon={ShieldCheck}
        number="03"
        title="Uso permitido"
      >
        <p>
          La plataforma se proporciona para uso comercial legítimo. Al utilizar el servicio, el
          cliente se compromete a respetar las siguientes reglas:
        </p>
        <CheckList
          items={[
            "No utilizar la plataforma para actividades ilegales, fraude o spam.",
            "No enviar mensajes no solicitados a personas que no hayan dado su consentimiento.",
            "Proporcionar información veraz y actualizada sobre su negocio.",
            "No intentar acceder a datos o cuentas de otros clientes sin autorización.",
            "No interferir, dañar ni sobrecargar los sistemas de la plataforma.",
            "Cumplir con las normativas locales aplicables a su actividad comercial.",
          ]}
        />
        <Callout type="warning">
          Queda estrictamente prohibido el uso de la plataforma para fines fraudulentos, envío masivo
          de mensajes no consentidos, o cualquier actividad que vulnere derechos de terceros o la ley.
        </Callout>
      </SectionCard>

      {/* 4. Responsabilidades del negocio */}
      <SectionCard
        id="responsabilidades"
        icon={Store}
        number="04"
        title="Responsabilidades del negocio"
      >
        <p>
          El negocio cliente es el único responsable de la operación comercial que realiza a través
          de la plataforma. En particular, es responsable de:
        </p>
        <HighlightRow
          items={[
            "La información, precios, productos y servicios que ofrece.",
            "El cumplimiento de las normativas locales de protección al consumidor.",
            "La veracidad de precios, disponibilidad, horarios y políticas publicadas.",
            "La entrega de los productos y servicios ofrecidos a sus clientes.",
            "La atención de reclamos, devoluciones y garantías según sus propias políticas.",
            "Obtener el consentimiento de sus clientes para enviarles comunicaciones.",
          ]}
        />
        <Callout type="info">
          PayFlow SMT no interviene en la relación comercial entre el negocio y sus clientes. Cualquier
          disputa al respecto debe resolverse directamente entre las partes.
        </Callout>
      </SectionCard>

      {/* 5. Comunicaciones y automatización */}
      <SectionCard
        id="comunicaciones"
        icon={MessagesSquare}
        number="05"
        title="Comunicaciones y automatización"
      >
        <p>
          La plataforma permite gestionar comunicaciones con clientes a través de servicios de
          comunicación autorizados. Asimismo, utiliza sistemas automatizados como herramienta de
          apoyo para agilizar la atención y la generación de cobros.
        </p>
        <Callout type="success">
          Los sistemas automatizados son <strong>herramientas de apoyo</strong>. Las respuestas se
          basan en la información cargada por el negocio y no sustituyen la responsabilidad de este
          sobre la atención brindada a sus clientes.
        </Callout>
        <HighlightRow
          items={[
            "El negocio debe cargar información veraz para que las respuestas sean correctas.",
            "El negocio es responsable de contar con el consentimiento de sus clientes.",
            "Los sistemas automatizados no sustituyen la supervisión humana del negocio.",
            "Las comunicaciones se realizan a través de servicios de comunicación autorizados.",
          ]}
        />
      </SectionCard>

      {/* 6. Pagos y suscripciones */}
      <SectionCard
        id="pagos"
        icon={CreditCard}
        number="06"
        title="Pagos y suscripciones"
      >
        <p>
          El acceso a la plataforma se realiza mediante planes de suscripción. Los cobros se
          procesan a través de proveedores de pago autorizados. PayFlow SMT no almacena números
          completos de tarjetas ni códigos de seguridad.
        </p>
        <CardGrid>
          <IconCard icon={CreditCard} title="Proveedores de pago autorizados" desc="Las transacciones se gestionan a través de servicios especializados." />
          <IconCard icon={ShieldCheck} title="Sin datos sensibles" desc="No almacenamos números completos de tarjetas ni códigos de seguridad." />
          <IconCard icon={Briefcase} title="Planes de suscripción" desc="Acceso según el plan contratado y su vigencia." />
          <IconCard icon={FileWarning} title="Renovación" desc="Conoce las condiciones de renovación de tu plan." />
        </CardGrid>
        <Callout type="info">
          El procesamiento de pagos está sujeto a los términos y condiciones del proveedor de pago
          correspondiente. Las eventuales devoluciones o disputas se rigen por las políticas de dicho
          proveedor.
        </Callout>
      </SectionCard>

      {/* 7. Disponibilidad del servicio */}
      <SectionCard
        id="disponibilidad"
        icon={ServerCog}
        number="07"
        title="Disponibilidad del servicio"
      >
        <p>
          Procuramos mantener el servicio disponible de forma continua. Sin embargo, no garantizamos
          una disponibilidad ininterrumpida, ya que pueden existir mantenimientos programados o
          interrupciones ajenas a nuestra voluntad.
        </p>
        <Callout type="warning">
          No prometemos un porcentaje exacto de disponibilidad, salvo que exista un contrato de nivel
          de servicio (SLA) formalmente suscrito. Pueden presentarse mantenimientos o interrupciones
          externas que escapen a nuestro control.
        </Callout>
        <HighlightRow
          items={[
            "Se procura mantener el servicio disponible la mayor parte del tiempo.",
            "Los mantenimientos programados se comunican con anticipación cuando es posible.",
            "Las interrupciones externas pueden afectar temporalmente el servicio.",
            "No nos responsabilizamos por interrupciones causadas por fuerza mayor.",
          ]}
        />
      </SectionCard>

      {/* 8. Seguridad de la cuenta */}
      <SectionCard
        id="seguridad-cuenta"
        icon={KeyRound}
        number="08"
        title="Seguridad de la cuenta"
      >
        <p>
          Aplicamos medidas razonables de seguridad técnica y organizativa. No obstante, el cliente
          también desempeña un papel esencial en la protección de su cuenta.
        </p>
        <CheckList
          items={[
            "Mantener sus credenciales de acceso de forma segura.",
            "Notificar de inmediato cualquier uso no autorizado.",
            "No compartir contraseñas ni accesos con terceros.",
            "Cerrar sesión en dispositivos compartidos o públicos.",
            "Mantener actualizado su navegador y sistema operativo.",
          ]}
        />
        <Callout type="info">
          Ningún sistema es completamente seguro. El cliente debe colaborar con las buenas prácticas
          de seguridad para reducir riesgos.
        </Callout>
      </SectionCard>

      {/* 9. Propiedad intelectual */}
      <SectionCard
        id="propiedad"
        icon={Copyright}
        number="09"
        title="Propiedad intelectual"
      >
        <p>
          La plataforma, su diseño, sus funcionalidades y los materiales asociados son propiedad de
          PayFlow SMT y están protegidos por las normas de propiedad intelectual aplicables.
        </p>
        <HighlightRow
          items={[
            "El cliente recibe una licencia de uso limitada, no exclusiva y revocable.",
            "No se permite copiar, modificar ni redistribuir la plataforma.",
            "El contenido cargado por el cliente mantiene su titularidad.",
            "El cliente garantiza que dispone de los derechos sobre el contenido que carga.",
          ]}
        />
      </SectionCard>

      {/* 10. Suspensión o cancelación */}
      <SectionCard
        id="suspension"
        icon={Ban}
        number="10"
        title="Suspensión o cancelación"
      >
        <p>
          PayFlow SMT podrá suspender o cancelar el acceso a la plataforma cuando existan causas
          justificadas, conforme a lo establecido en estos términos.
        </p>
        <HighlightRow
          items={[
            "Incumplimiento de estos términos y condiciones.",
            "Uso de la plataforma para actividades fraudulentas o ilegales.",
            "Falta de pago de la suscripción correspondiente.",
            "Riesgo de seguridad o afectación a otros clientes.",
            "Solicitud expresa del cliente de cancelación del servicio.",
          ]}
        />
        <Callout type="info">
          En caso de cancelación, el cliente podrá solicitar la recuperación de sus datos durante el
          plazo que establezca la normativa aplicable, a través del formulario de solicitud de datos.
        </Callout>
      </SectionCard>

      {/* 11. Limitación de responsabilidad */}
      <SectionCard
        id="responsabilidad"
        icon={AlertTriangle}
        number="11"
        title="Limitación de responsabilidad"
      >
        <p>
          En la máxima medida permitida por la ley, PayFlow SMT no será responsable por:
        </p>
        <CheckList
          items={[
            "Daños indirectos, incidentales o consecuentes.",
            "Pérdida de ingresos, clientes o datos derivados del uso del servicio.",
            "Acciones u omisiones de servicios de comunicación o proveedores de pago.",
            "Información incorrecta cargada por el negocio cliente.",
            "Interrupciones del servicio por causas ajenas a su control.",
          ]}
        />
        <Callout type="warning">
          La responsabilidad total de PayFlow SMT frente al cliente, cuando proceda, se limitará al
          monto pagado por este en los últimos tres meses de suscripción activa.
        </Callout>
      </SectionCard>

      {/* 12. Protección de datos */}
      <SectionCard
        id="datos"
        icon={ShieldCheck}
        number="12"
        title="Protección de datos"
      >
        <p>
          El tratamiento de datos personales se rige por nuestra{" "}
          <Link
            href="/privacy"
            className="font-semibold underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-700"
          >
            Política de Privacidad
          </Link>
          . El cliente es responsable del tratamiento de los datos de sus propios clientes y debe
          cumplir con la normativa de protección de datos aplicable en su jurisdicción.
        </p>
        <HighlightRow
          items={[
            "PayFlow SMT actúa como encargado del tratamiento de los datos del negocio.",
            "El negocio es responsable de informar y obtener consentimientos de sus clientes.",
            "Las solicitudes de derechos se gestionan a través del formulario de datos.",
          ]}
        />
      </SectionCard>

      {/* 13. Cambios y contacto */}
      <SectionCard
        id="cambios"
        icon={FileWarning}
        number="13"
        title="Cambios y contacto"
      >
        <p>
          Podemos actualizar estos Términos y Condiciones cuando sea necesario. Los cambios se
          publicarán en esta página con la fecha de actualización correspondiente. El uso continuado
          de la plataforma después de los cambios constituye la aceptación de los términos
          actualizados.
        </p>
        <p>
          Para cualquier consulta relacionada con estos términos, puedes dirigirte a través de
          nuestro formulario oficial de solicitudes.
        </p>
      </SectionCard>

      {/* CTA destacada */}
      <FeatureCtaCard
        badge="Estamos para ayudarte"
        title="¿Tienes preguntas sobre los términos o necesitas asistencia?"
        description="Si necesitas aclarar alguna condición, gestionar tus datos o plantear una consulta, utiliza nuestro formulario oficial. Te responderemos a la brevedad."
        buttonLabel="Contactar con soporte"
        href="/data-request"
      />
    </LegalLayout>
  );
}
