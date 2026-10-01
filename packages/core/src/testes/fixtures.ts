import type { BairroEntrega, ConfiguracaoLoja, VariacaoParaPreco } from "@pizzaria/shared";

/** IDs fixos e legíveis para os testes (UUIDs válidos). */
export const ID = {
  calabresa: "00000000-0000-4000-8000-000000000001",
  margherita: "00000000-0000-4000-8000-000000000002",
  coca: "00000000-0000-4000-8000-000000000003",
  calabresaMedia: "00000000-0000-4000-8000-000000000011",
  calabresaGrande: "00000000-0000-4000-8000-000000000012",
  calabresaBorda: "00000000-0000-4000-8000-000000000013",
  calabresaBordaCheddar: "00000000-0000-4000-8000-000000000014",
  margheritaMedia: "00000000-0000-4000-8000-000000000021",
  margheritaGrande: "00000000-0000-4000-8000-000000000022",
  margheritaBorda: "00000000-0000-4000-8000-000000000023",
  cocaUnica: "00000000-0000-4000-8000-000000000031",
  inexistente: "00000000-0000-4000-8000-000000000099",
  bairroCentro: "00000000-0000-4000-8000-0000000000b1",
} as const;

function variacao(
  id: string,
  produtoId: string,
  produtoNome: string,
  nome: string,
  tipo: VariacaoParaPreco["tipo"],
  precoCentavos: number,
  extra: Partial<VariacaoParaPreco> = {}
): VariacaoParaPreco {
  return { id, produtoId, produtoNome, nome, tipo, precoCentavos, ativa: true, produtoAtivo: true, ...extra };
}

export function variacoesDeTeste(sobrescrever: Record<string, Partial<VariacaoParaPreco>> = {}) {
  const lista = [
    variacao(ID.calabresaMedia, ID.calabresa, "Calabresa", "Média", "tamanho", 4500),
    variacao(ID.calabresaGrande, ID.calabresa, "Calabresa", "Grande", "tamanho", 5500),
    variacao(ID.calabresaBorda, ID.calabresa, "Calabresa", "Borda Catupiry", "borda", 800),
    variacao(ID.calabresaBordaCheddar, ID.calabresa, "Calabresa", "Borda Cheddar", "borda", 900),
    variacao(ID.margheritaMedia, ID.margherita, "Margherita", "Média", "tamanho", 4700),
    variacao(ID.margheritaGrande, ID.margherita, "Margherita", "Grande", "tamanho", 5900),
    variacao(ID.margheritaBorda, ID.margherita, "Margherita", "Borda Catupiry", "borda", 800),
    variacao(ID.cocaUnica, ID.coca, "Coca-Cola Lata", "Único", "padrao", 600),
  ].map((v) => ({ ...v, ...sobrescrever[v.id] }));
  return new Map(lista.map((v) => [v.id, v]));
}

export const BAIRROS: BairroEntrega[] = [{ id: ID.bairroCentro, nome: "Centro", taxaCentavos: 500 }];

export function configDeTeste(extra: Partial<ConfiguracaoLoja> = {}): ConfiguracaoLoja {
  return {
    nomePizzaria: "Vianna Pizzaria",
    telefone: null,
    endereco: null,
    whatsappNumero: null,
    telegramUsuario: null,
    instagram: null,
    fusoHorario: "America/Sao_Paulo",
    pedidoMinimoCentavos: 0,
    aceitandoPedidos: true,
    pixExpiracaoMinutos: 30,
    horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, abre: "18:00", fecha: "23:30" })),
    bairros: BAIRROS,
    tamanhos: [],
    ...extra,
  };
}

export const sabor = (produto_id: string, variacao_id: string) => ({ produto_id, variacao_id });
