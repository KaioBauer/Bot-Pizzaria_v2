/**
 * Biblioteca das camadas ilustradas (public/pedir/camadas, geradas por
 * scripts/camadas/gerar.mjs). Serve para:
 * - montar a fatia de cada sabor a partir da descrição ("Mussarela, bacon,
 *   milho e orégano") quando o sabor não tem imagem de camada própria;
 * - dar quantidade e tamanho de pedaço aos ingredientes cadastrados.
 */

export type TipoCamada = "pedacos" | "cobertura";

export interface Visual {
  chave: string;
  url: string;
  tipo: TipoCamada;
  /** Imagem no lugar desta depois do forno (queijo -> gratinado). */
  assadaUrl?: string;
  /** Pedaços na pizza inteira (numa fatia, proporcional). */
  quantidade: number;
  /** Tamanho do pedaço em % do diâmetro. */
  tamanho: number;
  /** 0 = coberturas embaixo, 1 = pedaços, 2 = salpicados por cima. */
  ordem: 0 | 1 | 2;
}

const BASE = "/pedir/camadas";
const url = (arquivo: string) => `${BASE}/${arquivo}.webp`;

export const CAMADAS_BASE = {
  massaCrua: url("massa-crua"),
  molho: url("molho"),
  massaAssada: url("massa-assada"),
};

function v(chave: string, tipo: TipoCamada, quantidade: number, tamanho: number, ordem: 0 | 1 | 2 = tipo === "cobertura" ? 0 : 1, assada?: string): Visual {
  return { chave, url: url(chave), tipo, quantidade, tamanho, ordem, ...(assada ? { assadaUrl: url(assada) } : {}) };
}

export const VISUAIS: Record<string, Visual> = {
  mussarela: v("mussarela", "cobertura", 1, 100, 0, "mussarela-gratinada"),
  "chocolate-preto": v("chocolate-preto", "cobertura", 1, 100),
  "chocolate-branco": v("chocolate-branco", "cobertura", 1, 100),
  "doce-de-leite": v("doce-de-leite", "cobertura", 1, 100),
  "leite-condensado": v("leite-condensado", "cobertura", 1, 100, 2),
  oregano: v("oregano", "cobertura", 1, 100, 2),
  parmesao: v("parmesao", "cobertura", 1, 100, 2),
  "coco-ralado": v("coco-ralado", "cobertura", 1, 100, 2),
  calabresa: v("calabresa", "pedacos", 11, 15),
  pepperoni: v("pepperoni", "pedacos", 13, 12),
  bacon: v("bacon", "pedacos", 10, 16),
  catupiry: v("catupiry", "pedacos", 9, 13),
  cheddar: v("cheddar", "pedacos", 9, 13),
  "cream-cheese": v("cream-cheese", "pedacos", 9, 12),
  milho: v("milho", "pedacos", 14, 9),
  ervilha: v("ervilha", "pedacos", 12, 9),
  champignon: v("champignon", "pedacos", 10, 12),
  azeitona: v("azeitona", "pedacos", 10, 8),
  cebola: v("cebola", "pedacos", 9, 13),
  tomate: v("tomate", "pedacos", 8, 15),
  "tomate-cereja": v("tomate-cereja", "pedacos", 10, 9),
  pimentao: v("pimentao", "pedacos", 9, 12),
  manjericao: v("manjericao", "pedacos", 8, 12),
  rucula: v("rucula", "pedacos", 12, 13),
  palmito: v("palmito", "pedacos", 10, 10),
  frango: v("frango", "pedacos", 12, 12),
  "carne-seca": v("carne-seca", "pedacos", 12, 12),
  atum: v("atum", "pedacos", 11, 11),
  presunto: v("presunto", "pedacos", 8, 16),
  lombo: v("lombo", "pedacos", 8, 15),
  ovo: v("ovo", "pedacos", 7, 13),
  brocolis: v("brocolis", "pedacos", 9, 12),
  gorgonzola: v("gorgonzola", "pedacos", 10, 10),
  morango: v("morango", "pedacos", 10, 11),
  banana: v("banana", "pedacos", 11, 10),
  cereja: v("cereja", "pedacos", 10, 7),
  ameixa: v("ameixa", "pedacos", 9, 8),
  damasco: v("damasco", "pedacos", 9, 9),
  confete: v("confete", "pedacos", 10, 11),
  kitkat: v("kitkat", "pedacos", 8, 14),
  goiabada: v("goiabada", "pedacos", 9, 10),
  nozes: v("nozes", "pedacos", 9, 10),
  alho: v("alho", "pedacos", 9, 10),
};

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Termos (já sem acento) -> visual. A ordem importa: o mais específico primeiro
 * ("tomate cereja" antes de "tomate", "chocolate branco" antes de "chocolate").
 */
