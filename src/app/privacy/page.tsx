import type { Metadata } from "next";
import PrivacyClient from "./privacy-client";

export const metadata: Metadata = {
  title: "Política de Privacidad — PayFlow SMT",
  description:
    "Política de Privacidad de PayFlow SMT. Conoce qué datos recopilamos, para qué los usamos, la base legal, tus derechos y cómo gestionarlos. Actualizada en julio de 2026, versión 1.1.",
  keywords: [
    "Política de Privacidad",
    "PayFlow SMT",
    "protección de datos",
    "datos personales",
    "privacidad",
    "derechos ARCO",
    "centro de confianza",
  ],
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Política de Privacidad — PayFlow SMT",
    description:
      "Tus datos, explicados con claridad. Conoce qué datos recopilamos, para qué los usamos y cómo ejercer tus derechos.",
    type: "article",
  },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return <PrivacyClient />;
}
