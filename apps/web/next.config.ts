import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://exemplo.supabase.co");

const config: NextConfig = {
  // Pacotes do monorepo são TypeScript puro (sem build próprio).
  transpilePackages: ["@pizzaria/shared", "@pizzaria/db", "@pizzaria/core"],
  // Build enxuto para a imagem Docker (Fase 7).
  output: "standalone",
  // Só em desenvolvimento: abrir o painel/cardápio pelo celular — rede local (IP ou
  // <ip>.nip.io; o WhatsApp só deixa clicável link com domínio) ou túnel da Cloudflare.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "**.nip.io", "*.trycloudflare.com"],
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  images: {
    remotePatterns: [{ protocol: "https", hostname: supabase.hostname, pathname: "/storage/v1/object/public/**" }],
  },
  experimental: {
    // Fotos de produto até 5 MB (+ folga do multipart).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default config;
