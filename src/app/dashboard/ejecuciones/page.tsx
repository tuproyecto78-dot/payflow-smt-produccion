"use client";

export default function EjecucionesPage() {
  const titles: Record<string, { title: string; desc: string }> = {
    solicitudes: { title: "Solicitudes", desc: "Solicitudes de suscripción pendientes." },
    clientes: { title: "Clientes", desc: "Gestión de clientes y roles." },
    ejecuciones: { title: "Ejecuciones", desc: "Historial de ejecuciones de flujos." },
    configuracion: { title: "Configuración", desc: "Cambia tu contraseña y preferencias." },
  };
  const info = titles["ejecuciones"];
  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-10">
      <h1 className="text-2xl font-bold tracking-tight mb-2">{info.title}</h1>
      <p className="text-muted-foreground">{info.desc}</p>
      <div className="mt-6 rounded-xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">Esta sección estará disponible próximamente.</p>
      </div>
    </div>
  );
}
