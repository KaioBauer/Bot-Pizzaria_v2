import type { Canal, ChamadaTool, MensagemConversa, Repositorios } from "@pizzaria/shared";
import { cacheComValidade } from "../cache";
import { corrigirLinkCardapio, normalizarFormatacao } from "../formatacao";
import { momentoLocal, proximaAbertura, situacaoLoja } from "../horario";
import type { LlmProvider } from "../llm/tipos";
import { loggerSilencioso, type Logger } from "../logger";
import type { ServicoPix } from "../pagamentos/pix";
import { mensagemPedidoConfirmado, mensagemPedidoPix } from "../pedido";
import { cotarPedido, idsDeVariacao } from "../precificacao";
import { expandirArgumentos, montarCodigos } from "./codigos";
import { codigoCarrinhoWeb, conversaCarrinhoWeb, lerItensCarrinho, mensagemCarrinhoInvalido } from "./carrinho-web";
import { mensagemBoasVindas, reconhecerComando } from "./comandos";
import { montarPromptSistema } from "./prompt";
import { pedeTelefoneConhecido, removerNaoAutorizados, resumoSemCotacao, verificarResposta, type ProblemaResposta } from "./verificacao";
import {
  DEFINICOES_TOOLS,
  TOOL,
  executarTool,
  type ContextoTools,
  type PedidoCriado,
  type ResultadoTool,
} from "./tools";

/** Mensagem recebida de qualquer canal, já em formato neutro. */
export interface MensagemEntrada {
  canal: Canal;
  chatId: string;
  clienteNome?: string | null;
  /** Telefone conhecido pelo canal (número do WhatsApp). */
  telefone?: string | null;
  /** Texto do cliente; áudio chega já transcrito, começando com `PREFIXO_AUDIO`. */
  texto: string;
}

/** Marca a mensagem do cliente que veio de áudio (o prompt pede cautela com a transcrição). */
export const PREFIXO_AUDIO = "[áudio transcrito]";

/** Conteúdo enviado depois do texto principal (ex.: QR Code e copia-e-cola do Pix). */
export type Anexo =
  | { tipo: "imagem"; base64: string; mime: "image/png" | "image/jpeg"; legenda?: string }
  | { tipo: "texto"; texto: string };

export interface RespostaAgente {
  texto: string;
  anexos?: Anexo[];
  pedido?: PedidoCriado;
}

export interface OpcoesAgente {
  /** Máximo de mensagens do histórico enviadas ao modelo. */
  limiteHistorico?: number;
  /** Conversa parada há mais que isso recomeça do zero. */
  expiracaoConversaMinutos?: number;
  /** Máximo de rodadas de tool calls por mensagem do cliente. */
  maxRodadas?: number;
  /** Validade do cache de cardápio e configurações. */
  validadeCacheMs?: number;
  /** Link do cardápio público, enviado quando o cliente pede o cardápio. */
  urlCardapio?: string;
  /** Página do pedido pelo link (/pedir); oferecida só com `configuracoes.pedido_link_ativo`. */
  urlPedir?: string;
}

export interface DependenciasAgente {
  repos: Repositorios;
  llm: LlmProvider;
  logger?: Logger;
  agora?: () => Date;
  /** Pix online (gateway configurado). Ausente = Pix não é oferecido. */
  pix?: ServicoPix;
  opcoes?: OpcoesAgente;
}

export const MENSAGEM_ERRO =
  "Desculpe, tive um probleminha aqui 😕 Pode mandar sua mensagem de novo em instantes?";
const MENSAGEM_NAO_ENTENDI = "Desculpe, não entendi. Pode repetir, por favor?";
const MAX_CARACTERES_ENTRADA = 2000;
export const MENSAGEM_ATENDENTE_CHAMADO =
  "Certo! Chamei um atendente da pizzaria, ele continua a conversa com você por aqui em instantes 🙏";
