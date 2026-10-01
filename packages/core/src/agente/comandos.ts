import type { ConfiguracaoLoja } from "@pizzaria/shared";
import type { SituacaoLoja } from "../horario";

/**
 * Comandos de chat tratados sem passar pelo LLM (resposta imediata e sem
 * custo). Funcionam em qualquer canal: no Telegram aparecem no menu.
 *   /start      primeira abertura do bot (ou link "Pedir no Telegram")
 *   /reiniciar  o cliente quer começar o atendimento do zero
 */
export type ComandoChat = "start" | "reiniciar";

const PADRAO = /^\/(start|reiniciar|recomecar|recomeçar|reset)(@\w+)?(?:\s|$)/i;

/**
 * Mensagens em rajada chegam juntas (uma por linha): se qualquer linha for um
 * comando, ele vale — o cliente quer recomeçar, o resto é descartado.
 */
export function reconhecerComando(texto: string): ComandoChat | null {
  const comandos = texto
    .split("\n")
    .map((linha) => PADRAO.exec(linha.trim())?.[1]?.toLowerCase())
    .filter(Boolean);
  if (comandos.length === 0) return null;
  return comandos.every((c) => c === "start") ? "start" : "reiniciar";
}

export function mensagemBoasVindas(params: {
  comando: ComandoChat;
  config: ConfiguracaoLoja;
  situacao: SituacaoLoja;
  proximaAbertura: string | null;
  urlCardapio: string | null;
  nomeCliente: string | null;
}): string {
  const primeiroNome = params.nomeCliente?.trim().split(/\s+/)[0];
  const abertura =
    params.comando === "reiniciar"
      ? "🔄 Pronto, comecei do zero! Qualquer pedido que estava montando foi descartado."
      : `🍕 Olá${primeiroNome ? `, ${primeiroNome}` : ""}! Aqui é o atendimento da *${params.config.nomePizzaria}*.`;

  const linhas = [abertura, ""];
  if (params.situacao.aberta) {
    linhas.push('É só me dizer o que deseja, do seu jeito. Por exemplo: "uma calabresa grande e uma coca, para entrega".');
  } else if (params.situacao.motivo === "pausada") {
    linhas.push("Estamos com a cozinha cheia e pausamos os pedidos por alguns minutos. Já, já voltamos! 🙏");
  } else {
    linhas.push(`No momento estamos fechados${params.proximaAbertura ? ` — abrimos ${params.proximaAbertura}` : ""}. Mas pode olhar o cardápio à vontade!`);
  }
  if (params.urlCardapio) linhas.push("", `📋 Cardápio completo: ${params.urlCardapio}`);
  return linhas.join("\n");
}