const TERMOS: [RegExp, string][] = [
  [/mussarela|mucarela|mozzarella|muzzarela|fior di latte|queijo(?! (?:grana|parmesao|gorgonzola|brie|coalho))/, "mussarela"],
  [/calabresa/, "calabresa"],
  [/pepperoni|salame/, "pepperoni"],
  [/bacon/, "bacon"],
  [/catupiry|requeijao/, "catupiry"],
  [/cream cheese|cream-cheese|philadelphia/, "cream-cheese"],
  [/cheddar/, "cheddar"],
  [/milho/, "milho"],
  [/ervilha/, "ervilha"],
  [/champignon|cogumelo|shimeji|shitake/, "champignon"],
  [/azeitona/, "azeitona"],
  [/cebola/, "cebola"],
  [/tomate cereja|tomatinho/, "tomate-cereja"],
  [/tomate/, "tomate"],
  [/pimentao/, "pimentao"],
  [/manjericao/, "manjericao"],
  [/rucula/, "rucula"],
  [/palmito/, "palmito"],
  [/frango/, "frango"],
  [/carne seca|charque|carne/, "carne-seca"],
  [/atum/, "atum"],
  [/presunto|parma|copa/, "presunto"],
  [/lombo/, "lombo"],
  [/\bovos?\b/, "ovo"],
  [/brocolis/, "brocolis"],
  [/gorgonzola/, "gorgonzola"],
  [/parmesao|grana padano|parmigiano/, "parmesao"],
  [/oregano/, "oregano"],
  [/alho/, "alho"],
  [/chocolate branco/, "chocolate-branco"],
  [/chocolate|nutella|brigadeiro|ovomaltine/, "chocolate-preto"],
  [/doce de leite|churros|caramelo/, "doce-de-leite"],
  [/leite condensado/, "leite-condensado"],
  [/morango/, "morango"],
  [/banana/, "banana"],
  [/cereja/, "cereja"],
  [/ameixa/, "ameixa"],
  [/damasco/, "damasco"],
  [/confete|m&m|disqueti/, "confete"],
  [/kit ?kat|wafer/, "kitkat"],
  [/goiabada/, "goiabada"],
  [/nozes|castanha/, "nozes"],
  [/coco/, "coco-ralado"],
];

/** Visuais citados na descrição de um sabor, em camadas (coberturas, pedaços, salpicados). */
export function visuaisDaDescricao(descricao: string | null | undefined): Visual[] {
  if (!descricao) return [];
  // Cada item da lista é avaliado à parte: "chocolate branco e chocolate preto" vira dois.
  const partes = normalizar(descricao).split(/,|\be\b|\+|\//);
  const chaves: string[] = [];
  for (const parte of partes) {
    // O molho já é a camada base da pizza ("molho de tomate" não é rodela de tomate).
    if (/^\s*molho/.test(parte)) continue;
    for (const [termo, chave] of TERMOS) {
      if (termo.test(parte)) {
        if (!chaves.includes(chave)) chaves.push(chave);
        break;
      }
    }
  }
  return chaves.map((c) => VISUAIS[c]!).sort((a, b) => a.ordem - b.ordem);
}

/** Visual de um ingrediente cadastrado pelo nome (quantidade/tamanho dos pedaços). */
export function visualDoNome(nome: string): Visual | undefined {
  return visuaisDaDescricao(nome)[0];
}

/** Imagem que representa o sabor na bandeja: o primeiro pedaço citado (o "recheio"). */
export function miniaturaDoSabor(descricao: string | null | undefined, nome: string): string | null {
  const visuais = visuaisDaDescricao(`${nome}, ${descricao ?? ""}`);
  return (visuais.find((v) => v.tipo === "pedacos") ?? visuais.find((v) => v.chave !== "oregano"))?.url ?? null;
}
