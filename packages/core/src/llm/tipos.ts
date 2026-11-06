import type { ChamadaTool, MensagemConversa } from "@pizzaria/shared";

/**
 * Interface própria de LLM: o agente não conhece o SDK do provedor. Para
 * trocar de provedor, basta outra implementação de `LlmProvider`.
 */

export interface DefinicaoTool {
  nome: string;
  descricao: string;
  /** JSON Schema dos argumentos. */
  parametros: Record<string, unknown>;
}

export interface RequisicaoLlm {
  sistema: string;
  mensagens: MensagemConversa[];
  tools: DefinicaoTool[];
  /** Obriga o modelo a chamar esta ferramenta (correção de resumo sem cotação). */
  forcarTool?: string;
}

export interface RespostaLlm {
  conteudo: string | null;
  toolCalls: ChamadaTool[];
}

export interface LlmProvider {
  completar(requisicao: RequisicaoLlm): Promise<RespostaLlm>;
}
