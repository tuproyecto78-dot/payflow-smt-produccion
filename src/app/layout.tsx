import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "PayFlow SMT — Constructor Visual de Flujos",
  description:
    "PayFlow SMT es un constructor visual de flujos para automatización de WhatsApp, pagos, agentes de IA e integraciones API/webhook.",
  keywords: [
    "PayFlow SMT",
    "constructor de flujos",
    "automatización WhatsApp",
    "pagos",
    "agentes IA",
    "webhooks",
  ],
  authors: [{ name: "PayFlow SMT" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
