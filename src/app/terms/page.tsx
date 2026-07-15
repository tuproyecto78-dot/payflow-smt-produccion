import type { Metadata } from "next";
import TermsClient from "./terms-client";

export const metadata: Metadata = {
  title: "Términos y Condiciones — PayFlow SMT",
  description:
    "Términos y Condiciones de PayFlow SMT. Reglas claras para trabajar juntos: naturaleza del servicio, uso permitido, pagos, disponibilidad, seguridad y responsabilidad. Actualizada en julio de 2026, versión 1.1.",
  keywords: [
    "Términos y Condiciones",
    "PayFlow SMT",
    "condiciones de uso",
    "plataforma SaaS",
    "suscripción",
    "centro de confianza",
  ],
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Términos y Condiciones — PayFlow SMT",
    description:
      "Reglas claras para trabajar juntos. Conoce la naturaleza del servicio, el uso permitido, los pagos y la responsabilidad.",
    type: "article",
  },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <TermsClient />;
}
