import { paraCentavos, paraReais, type TurnoFuncionamento } from "@pizzaria/shared";
import { exigir, type Db } from "../client";

export interface ConfiguracaoAdmin {
  nomePizzaria: string;
  telefone: string | null;
  endereco: string | null;
  whatsappNumero: string | null;
  instagram: string | null;
  fusoHorario: string;
  pedidoMinimoCentavos: number;
  aceitandoPedidos: boolean;
  pixExpiracaoMinutos: number;
}

/** Pedido direto por link (/pedir). */
export interface ConfiguracaoPedidoLink {
  pedidoLinkAtivo: boolean;
  maxIngredientes: number;
}

export interface BairroAdmin {
  id?: string;
  nome: string;
  taxaCentavos: number;
  ativo: boolean;
}

export async function obterConfiguracaoAdmin(db: Db) {
  const [config, horarios, bairros] = await Promise.all([
    db.from("configuracoes").select("*").single(),
    db.from("horarios_funcionamento").select("dia_semana, abre, fecha").order("dia_semana").order("abre"),
    db.from("bairros_entrega").select("id, nome, taxa, ativo").order("nome"),
  ]);
  const c = exigir(config, "Erro ao carregar configurações");
  return {
    config: {
      nomePizzaria: c.nome_pizzaria,
      telefone: c.telefone,
      endereco: c.endereco,
      whatsappNumero: c.whatsapp_numero,
      instagram: c.instagram,
      fusoHorario: c.fuso_horario,
      pedidoMinimoCentavos: paraCentavos(c.pedido_minimo),
      aceitandoPedidos: c.aceitando_pedidos,
      pixExpiracaoMinutos: c.pix_expiracao_minutos,
    } satisfies ConfiguracaoAdmin,
    pedidoLink: {
      pedidoLinkAtivo: c.pedido_link_ativo,
      maxIngredientes: c.max_ingredientes,
    } satisfies ConfiguracaoPedidoLink,
    horarios: exigir(horarios, "Erro ao carregar horários").map(
      (h): TurnoFuncionamento => ({ diaSemana: h.dia_semana, abre: h.abre.slice(0, 5), fecha: h.fecha.slice(0, 5) })
    ),
    bairros: exigir(bairros, "Erro ao carregar bairros").map(
      (b): BairroAdmin => ({ id: b.id, nome: b.nome, taxaCentavos: paraCentavos(b.taxa), ativo: b.ativo })
    ),
  };
}

export async function salvarConfiguracao(db: Db, c: ConfiguracaoAdmin): Promise<void> {
  exigir(
    await db
      .from("configuracoes")
      .update({
        nome_pizzaria: c.nomePizzaria,
        telefone: c.telefone,
        endereco: c.endereco,
        whatsapp_numero: c.whatsappNumero,
        instagram: c.instagram,
        fuso_horario: c.fusoHorario,
        pedido_minimo: paraReais(c.pedidoMinimoCentavos),
        aceitando_pedidos: c.aceitandoPedidos,
        pix_expiracao_minutos: c.pixExpiracaoMinutos,
      })
      .eq("id", true)
      .select("id"),
    "Erro ao salvar configurações"
  );
}

export async function salvarConfiguracaoPedidoLink(db: Db, c: ConfiguracaoPedidoLink): Promise<void> {
  exigir(
    await db
      .from("configuracoes")
      .update({ pedido_link_ativo: c.pedidoLinkAtivo, max_ingredientes: c.maxIngredientes })
      .eq("id", true)
      .select("id"),
    "Erro ao salvar pedido pelo link"
  );
}

export async function definirAceitandoPedidos(db: Db, aceitando: boolean): Promise<void> {
  exigir(
    await db.from("configuracoes").update({ aceitando_pedidos: aceitando }).eq("id", true).select("id"),
    "Erro ao atualizar loja"
  );
}

/** Substitui todos os turnos (o formulário edita a semana inteira de uma vez). */
export async function salvarHorarios(db: Db, turnos: TurnoFuncionamento[]): Promise<void> {
  exigir(
    await db.from("horarios_funcionamento").delete().gte("dia_semana", 0).select("id"),
    "Erro ao atualizar horários"
  );
  if (turnos.length === 0) return;
  exigir(
    await db
      .from("horarios_funcionamento")
      .insert(turnos.map((t) => ({ dia_semana: t.diaSemana, abre: t.abre, fecha: t.fecha })))
      .select("id"),
    "Erro ao salvar horários"
  );
}

/** Sincroniza a lista de bairros: atualiza, cria e remove os que saíram. */
export async function salvarBairros(db: Db, bairros: BairroAdmin[]): Promise<void> {
  const atuais = exigir(await db.from("bairros_entrega").select("id"), "Erro ao carregar bairros").map((b) => b.id);
  const mantidos = new Set(bairros.flatMap((b) => (b.id ? [b.id] : [])));
  const removidos = atuais.filter((id) => !mantidos.has(id));
  if (removidos.length) {
    exigir(await db.from("bairros_entrega").delete().in("id", removidos).select("id"), "Erro ao remover bairros");
  }
  for (const b of bairros) {
    const linha = { nome: b.nome, taxa: paraReais(b.taxaCentavos), ativo: b.ativo };
    exigir(
      b.id && atuais.includes(b.id)
        ? await db.from("bairros_entrega").update(linha).eq("id", b.id).select("id")
        : await db.from("bairros_entrega").insert(linha).select("id"),
      "Erro ao salvar bairro"
    );
  }
}

export interface TamanhoAdmin {
  id: string;
  nome: string;
  fatias: number;
  maxSabores: number;
  precoBaseCentavos: number;
}

export async function listarTamanhos(db: Db): Promise<TamanhoAdmin[]> {
  const r = await db.from("tamanhos_pizza").select("id, nome, fatias, max_sabores, preco_base").order("ordem");
  return exigir(r, "Erro ao carregar tamanhos").map((t) => ({
    id: t.id,
    nome: t.nome,
    fatias: t.fatias,
    maxSabores: t.max_sabores,
    precoBaseCentavos: paraCentavos(t.preco_base),
  }));
}

/**
 * Atualiza fatias, sabores e preço base. Mudar o preço base reajusta, no banco
 * (trigger), o preço desse tamanho em todos os sabores — o adicional de cada um se mantém.
 */
export async function salvarTamanhos(db: Db, tamanhos: Omit<TamanhoAdmin, "nome">[]): Promise<void> {
  for (const t of tamanhos) {
    exigir(
      await db
        .from("tamanhos_pizza")
        .update({ fatias: t.fatias, max_sabores: t.maxSabores, preco_base: paraReais(t.precoBaseCentavos) })
        .eq("id", t.id)
        .select("id"),
      "Erro ao salvar tamanho"
    );
  }
}
