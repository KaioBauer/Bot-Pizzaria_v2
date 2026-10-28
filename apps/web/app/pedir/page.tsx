import type { Metadata } from "next";
import { proximaAbertura, situacaoLoja } from "@pizzaria/core";
import { catalogoPedir, criarRepositorios } from "@pizzaria/db";
import { clientePublico } from "../../lib/supabase/publico";
import { configBot } from "./actions";
import { Pedir } from "./pedir";

// Status aberto/fechado, cardápio e Pix revalidados a cada minuto.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const config = await criarRepositorios(clientePublico()).loja.configuracao();
  const titulo = `Monte sua pizza · ${config.nomePizzaria}`;
  const descricao = `Monte sua pizza do seu jeito e peça direto pelo site da ${config.nomePizzaria}.`;
  return {
    title: { absolute: titulo },
    description: descricao,
    openGraph: { title: titulo, description: descricao, type: "website", locale: "pt_BR" },
  };
}

export default async function PedirPage() {
  const db = clientePublico();
  const config = await criarRepositorios(db).loja.configuracao();
  const [catalogo, bot] = await Promise.all([catalogoPedir(db, config.tamanhos), configBot()]);
  const agora = new Date();
  const situacao = situacaoLoja(config, agora);

  return (
    <Pedir
      catalogo={catalogo}
      loja={{
        nome: config.nomePizzaria,
        aberta: situacao.aberta,
        // Link desligado nas configurações: dá para montar, não para finalizar.
        linkAtivo: config.pedidoLinkAtivo,
        proximaAbertura: situacao.aberta ? null : proximaAbertura(config.horarios, agora, config.fusoHorario),
        pausada: !situacao.aberta && situacao.motivo === "pausada",
        pix: bot.pix,
        bairros: config.bairros,
        pedidoMinimoCentavos: config.pedidoMinimoCentavos,
        maxIngredientes: config.maxIngredientes,
      }}
    />
  );
}
