import type { NextConfig } from "next";

const config: NextConfig = {
  // Pacotes do monorepo são TypeScript puro (sem build próprio).
  transpilePackages: ["@pizzaria/shared", "@pizzaria/db", "@pizzaria/core"],
};

export default config;
