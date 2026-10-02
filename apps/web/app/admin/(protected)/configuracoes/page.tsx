import type { Metadata } from "next";
import { listarEntregadores, listarTamanhos, obterConfiguracaoAdmin } from "@pizzaria/db";
import { CabecalhoPagina } from "../../../../components/ui";
import { exigirAdmin } from "../../../../lib/auth";
import { SecaoEntregadores } from "./entregadores";
import { FormBairros, FormHorarios, FormLoja, FormTamanhos } from "./formularios";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const { supabase } = await exigirAdmin();
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const [{ config, horarios, bairros }, tamanhos, entregadores] = await Promise.all([
    obterConfiguracaoAdmin(supabase),
    listarTamanhos(supabase),
    listarEntregadores(supabase, inicioDoDia),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-10 p-4 sm:p-8">
      <CabecalhoPagina titulo="Configurações" descricao="Como a pizzaria funciona: dados, horários, tamanhos, entrega e motoboys." />
      <FormLoja inicial={config} />
      <FormHorarios inicial={horarios} />
      <FormTamanhos inicial={tamanhos} />
      <FormBairros inicial={bairros} />
      <SecaoEntregadores entregadores={entregadores} />
    </main>
  );
}
