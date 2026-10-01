import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://exemplo.supabase.co");

const config: NextConfig = {
  // Pacotes do monorepo são TypeScript puro (sem build próprio).
  transpilePackages: ["@pizzaria/shared", "@pizzaria/db", "@pizzaria/core"],
  // Build enxuto para a imagem Docker (Fase 7).
  output: "standalone",
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
