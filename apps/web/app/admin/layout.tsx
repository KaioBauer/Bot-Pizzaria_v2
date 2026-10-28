import { Geist, Geist_Mono } from "next/font/google";

// Painel: Geist (interface) e Geist Mono (números), no estilo das ferramentas de produto.
const geist = Geist({ subsets: ["latin"], variable: "--fonte-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--fonte-geist-mono", display: "swap" });

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${geist.variable} ${geistMono.variable} painel min-h-dvh bg-zinc-50 font-sans text-zinc-900 antialiased`}>{children}</div>;
}
