import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { IndicadorProgresso } from "../components/ui/progresso";

const inter = Inter({ subsets: ["latin"], variable: "--fonte-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--fonte-fraunces", display: "swap", axes: ["opsz", "SOFT"] });

export const metadata: Metadata = {
  title: { default: "Vianna Pizzaria", template: "%s · Vianna Pizzaria" },
  description: "Cardápio e pedidos da Vianna Pizzaria",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c9351a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        {children}
        <IndicadorProgresso />
      </body>
    </html>
  );
}
