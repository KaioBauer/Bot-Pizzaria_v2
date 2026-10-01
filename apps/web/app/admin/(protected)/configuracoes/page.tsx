import type { Metadata } from "next";
import { obterConfiguracaoAdmin } from "@pizzaria/db";
import { CabecalhoPagina } from "../../../../components/ui";
import { exigirAdmin } from "../../../../lib/auth";
import { FormBairros, FormHorarios, FormLoja } from "./formularios";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const { supabase } = await exigirAdmin();
  const { config, horarios, bairros } = await obterConfiguracaoAdmin(supabase);

  return (
    <main className="mx-auto max-w-6xl space-y-10 p-4 sm:p-8">
      <CabecalhoPagina titulo="Configurações" descricao="Como a pizzaria funciona: dados, horários e entrega." />
      <FormLoja inicial={config} />
      <FormHorarios inicial={horarios} />
      <FormBairros inicial={bairros} />
    </main>
  );
}
