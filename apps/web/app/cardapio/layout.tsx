import { Plus_Jakarta_Sans } from "next/font/google";

// Mesma fonte de app de comida do /pedir (o painel segue com Inter/Fraunces).
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--fonte-app", display: "swap" });

export default function CardapioLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} font-[family-name:var(--fonte-app)] antialiased`}>{children}</div>;
}