const MENSAGEM_PEDIR_CONFIRMACAO = "Para eu fechar seu pedido, me confirma com um *sim*? 🙂";
const MENSAGEM_RECALCULAR = "Deixa eu conferir o total no sistema antes de fechar: me confirma se é *entrega* (com o bairro) ou *retirada*? 🙂";
const MENSAGEM_CONFERIR_VALORES =
  "Para não te passar nenhum valor errado, deixa eu calcular no sistema: me confirma os itens do pedido (sabor, tamanho e quantidade)? 🙂";

/**
 * O modelo às vezes responde "pedido confirmado" sem chamar finalizar_pedido —
 * o cliente acha que pediu e o pedido não existe. Detecta essa afirmação.
 */
const AFIRMA_PEDIDO_FEITO =
  /\b(pedido|compra)\s+(foi\s+|está\s+|esta\s+|já\s+|ja\s+)*(confirmad|finalizad|registrad|realizad|anotad|fechad|enviad[oa]\s+para\s+a\s+cozinha)|\bconfirmei\s+(o\s+)?seu\s+pedido/i;

export function afirmaPedidoFeito(texto: string): boolean {
  return AFIRMA_PEDIDO_FEITO.test(texto);
}

const AVISO_SEM_FINALIZAR = `Você ia dizer ao cliente que o pedido foi confirmado, mas finalizar_pedido NÃO foi chamado e o pedido NÃO existe. Se o cliente já confirmou o resumo (sim, ok, 👍, pode fechar...), chame finalizar_pedido agora com os mesmos dados do último calcular_pedido. Se ainda não confirmou, peça a confirmação. Nunca diga que o pedido foi confirmado sem chamar finalizar_pedido.`;

const AVISO_RESUMO_SEM_COTACAO = `Você mostrou um resumo com total e pediu confirmação sem chamar calcular_pedido nesta resposta. O total pode estar errado (ex.: cotação antiga de retirada sem a taxa de entrega). Chame calcular_pedido agora com o pedido inteiro, o tipo de entrega e o bairro_id atuais, e monte o resumo com o "resumo_valores" que ela devolver.`;

const AVISO_TELEFONE_CONHECIDO = `Você pediu o telefone ao cliente, mas ele já é conhecido: é o número do WhatsApp (seção Cliente). Não pergunte nem peça para confirmar o telefone; use esse número em cliente_telefone e siga para o próximo passo.`;

const formatarValor = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;

function descreverProblema(p: ProblemaResposta): string {
  switch (p.tipo) {
    case "valor":
      return `Você citou ${p.valores.map(formatarValor).join(", ")}, que não aparece(m) no cardápio, na configuração nem no resultado de uma ferramenta. Não faça contas nem estime valores: use só preços de consultar_cardapio e totais de calcular_pedido (chame a ferramenta se precisar).`;
    case "link":
      return `Você escreveu link(s) que não existem para a pizzaria (${p.links.join(", ")}). O único link permitido é o do cardápio, quando informado na seção Situação.`;
    case "telefone":
      return `Você escreveu telefone(s) que não vieram de nenhuma fonte (${p.telefones.join(", ")}). Use só o telefone da pizzaria da seção Situação e o que o cliente informou.`;
  }
}

function avisoCorrecao(problemas: string[]): string {
  return `

# Correção obrigatória
Sua última resposta NÃO foi enviada ao cliente porque tinha informação sem fonte oficial:
${problemas.map((p) => `- ${p}`).join("\n")}
Refaça a resposta seguindo as regras. Na dúvida, diga que vai confirmar ou chame chamar_atendente — nunca invente.`;
}

/** Descarta o início do histórico até a primeira mensagem do cliente, para
 * nunca enviar ao modelo um resultado de tool sem a chamada correspondente. */
export function recortarHistorico(mensagens: MensagemConversa[]): MensagemConversa[] {
  const inicio = mensagens.findIndex((m) => m.papel === "user");
  return inicio === -1 ? [] : mensagens.slice(inicio);
}

