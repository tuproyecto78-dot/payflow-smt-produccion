import Link from "next/link";

export const metadata = {
  title: "Política de Privacidad — PayFlow SMT",
  description: "Política de Privacidad de PayFlow SMT",
};

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">PayFlow SMT</Link>
          <Link href="/" className="text-sm text-primary hover:underline">Volver al inicio</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 prose dark:prose-invert max-w-none">
        <h1>Política de Privacidad</h1>
        <p className="text-muted-foreground">Última actualización: Junio 2026 · Versión 1.0</p>

        <h2>1. Responsable del tratamiento</h2>
        <p>PayFlow SMT, en adelante "la plataforma", es responsable del tratamiento de los datos personales recopilados a través de este sitio web y sus servicios. Para contactar al responsable, escribe a: <Link href="/data-request" className="text-primary hover:underline">Solicitud de datos</Link>.</p>

        <h2>2. Datos que recopilamos</h2>
        <ul>
          <li><strong>Datos de identificación:</strong> nombre completo, documento de identidad, correo electrónico.</li>
          <li><strong>Datos de contacto:</strong> número de teléfono, país, código de área.</li>
          <li><strong>Datos del negocio:</strong> nombre del negocio, tipo, productos o servicios, horarios.</li>
          <li><strong>Datos de uso:</strong> dirección IP, navegador, sistema operativo, páginas visitadas.</li>
          <li><strong>Datos de conversación:</strong> mensajes intercambiados con el Agente IA a través de WhatsApp.</li>
        </ul>

        <h2>3. Finalidades del tratamiento</h2>
        <ul>
          <li>Gestión de suscripciones y cuentas de cliente.</li>
          <li>Procesamiento de pagos a través de proveedores externos (PayPhone).</li>
          <li>Atención al cliente mediante agentes de IA y WhatsApp Business.</li>
          <li>Agenda de citas y gestión de catálogo de productos.</li>
          <li>Cumplimiento de obligaciones legales y fiscales.</li>
          <li>Mejora de la calidad del servicio y desarrollo de nuevas funciones.</li>
        </ul>

        <h2>4. Uso de inteligencia artificial</h2>
        <p>PayFlow SMT utiliza agentes de inteligencia artificial para automatizar conversaciones de WhatsApp. Los mensajes que los clientes envían a través de WhatsApp pueden ser procesados por proveedores de IA para generar respuestas contextualizadas. La IA no inventa datos: utiliza exclusivamente la información cargada por el administrador del negocio (catálogo, FAQ, horarios, políticas). La IA no confirma pagos exitosos; esa confirmación solo proviene del webhook de PayPhone.</p>
        <p>Los proveedores de IA utilizados pueden incluir: Groq, Google Gemini, OpenRouter, Z.ai y NVIDIA NIM, según la configuración del servidor. Las claves API de estos proveedores se almacenan exclusivamente en el servidor (Vercel) y nunca se exponen al navegador del usuario. Los mensajes enviados a los proveedores de IA se transmiten a través de conexiones cifradas (HTTPS).</p>
        <p>El sistema incluye un "Arquitecto IA" interno que monitorea eventos del sistema y propone soluciones. Este módulo requiere aprobación humana obligatoria antes de ejecutar cualquier acción crítica. Ninguna acción automatizada se ejecuta sin autorización del administrador.</p>

        <h2>5. Proveedores externos</h2>
        <ul>
          <li><strong>PayPhone:</strong> procesamiento de pagos vía API Link. PayFlow SMT no almacena datos de tarjetas ni CVV. Los pagos siempre inician como <em>payment_pending</em> y solo se confirman vía webhook oficial de PayPhone.</li>
          <li><strong>WhatsApp Business Cloud API (Meta):</strong> mensajería con clientes.</li>
          <li><strong>Groq / Google Gemini / OpenRouter / Z.ai:</strong> proveedores de IA para generación de respuestas conversacionales. Las API keys se almacenan en el servidor, nunca en el frontend.</li>
          <li><strong>ClickUp:</strong> gestión de tareas internas (opcional, solo administradores).</li>
          <li><strong>Supabase:</strong> almacenamiento de datos en producción (opcional).</li>
        </ul>
        <p>Cada proveedor actúa bajo sus propios términos y políticas de privacidad. PayFlow SMT comparte con ellos únicamente los datos necesarios para prestar el servicio.</p>

        <h2>6. Conservación de datos</h2>
        <p>Conservamos tus datos personales mientras mantengas una relación contractual activa con la plataforma y durante los plazos legales aplicables. Los datos de conversaciones se conservan por el período necesario para prestar soporte y cumplir obligaciones legales. Los datos de consentimiento se conservan durante toda la relación contractual y 5 años adicionales.</p>

        <h2>7. Derechos del titular</h2>
        <p>Como titular de datos personales, tienes derecho a:</p>
        <ul>
          <li><strong>Acceso:</strong> conocer qué datos tenemos sobre ti.</li>
          <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
          <li><strong>Eliminación:</strong> solicitar la supresión de tus datos.</li>
          <li><strong>Oposición:</strong> oponerte al tratamiento de tus datos.</li>
          <li><strong>Portabilidad:</strong> recibir tus datos en formato estructurado.</li>
          <li><strong>Limitación:</strong> restringir el tratamiento de tus datos.</li>
        </ul>
        <p>Para ejercer estos derechos, completa el formulario en: <Link href="/data-request" className="text-primary hover:underline">Solicitud de gestión de datos personales</Link>.</p>

        <h2>8. Seguridad</h2>
        <p>PayFlow SMT implementa medidas técnicas y organizativas para proteger tus datos:</p>
        <ul>
          <li>Cifrado HTTPS en todas las comunicaciones.</li>
          <li>Tokens de PayPhone almacenados solo en el backend (nunca en el frontend).</li>
          <li>No almacenamiento de datos de tarjetas, CVV ni información financiera sensible.</li>
          <li>Control de acceso basado en roles (RBAC).</li>
          <li>Auditoría de acciones administrativas.</li>
          <li>Variables de entorno no expuestas con NEXT_PUBLIC.</li>
        </ul>

        <h2>9. Cambios</h2>
        <p>Podemos actualizar esta Política de Privacidad en cualquier momento. Los cambios se publicarán en esta página con la fecha de actualización correspondiente. Te recomendamos revisar esta página periódicamente. El uso continuado de la plataforma después de los cambios constituye la aceptación de la política actualizada.</p>
        <p className="mt-8 text-sm text-muted-foreground">Para consultas sobre privacidad, visita: <Link href="/data-request" className="text-primary hover:underline">Solicitud de gestión de datos personales</Link>.</p>
      </main>
    </div>
  );
}
