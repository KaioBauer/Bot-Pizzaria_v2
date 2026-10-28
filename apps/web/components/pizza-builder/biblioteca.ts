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
  /** -2 molho, -1 queijo da base, 0 = coberturas, 1 = pedaços, 2 = salpicados por cima. */
  ordem: -2 | -1 | 0 | 1 | 2;
}

const BASE = "/pedir/camadas";
const url = (arquivo: string) => `${BASE}/${arquivo}.webp`;

export const CAMADAS_BASE = {
  massaCrua: url("massa-crua"),
  molho: url("molho"),
  massaAssada: url("massa-assada"),
};

function v(chave: string, tipo: TipoCamada, quantidade: number, tamanho: number, ordem: Visual["ordem"] = tipo === "cobertura" ? 0 : 1, assada?: string): Visual {
  return { chave, url: url(chave), tipo, quantidade, tamanho, ordem, ...(assada ? { assadaUrl: url(assada) } : {}) };
}

export const VISUAIS: Record<string, Visual> = {
  mussarela: v("mussarela", "cobertura", 1, 100, 0, "mussarela-gratinada"),
  "mussarela-extra": v("mussarela-extra", "cobertura", 1, 100, 0, "mussarela-gratinada"),
  "chocolate-preto": v("chocolate-preto", "cobertura", 1, 100),
  "chocolate-branco": v("chocolate-branco", "cobertura", 1, 100),
  "doce-de-leite": v("doce-de-leite", "cobertura", 1, 100),
  "leite-condensado": v("leite-condensado", "cobertura", 1, 100, 2),
  oregano: v("oregano", "cobertura", 1, 100, 2),
  parmesao: v("parmesao", "cobertura", 1, 100, 2),
  "coco-ralado": v("coco-ralado", "cobertura", 1, 100, 2),
  calabresa: v("calabresa", "pedacos", 11, 18),
  pepperoni: v("pepperoni", "pedacos", 13, 15),
  bacon: v("bacon", "pedacos", 10, 20),
  catupiry: v("catupiry", "pedacos", 9, 17),
  cheddar: v("cheddar", "pedacos", 9, 17),
  "cream-cheese": v("cream-cheese", "pedacos", 9, 16),
  milho: v("milho", "pedacos", 16, 14),
  ervilha: v("ervilha", "pedacos", 16, 13),
  champignon: v("champignon", "pedacos", 10, 17),
  azeitona: v("azeitona", "pedacos", 12, 12),
  cebola: v("cebola", "pedacos", 9, 18),
  tomate: v("tomate", "pedacos", 8, 19),
  "tomate-cereja": v("tomate-cereja", "pedacos", 10, 13),
  pimentao: v("pimentao", "pedacos", 9, 17),
  manjericao: v("manjericao", "pedacos", 8, 17),
  rucula: v("rucula", "pedacos", 12, 17),
  palmito: v("palmito", "pedacos", 10, 14),
  frango: v("frango", "pedacos", 12, 17),
  "carne-seca": v("carne-seca", "pedacos", 12, 16),
  atum: v("atum", "pedacos", 11, 15),
  presunto: v("presunto", "pedacos", 8, 20),
  lombo: v("lombo", "pedacos", 8, 19),
  ovo: v("ovo", "pedacos", 7, 17),
  brocolis: v("brocolis", "pedacos", 9, 16),
  gorgonzola: v("gorgonzola", "pedacos", 10, 14),
  morango: v("morango", "pedacos", 10, 15),
  banana: v("banana", "pedacos", 11, 14),
  cereja: v("cereja", "pedacos", 10, 11),
  ameixa: v("ameixa", "pedacos", 9, 12),
  damasco: v("damasco", "pedacos", 9, 13),
  confete: v("confete", "pedacos", 10, 15),
  kitkat: v("kitkat", "pedacos", 8, 18),
  goiabada: v("goiabada", "pedacos", 9, 14),
  nozes: v("nozes", "pedacos", 9, 14),
  alho: v("alho", "pedacos", 9, 14),
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
  [/(mussarela|mucarela|queijo).*extra|extra.*(mussarela|mucarela|queijo)/, "mussarela-extra"],
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

/**
 * Base da pizza. Salgada: massa + molho + muçarela, sempre (a muçarela da
 * descrição não é desenhada de novo). Doce: só a massa, a cobertura doce vai por cima.
 */
export type BaseSabor = "salgada" | "doce";

export const BASE_SALGADA: Visual[] = [
  { chave: "base-molho", url: CAMADAS_BASE.molho, tipo: "cobertura", quantidade: 1, tamanho: 100, ordem: -2 },
  { ...VISUAIS.mussarela!, chave: "base-queijo", ordem: -1 },
];

/** Sabor doce pela categoria do cardápio ("Doces", "Pizzas doces"...). */
export function ehDoce(categoria: string): boolean {
  return /doce/.test(normalizar(categoria));
}

/** Camadas do sabor sem a muçarela, que já vem na base das salgadas (e não vai nas doces). */
export function visuaisDoSabor(descricao: string | null | undefined, nome: string): Visual[] {
  return visuaisDaDescricao(`${descricao ?? ""}, ${nome}`).filter((v) => v.chave !== "mussarela");
}

/** Cores do recheio da borda (cordão aplicado com bico), pelo nome: "Borda Cheddar" -> laranja. */
export interface CoresBorda {
  base: string;
  sombra: string;
  brilho: string;
}

export function coresDaBorda(nome: string): CoresBorda {
  const n = normalizar(nome);
  if (/chocolate|nutella|brigadeiro/.test(n)) return { base: "#5e3016", sombra: "#2a1206", brilho: "#9a6038" };
  if (/cheddar/.test(n)) return { base: "#f4a12a", sombra: "#b8680c", brilho: "#ffd683" };
  if (/cream cheese|philadelphia/.test(n)) return { base: "#fbfbf7", sombra: "#b9bec6", brilho: "#ffffff" };
  return { base: "#f8f1e1", sombra: "#c4b28f", brilho: "#ffffff" };
}
