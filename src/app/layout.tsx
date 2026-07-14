import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://payflow-smt.vercel.app";
const SITE_NAME = "PayFlow SMT";
const SITE_DESCRIPTION =
  "PayFlow SMT automatiza pagos por WhatsApp con IA. Conecta conversaciones, agentes de IA y canales de pago para cobrar más rápido de forma simple, segura y automatizada.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PayFlow SMT — Automatización de Pagos por WhatsApp con IA",
    template: "%s | PayFlow SMT",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: [
    "PayFlow SMT",
    "automatización de pagos",
    "pagos por WhatsApp",
    "WhatsApp Business",
    "agentes IA",
    "inteligencia artificial pagos",
    "PayPhone API Link",
    "constructor de flujos",
    "automatización WhatsApp",
    "cobros automáticos",
    "Latinoamérica pagos",
    "SaaS pagos",
  ],
  authors: [{ name: "PayFlow SMT" }],
  creator: "PayFlow SMT",
  publisher: "PayFlow SMT",
  category: "Technology",
  alternates: {
    canonical: "/",
    languages: { "es-LATAM": "/" },
  },
  openGraph: {
    type: "website",
    locale: "es_LA",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "PayFlow SMT — Automatización de Pagos por WhatsApp con IA",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1344,
        height: 768,
        alt: "PayFlow SMT — Plataforma de automatización de pagos por WhatsApp con IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PayFlow SMT — Automatización de Pagos por WhatsApp con IA",
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
    creator: "@payflowsmt",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/payflow-logo.png", sizes: "any", type: "image/png" },
    ],
    apple: "/payflow-logo.png",
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#061426" },
    { media: "(prefers-color-scheme: dark)", color: "#061426" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// JSON-LD structured data for SEO
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "PayFlow SMT",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Payment Automation",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  offers: [
    {
      "@type": "Offer",
      name: "Plan Mensual",
      price: "49.99",
      priceCurrency: "USD",
      description: "Flujo de pagos por WhatsApp con IA",
    },
    {
      "@type": "Offer",
      name: "Plan Anual",
      price: "249.00",
      priceCurrency: "USD",
      description: "Automatización completa anual para pagos por WhatsApp",
    },
  ],
  provider: {
    "@type": "Organization",
    name: "PayFlow SMT",
    url: SITE_URL,
    areaServed: ["LATAM", "Ecuador", "Colombia", "Perú", "México", "Argentina", "Chile"],
  },
  featureList: [
    "Pagos por WhatsApp",
    "Agentes de IA para atención automatizada",
    "Confirmación inteligente de pagos",
    "Integración con canales de pago",
    "Constructor visual de flujos",
    "Integración PayPhone API Link",
    "Simulador de conversaciones",
    "Agenda de citas",
    "Catálogo de productos",
    "Historial de ejecuciones",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5",
    reviewCount: "1",
  },
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PayFlow SMT",
  url: SITE_URL,
  logo: `${SITE_URL}/payflow-logo.png`,
  description: SITE_DESCRIPTION,
  email: "contacto@payflow.smt",
  areaServed: "LATAM",
  sameAs: [],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
