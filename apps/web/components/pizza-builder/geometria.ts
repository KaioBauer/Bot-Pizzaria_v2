/**
 * Funções puras da montagem visual: posições "aleatórias" com semente (o mesmo
 * ingrediente cai sempre nos mesmos lugares, sem pular a cada render) e o
 * recorte (clip-path) de cada fatia.
 */

/** Hash FNV-1a de 32 bits. */
export function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Gerador mulberry32: números em [0, 1) determinísticos pela semente. */
export function aleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Setor em graus: 0 = topo, sentido horário. */
export interface Setor {
  inicio: number;
  fim: number;
}

export interface Pedaco {
  /** Centro do pedaço em % da pizza (0–100). */
  x: number;
  y: number;
  rotacao: number;
  escala: number;
  /** Atraso da queda em segundos (cascata). */
  atraso: number;
}

/** Setor da fatia `indice` de `total` (total 1 = pizza inteira). */
export function setorDaFatia(indice: number, total: number): Setor {
  const passo = 360 / Math.max(1, total);
  return { inicio: indice * passo, fim: (indice + 1) * passo };
}

function ponto(anguloGraus: number, raio: number): { x: number; y: number } {
  const rad = ((anguloGraus - 90) * Math.PI) / 180;
  return { x: 50 + raio * Math.cos(rad), y: 50 + raio * Math.sin(rad) };
}

/**
 * Pedaços espalhados dentro do setor (ou da pizza toda), sem encostar na
 * borda. Usa amostragem com distância mínima para não empilhar pedaços.
 */
const arred = (n: number) => Math.round(n * 100) / 100;

export function espalhar(semente: string, quantidade: number, setor: Setor = { inicio: 0, fim: 360 }, raioMaximo = 38): Pedaco[] {
  const rand = aleatorio(hash(semente));
  const pedacos: Pedaco[] = [];
  const minimo = (raioMaximo * 1.6) / Math.sqrt(quantidade * (360 / (setor.fim - setor.inicio)));
  for (let tentativa = 0; pedacos.length < quantidade && tentativa < quantidade * 30; tentativa++) {
    // sqrt: distribuição uniforme na área (não concentra no centro).
    const raio = Math.sqrt(rand()) * raioMaximo;
    const margem = setor.fim - setor.inicio < 360 ? 6 : 0;
    const angulo = setor.inicio + margem + rand() * (setor.fim - setor.inicio - 2 * margem);
    const { x, y } = ponto(angulo, raio);
    const rotacao = rand() * 360;
    const escala = 0.8 + rand() * 0.4;
    if (pedacos.some((p) => Math.hypot(p.x - x, p.y - y) < minimo) && tentativa < quantidade * 25) continue;
    // Arredondado: servidor e navegador serializam floats longos de jeitos diferentes (erro de hidratação).
    pedacos.push({ x: arred(x), y: arred(y), rotacao: arred(rotacao), escala: arred(escala), atraso: arred(pedacos.length * 0.045) });
  }
  return pedacos;
}

/** clip-path em polígono para o setor (pizza inteira = sem recorte). */
export function recorteDoSetor(setor: Setor): string | undefined {
  if (setor.fim - setor.inicio >= 360) return undefined;
  const pontos = [{ x: 50, y: 50 }];
  const passos = Math.max(2, Math.ceil((setor.fim - setor.inicio) / 10));
  for (let i = 0; i <= passos; i++) {
    // Raio 72 (>50·√2) cobre os cantos do quadrado: a pizza já é redonda.
    pontos.push(ponto(setor.inicio + ((setor.fim - setor.inicio) * i) / passos, 72));
  }
  return `polygon(${pontos.map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`).join(", ")})`;
}

/** Linhas que dividem a pizza em `total` fatias (pontas na borda). */
export function divisorias(total: number): { x: number; y: number }[] {
  if (total <= 1) return [];
  return Array.from({ length: total }, (_, i) => ponto(setorDaFatia(i, total).inicio, 49));
}

/** Cor estável por nome (fallback sem imagem). */
export function corDoNome(nome: string): string {
  const h = hash(nome) % 360;
  return `hsl(${h} 55% 48%)`;
}

/** Escala da pizza por tamanho: o menor fica em 74%, o maior em 100%. */
export function escalaDoTamanho(indice: number, total: number): number {
  if (total <= 1) return 1;
  return 0.74 + (0.26 * indice) / (total - 1);
}
