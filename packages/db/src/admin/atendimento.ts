import type { AutorMensagem, Canal } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

/** Atendimento humano no painel (sessão do admin, RLS). */

export interface AtendimentoPainel {
  canal: Canal;
  chatId: string;
  clienteNome: string | null;
  iaPausada: boolean;
  pausadaPor: "ia" | "atendente" | null;
  motivo: string | null;
  precisaAtencao: boolean;
  ultimaMensagem: string | null;
  ultimaMensagemAutor: AutorMensagem | null;
  ultimaMensagemEm: string;
}

export interface MensagemPainel {
  /** "m<id>" (histórico) ou "a<id>" (resposta do atendente ainda não enviada). */
  chave: string;
  autor: AutorMensagem;
  texto: string;
  em: string;
  /** Só para respostas do atendente na fila de envio. */
  envio?: "enviando" | "falhou";
  erro?: string | null;
}

export async function listarAtendimentos(db: Db, limite = 100): Promise<AtendimentoPainel[]> {
  const linhas = exigir(
    await db.from("atendimentos").select("*").order("ultima_mensagem_em", { ascending: false }).limit(limite),
    "Erro ao carregar conversas"
  );
  return linhas.map((a) => ({
    canal: a.canal as Canal,
    chatId: a.chat_id,
    clienteNome: a.cliente_nome,
    iaPausada: a.ia_pausada,
    pausadaPor: a.pausada_por as AtendimentoPainel["pausadaPor"],
    motivo: a.motivo,
    precisaAtencao: a.precisa_atencao,
    ultimaMensagem: a.ultima_mensagem,
    ultimaMensagemAutor: a.ultima_mensagem_autor as AutorMensagem | null,
    ultimaMensagemEm: a.ultima_mensagem_em,
  }));
}

export async function contarPrecisaAtencao(db: Db): Promise<number> {
  const r = await db.from("atendimentos").select("canal", { count: "exact", head: true }).eq("precisa_atencao", true);
  if (r.error) throw new Error(`Erro ao contar atendimentos: ${r.error.message}`);
  return r.count ?? 0;
}

/** Mensagens visíveis (cliente, IA, atendente) de todas as conversas do chat + fila do atendente. */
export async function mensagensDoChat(db: Db, canal: Canal, chatId: string, limite = 200): Promise<MensagemPainel[]> {
  const [historico, fila] = await Promise.all([
    db
      .from("conversa_mensagens")
      .select("id, papel, conteudo, autor, created_at, conversa:conversas!inner(canal, chat_id)")
      .eq("conversa.canal", canal)
      .eq("conversa.chat_id", chatId)
      .in("papel", ["user", "assistant"])
      .not("conteudo", "is", null)
      .order("id", { ascending: false })
      .limit(limite),
    db
      .from("mensagens_atendente")
      .select("id, texto, created_at, tentativas, ultimo_erro")
      .eq("canal", canal)
      .eq("chat_id", chatId)
      .is("enviada_em", null)
      .order("id"),
  ]);
  const mensagens = exigir(historico, "Erro ao carregar mensagens")
    .filter((m) => m.conteudo?.trim())
    .reverse()
    .map(
      (m): MensagemPainel => ({
        chave: `m${m.id}`,
        autor: (m.autor as AutorMensagem | null) ?? (m.papel === "user" ? "cliente" : "ia"),
        texto: m.conteudo!,
        em: m.created_at,
      })
    );
  const pendentes = exigir(fila, "Erro ao carregar fila de envio").map(
    (m): MensagemPainel => ({
      chave: `a${m.id}`,
      autor: "atendente",
      texto: m.texto,
      em: m.created_at,
      envio: m.tentativas >= 5 ? "falhou" : "enviando",
      erro: m.ultimo_erro,
    })
  );
  return [...mensagens, ...pendentes];
}

/** Resposta do atendente: vai para a fila; o bot envia e a IA fica pausada (trigger). */
export async function enviarMensagemAtendente(db: Db, canal: Canal, chatId: string, texto: string): Promise<void> {
  exigir(
    await db.from("mensagens_atendente").insert({ canal, chat_id: chatId, texto: texto.trim() }).select("id"),
    "Erro ao enviar mensagem"
  );
}

/** Assumir (pausa a IA) ou devolver para a IA. Os dois desligam o aviso. */
export async function definirIaPausada(db: Db, canal: Canal, chatId: string, pausada: boolean): Promise<void> {
  exigir(
    await db
      .from("atendimentos")
      .update(
        pausada
          ? { ia_pausada: true, pausada_em: new Date().toISOString(), pausada_por: "atendente", precisa_atencao: false }
          : { ia_pausada: false, pausada_em: null, pausada_por: null, motivo: null, precisa_atencao: false }
      )
      .eq("canal", canal)
      .eq("chat_id", chatId)
      .select("canal"),
    "Erro ao atualizar atendimento"
  );
}

export async function marcarAtendido(db: Db, canal: Canal, chatId: string): Promise<void> {
  exigir(
    await db.from("atendimentos").update({ precisa_atencao: false }).eq("canal", canal).eq("chat_id", chatId).select("canal"),
    "Erro ao atualizar atendimento"
  );
}