export function criarAgente(deps: DependenciasAgente) {
  const logger = deps.logger ?? loggerSilencioso;
  const agora = deps.agora ?? (() => new Date());
  const limiteHistorico = deps.opcoes?.limiteHistorico ?? 40;
  const expiracaoMs = (deps.opcoes?.expiracaoConversaMinutos ?? 180) * 60_000;
  const maxRodadas = deps.opcoes?.maxRodadas ?? 6;
  const validadeCache = deps.opcoes?.validadeCacheMs ?? 30_000;

  const cardapio = cacheComValidade(() => deps.repos.cardapio.ativo(), validadeCache);
  const configuracao = cacheComValidade(() => deps.repos.loja.configuracao(), validadeCache);

  async function executarComSeguranca(chamada: ChamadaTool, ctx: ContextoTools): Promise<ResultadoTool> {
    try {
      const resultado = await executarTool(chamada.nome, chamada.argumentos, ctx);
      logger.debug({ tool: chamada.nome, resultado: resultado.conteudo.slice(0, 500) }, "Tool executada");
      return resultado;
    } catch (err) {
      logger.error({ err, tool: chamada.nome }, "Falha ao executar tool");
      return {
        conteudo: JSON.stringify({
          sucesso: false,
          erro: "Falha temporária no sistema. Peça desculpas ao cliente e sugira tentar de novo em instantes.",
        }),
      };
    }
  }

  async function persistir(conversaId: string, mensagens: MensagemConversa[], pedidoId?: string) {
    await deps.repos.conversas.adicionar(conversaId, mensagens);
    if (pedidoId) await deps.repos.conversas.encerrar(conversaId, pedidoId);
  }

  async function processar(entrada: MensagemEntrada): Promise<RespostaAgente> {
    const instante = agora();
    const { canal, chatId } = entrada;

    const [config, conversaId, cliente, iaPausada, pedidosRecentes] = await Promise.all([
      configuracao(),
      deps.repos.conversas.obterAtiva(canal, chatId, new Date(instante.getTime() - expiracaoMs)),
      deps.repos.clientes.buscar(canal, chatId),
      deps.repos.atendimento.iaPausada(canal, chatId),
      // A conversa encerra ao finalizar: sem isto, um "obrigado"/"sim" logo depois parece pedido novo.
      deps.repos.pedidos.recentesDoChat(canal, chatId, new Date(instante.getTime() - 12 * 60 * 60_000)).catch(() => []),
    ]);

    // Atendimento humano: a IA fica quieta; a mensagem vai para o painel com aviso.
    if (iaPausada) {
      const conteudo = entrada.texto.trim().slice(0, MAX_CARACTERES_ENTRADA);
      await deps.repos.conversas.adicionar(conversaId, [{ papel: "user", conteudo, autor: "cliente" }]);
      await deps.repos.atendimento.registrar(canal, chatId, {
        texto: conteudo,
        autor: "cliente",
        clienteNome: cliente?.nome ?? entrada.clienteNome ?? null,
        precisaAtencao: true,
      });
      logger.info({ canal, chatId }, "IA pausada: mensagem encaminhada ao atendente");
      return { texto: "" };
    }

    // Pedido montado no cardápio do site (link "Pedir no WhatsApp").
    const codigoCarrinho = codigoCarrinhoWeb(entrada.texto);
    if (codigoCarrinho) {
      const situacaoAgora = situacaoLoja(config, instante);
      const urlCardapio = deps.opcoes?.urlCardapio ?? null;
      if (!situacaoAgora.aberta) {
        // Não consome: o carrinho continua salvo no site para enviar quando abrir.
        return {
          texto: `${mensagemBoasVindas({
            comando: "start",
            config,
            situacao: situacaoAgora,
            proximaAbertura: proximaAbertura(config.horarios, instante, config.fusoHorario),
            urlCardapio: null,
            nomeCliente: cliente?.nome ?? entrada.clienteNome ?? null,
          })}

Seu pedido continua salvo no cardápio: quando abrirmos, é só tocar de novo em *Pedir no WhatsApp*.`,
        };
      }
      const itens = lerItensCarrinho(await deps.repos.carrinhos.consumir(codigoCarrinho));
      if (!itens) return { texto: mensagemCarrinhoInvalido(urlCardapio) };

      const variacoes = await deps.repos.cardapio.variacoesPorIds(idsDeVariacao(itens));
      const cotacao = cotarPedido({
        itens,
        variacoes: new Map(variacoes.map((v) => [v.id, v])),
        tipoEntrega: "retirada",
        bairroId: null,
        bairros: config.bairros,
        pedidoMinimoCentavos: 0, // pedido mínimo e entrega entram no calcular_pedido, adiante
        tamanhos: config.tamanhos,
      });
      const { mensagemCliente, resposta } = conversaCarrinhoWeb(itens, cotacao);

      // Começa uma conversa nova com o carrinho como primeira mensagem do cliente.
      await deps.repos.conversas.encerrar(conversaId, null);
      const novaConversa = await deps.repos.conversas.obterAtiva(canal, chatId, new Date(instante.getTime() - expiracaoMs));
      await persistir(novaConversa, [
        { papel: "user", conteudo: mensagemCliente },
        { papel: "assistant", conteudo: resposta },
      ]);
      logger.info({ canal, chatId, itens: itens.length, ok: cotacao.ok }, "Carrinho do cardápio recebido");
      return { texto: resposta };
    }

    // /start e /reiniciar: zera a conversa e responde na hora, sem o LLM.
    const comando = reconhecerComando(entrada.texto);
    if (comando) {
      await deps.repos.conversas.encerrar(conversaId, null);
      const situacaoAgora = situacaoLoja(config, instante);
      logger.info({ canal, chatId, comando }, "Conversa reiniciada pelo cliente");
      return {
        texto: mensagemBoasVindas({
          comando,
          config,
          situacao: situacaoAgora,
          proximaAbertura: situacaoAgora.aberta ? null : proximaAbertura(config.horarios, instante, config.fusoHorario),
          urlCardapio: deps.opcoes?.urlCardapio ?? null,
          nomeCliente: cliente?.nome ?? entrada.clienteNome ?? null,
        }),
      };
    }

    const historico = recortarHistorico(
      await deps.repos.conversas.mensagens(conversaId, limiteHistorico)
    );
    const situacao = situacaoLoja(config, instante);
    const pixDisponivel = Boolean(deps.pix);
    const urlPedir = config.pedidoLinkAtivo ? (deps.opcoes?.urlPedir ?? null) : null;

    const sistema = montarPromptSistema({
      config,
      situacao,
      agoraTexto: momentoLocal(instante, config.fusoHorario).texto,
      canal,
      clienteNomePerfil: entrada.clienteNome ?? null,
      telefoneCanal: entrada.telefone ?? null,
      cliente,
      pixDisponivel,
      proximaAbertura: situacao.aberta ? null : proximaAbertura(config.horarios, instante, config.fusoHorario),
      urlCardapio: deps.opcoes?.urlCardapio ?? null,
      urlPedir,
      pedidosRecentes,
    });

    const ctx: ContextoTools = {
      canal,
      chatId,
      repos: deps.repos,
      config,
      situacao,
      agora: instante,
      pix: deps.pix ?? null,
      cardapio,
      logger,
      mensagens: () => [...historico, ...novas],
      cliente,
      telefoneCanal: entrada.telefone ?? null,
      nomePerfil: entrada.clienteNome ?? null,
    };

    const novas: MensagemConversa[] = [
      { papel: "user", conteudo: entrada.texto.trim().slice(0, MAX_CARACTERES_ENTRADA) },
    ];

    // Uma chance de corrigir a resposta antes de ir ao cliente (ver verificacao.ts).
    let correcao: string | null = null;
    let corrigido = false;
    let forcarTool: string | undefined;
    let vazias = 0;
    let consultouStatus = false;
    for (let rodada = 0; rodada < maxRodadas; rodada++) {
      const resposta = await deps.llm.completar({
        sistema: correcao ? sistema + correcao : sistema,
        mensagens: [...historico, ...novas],
        tools: DEFINICOES_TOOLS,
        ...(forcarTool ? { forcarTool } : {}),
      });
      forcarTool = undefined;

      // Resposta vazia (acontece com modelos pequenos): uma nova tentativa antes do "não entendi".
      if (resposta.toolCalls.length === 0 && !resposta.conteudo?.trim() && vazias++ === 0) {
        logger.warn({ canal, chatId }, "Modelo respondeu vazio; tentando de novo");
        continue;
      }

      if (resposta.toolCalls.length === 0) {
        let texto = corrigirLinkCardapio(normalizarFormatacao(resposta.conteudo ?? ""), deps.opcoes?.urlCardapio) || MENSAGEM_NAO_ENTENDI;
        // Pedido criado retorna antes daqui; falar de pedido de antes (status) é legítimo.
        const pedidoFalso = !consultouStatus && afirmaPedidoFeito(texto);
        const semCotacao = !pedidoFalso && resumoSemCotacao(texto, novas);
        // Pergunta desnecessária, não informação errada: corrige uma vez e, se insistir, envia assim mesmo.
        const telefoneRepetido = !corrigido && pedeTelefoneConhecido(texto, entrada.telefone ?? null);
        const problemas = verificarResposta(texto, {
          categorias: await cardapio().catch(() => []),
          config,
          mensagens: [...historico, ...novas],
          urlCardapio: deps.opcoes?.urlCardapio ?? null,
          urlPedir,
          telefoneCanal: entrada.telefone ?? null,
          cliente,
        });
        if (pedidoFalso || semCotacao || telefoneRepetido || problemas.length) {
          if (!corrigido) {
            corrigido = true;
            correcao = avisoCorrecao([
              ...(pedidoFalso ? [AVISO_SEM_FINALIZAR] : []),
              ...(semCotacao ? [AVISO_RESUMO_SEM_COTACAO] : []),
              ...(telefoneRepetido ? [AVISO_TELEFONE_CONHECIDO] : []),
              ...problemas.map(descreverProblema),
            ]);
            // Resumo sem cotação: a próxima resposta TEM de ser o calcular_pedido (o modelo tende a repetir o texto).
            if (semCotacao) forcarTool = TOOL.calcularPedido;
            logger.warn({ canal, chatId, texto, pedidoFalso, semCotacao, problemas }, "Resposta sem fonte oficial; pedindo correção ao modelo");
            continue;
          }
          logger.warn({ canal, chatId, texto, pedidoFalso, semCotacao, problemas }, "Modelo insistiu em resposta sem fonte oficial; usando resposta segura");
          if (pedidoFalso) texto = MENSAGEM_PEDIR_CONFIRMACAO;
          else if (semCotacao) texto = MENSAGEM_RECALCULAR;
          else if (problemas.some((p) => p.tipo === "valor")) texto = MENSAGEM_CONFERIR_VALORES;
          else texto = removerNaoAutorizados(texto, problemas) || MENSAGEM_NAO_ENTENDI;
        }
        novas.push({ papel: "assistant", conteudo: texto });
        await persistir(conversaId, novas);
        return { texto };
      }

      // Códigos curtos (e UUIDs corrompidos) viram os IDs completos antes de gravar e executar:
      // o histórico guarda IDs reais, que o finalizar_pedido relê.
      const codigos = montarCodigos(await cardapio().catch(() => []), config.bairros);
      resposta.toolCalls = resposta.toolCalls.map((c) => {
        if (c.nome !== TOOL.calcularPedido && c.nome !== TOOL.finalizarPedido) return c;
        try {
          return { ...c, argumentos: JSON.stringify(expandirArgumentos(JSON.parse(c.argumentos || "{}"), codigos)) };
        } catch {
          return c; // JSON inválido: a tool devolve o erro ao modelo
        }
      });
      novas.push({ papel: "assistant", conteudo: resposta.conteudo, toolCalls: resposta.toolCalls });
      consultouStatus ||= resposta.toolCalls.some((c) => c.nome === TOOL.consultarStatus);

      let pedidoCriado: PedidoCriado | undefined;
      let atendenteChamado = false;
      for (const chamada of resposta.toolCalls) {
        // Toda tool call precisa de resposta, mesmo as ignoradas.
        const resultado = pedidoCriado
          ? { conteudo: JSON.stringify({ sucesso: false, erro: "Pedido já finalizado." }) }
          : await executarComSeguranca(chamada, ctx);
        novas.push({ papel: "tool", toolCallId: chamada.id, conteudo: resultado.conteudo });
        pedidoCriado ??= resultado.pedidoCriado;
        atendenteChamado ||= Boolean(resultado.atendenteChamado);
      }

      if (atendenteChamado && !pedidoCriado) {
        novas.push({ papel: "assistant", conteudo: MENSAGEM_ATENDENTE_CHAMADO });
        await persistir(conversaId, novas);
        return { texto: MENSAGEM_ATENDENTE_CHAMADO };
      }

      if (pedidoCriado) {
        const { pix } = pedidoCriado;
        const texto = pix
          ? mensagemPedidoPix(pedidoCriado.pedido, pedidoCriado.numero, momentoLocal(pix.expiraEm, config.fusoHorario).texto.slice(-5))
          : mensagemPedidoConfirmado(pedidoCriado.pedido, pedidoCriado.numero);
        const anexos: Anexo[] = pix
          ? [
              { tipo: "imagem", base64: pix.qrCodeBase64, mime: "image/png", legenda: `QR Code do Pix — pedido #${pedidoCriado.numero}. Copia e cola na próxima mensagem 👇` },
              { tipo: "texto", texto: pix.qrCode },
            ]
          : [];
        novas.push({ papel: "assistant", conteudo: texto });
        // O pedido já existe: uma falha aqui não pode virar mensagem de erro
        // (o cliente poderia pedir de novo e duplicar).
        await persistir(conversaId, novas, pedidoCriado.id).catch((err: unknown) =>
          logger.error({ err, pedidoId: pedidoCriado.id }, "Falha ao encerrar conversa após pedido")
        );
        return { texto, pedido: pedidoCriado, ...(anexos.length ? { anexos } : {}) };
      }
    }

    logger.warn({ canal, chatId }, "Limite de rodadas de tools atingido");
    novas.push({ papel: "assistant", conteudo: MENSAGEM_NAO_ENTENDI });
    await persistir(conversaId, novas);
    return { texto: MENSAGEM_NAO_ENTENDI };
  }

  return {
    /** Nunca lança: qualquer falha vira uma resposta amigável ao cliente. */
    async processarMensagem(entrada: MensagemEntrada): Promise<RespostaAgente> {
      try {
        const resposta = await processar(entrada);
        // Lista do painel: última mensagem do chat (vazio = IA pausada, já registrado).
        if (resposta.texto) {
          await deps.repos.atendimento
            .registrar(entrada.canal, entrada.chatId, { texto: resposta.texto, autor: "ia", clienteNome: entrada.clienteNome ?? null })
            .catch((err: unknown) => logger.error({ err }, "Falha ao registrar atendimento"));
        }
        return resposta;
      } catch (err) {
        logger.error({ err, canal: entrada.canal, chatId: entrada.chatId }, "Falha ao processar mensagem");
        return { texto: MENSAGEM_ERRO };
      }
    },
  };
}

export type Agente = ReturnType<typeof criarAgente>;
