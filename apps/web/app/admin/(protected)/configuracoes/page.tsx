import type { Metadata } from "next";
import { obterConfiguracaoAdmin } from "@pizzaria/db";
import { exigirAdmin } from "../../../../lib/auth";
import { FormBairros, FormHorarios, FormLoja } from "./formularios";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const { supabase } = await exigirAdmin();
  const { config, horarios, bairros } = await obterConfiguracaoAdmin(supabase);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-black">Configurações</h1>
      <FormLoja inicial={config} />
      <FormHorarios inicial={horarios} />
      <FormBairros inicial={bairros} />
    </main>
  );
}
