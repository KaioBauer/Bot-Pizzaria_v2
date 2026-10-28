// Gera as camadas ilustradas da montagem visual (/pedir): massa, molho, queijo e
// ingredientes vistos de cima, em SVG com textura -> WebP transparente.
//
//   node apps/web/scripts/camadas/gerar.mjs
//
// Determinístico (sementes fixas): rodar de novo gera as mesmas imagens. As
// fotos reais da pizzaria podem substituir qualquer arquivo depois (mesmo nome)
// ou ser enviadas pelo painel (imagem de camada).

import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raizWeb = join(aqui, "..", "..");
// sharp vem com o Next (sem dependência nova); resolve pelo caminho real do pnpm.
const sharp = createRequire(realpathSync(join(raizWeb, "node_modules", "next", "package.json")))("sharp");
const destino = join(raizWeb, "public", "pedir", "camadas");
mkdirSync(destino, { recursive: true });

// Utilitários --------------------------------------------------------------------------

function rng(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => n.toFixed(1);

/** Contorno orgânico fechado (Catmull-Rom -> Bézier). */
function blob(r, cx, cy, raio, irregular = 0.08, pontos = 14, achatado = 1) {
  const pts = Array.from({ length: pontos }, (_, i) => {
    const a = (i / pontos) * Math.PI * 2;
    const k = raio * (1 + (r() - 0.5) * 2 * irregular);
    return [cx + Math.cos(a) * k, cy + Math.sin(a) * k * achatado];
  });
  return curvaFechada(pts);
}
function curvaFechada(pts) {
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + "Z";
}
/** Ponto uniforme dentro do círculo. */
function noCirculo(r, raio, cx = 0, cy = 0) {
  const a = r() * Math.PI * 2;
  const k = Math.sqrt(r()) * raio;
  return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
}

/** Textura de ruído recortada pela forma (multiplica luz/sombra). */
function filtroGrao(id, { freq = 0.9, octaves = 3, escuro = 0.25, claro = 0.15, semente = 1 } = {}) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${semente}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${escuro * 4} ${-escuro * 1.6}" result="sombra"/>
    <feComposite in="sombra" in2="SourceGraphic" operator="in" result="s"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${-claro * 4} ${claro * 2.2}" result="luz"/>
    <feComposite in="luz" in2="SourceGraphic" operator="in" result="l"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/><feMergeNode in="l"/></feMerge>
  </filter>`;
}
/**
 * Luz 3D: a altura vem do alfa borrado (cada forma vira um "domo") somado a um
 * ruído fino; luz difusa dá volume e a especular dá o brilho (gordura, molho, folha).
 */
function luz(id, { relevo = 2.4, borro = 10, grao = 1.4, brilho = 0.8, expoente = 26, ganho = 1.1, ruido = 0.18, semente = 1 } = {}) {
  return `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${borro}" result="domo"/>
    <feTurbulence type="fractalNoise" baseFrequency="${grao}" numOctaves="3" seed="${semente}" result="ru"/>
    <feColorMatrix in="ru" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.33 0.33 0.33 0 0" result="ruA"/>
    <feComposite in="domo" in2="ruA" operator="arithmetic" k2="1" k3="${ruido}" result="altura"/>
    <feDiffuseLighting in="altura" surfaceScale="${relevo}" diffuseConstant="1" lighting-color="#ffffff" result="dif"><feDistantLight azimuth="235" elevation="68"/></feDiffuseLighting>
    <feSpecularLighting in="altura" surfaceScale="${relevo}" specularConstant="${brilho}" specularExponent="${expoente}" lighting-color="#fffaf0" result="esp"><feDistantLight azimuth="235" elevation="52"/></feSpecularLighting>
    <feComposite in="SourceGraphic" in2="dif" operator="arithmetic" k1="${ganho}" result="ilum"/>
    <feComposite in="esp" in2="SourceAlpha" operator="in" result="espDentro"/>
    <feComposite in="ilum" in2="espDentro" operator="arithmetic" k2="1" k3="1" result="fim"/>
    <feComposite in="fim" in2="SourceAlpha" operator="in"/>
  </filter>`;
}

const sombraSuave = (id, desvio = 3, dy = 3, opacidade = 0.35) =>
  `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${desvio}" flood-color="#3b1d0a" flood-opacity="${opacidade}"/></filter>`;

function svg(tamanho, defs, corpo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tamanho} ${tamanho}" width="${tamanho}" height="${tamanho}"><defs>${defs}</defs>${corpo}</svg>`;
}

const gerados = [];
async function salvar(nome, conteudo, px) {
  const arquivo = join(destino, `${nome}.webp`);
  const buffer = await sharp(Buffer.from(conteudo)).resize(px, px).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toBuffer();
  writeFileSync(arquivo, buffer);
  gerados.push(`${nome}.webp (${Math.round(buffer.length / 1024)} KB)`);
}

// Base: massa, molho, queijo -------------------------------------------------------------

function massa(assada) {
  const r = rng(assada ? 77 : 7);
  const S = 1000;
  const borda = blob(r, 500, 500, 488, 0.012, 40);
  const miolo = blob(r, 500, 500, 418, 0.02, 36);
  const centro = assada ? ["#f2cf8f", "#e2a65a", "#c9843c"] : ["#f5e6c8", "#ecd7ad", "#dfc391"];
  const aro = assada ? ["#e9b56c", "#c27a35", "#8e4e1c"] : ["#f8ecd3", "#eedab2", "#d9bb87"];
  // Bolhas da borda (massa estufada) e farinha / pontos tostados.
  let bolhas = "";
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    const k = 440 + r() * 38;
    const rb = 10 + r() * 22;
    bolhas += `<ellipse cx="${f(500 + Math.cos(a) * k)}" cy="${f(500 + Math.sin(a) * k)}" rx="${f(rb * 1.6)}" ry="${f(rb * 0.8)}" transform="rotate(${f((a * 180) / Math.PI + 90)} ${f(500 + Math.cos(a) * k)} ${f(500 + Math.sin(a) * k)})" fill="${r() > 0.5 ? (assada ? "#f6cf8f" : "#fdf6e6") : assada ? "#9a5a24" : "#d8bd8c"}" opacity="${f(0.1 + r() * 0.16)}" filter="url(#suave)"/>`;
  }
  let manchas = "";
  for (let i = 0; i < (assada ? 70 : 140); i++) {
    const a = r() * Math.PI * 2;
    const k = assada ? 425 + r() * 60 : r() * 480;
    const [x, y] = [500 + Math.cos(a) * k, 500 + Math.sin(a) * k];
    manchas += assada
      ? `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(3 + r() * 8)}" ry="${f(2 + r() * 5)}" fill="#4a2208" opacity="${f(0.2 + r() * 0.35)}" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})" filter="url(#suave)"/>`
      : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.8 + r() * 2)}" fill="#ffffff" opacity="${f(0.25 + r() * 0.35)}"/>`;
  }
  const defs = `
    <radialGradient id="gm" cx="50%" cy="48%" r="52%"><stop offset="0" stop-color="${centro[0]}"/><stop offset=".75" stop-color="${centro[1]}"/><stop offset="1" stop-color="${centro[2]}"/></radialGradient>
    <radialGradient id="ga" cx="50%" cy="50%" r="50%"><stop offset=".8" stop-color="${aro[0]}"/><stop offset=".92" stop-color="${aro[1]}"/><stop offset="1" stop-color="${aro[2]}"/></radialGradient>
    <radialGradient id="luz" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="vinheta" cx="50%" cy="50%" r="50%"><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#3a1a05" stop-opacity="${assada ? 0.35 : 0.18}"/></radialGradient>
    ${filtroGrao("grao", { freq: 0.55, octaves: 4, escuro: assada ? 0.14 : 0.12, claro: 0.12, semente: assada ? 9 : 3 })}
    <filter id="suave"><feGaussianBlur stdDeviation="3"/></filter>
    <radialGradient id="volume" cx="50%" cy="50%" r="50%"><stop offset=".84" stop-color="#000" stop-opacity="0"/><stop offset=".9" stop-color="#fff" stop-opacity="${assada ? 0.18 : 0.35}"/><stop offset=".96" stop-color="#000" stop-opacity="0"/></radialGradient>
    <clipPath id="cm"><path d="${borda}"/></clipPath>
    ${luz("lmassa", { relevo: 5, borro: 26, grao: 0.6, brilho: assada ? 0.35 : 0.2, expoente: 12, ganho: 1.0, ruido: 0.25, semente: assada ? 9 : 3 })}`;
  const corpo = `
    <g filter="url(#lmassa)"><path d="${borda}" fill="url(#ga)" filter="url(#grao)"/></g>
    <g clip-path="url(#cm)">${bolhas}</g>
    <path d="${miolo}" fill="url(#gm)" filter="url(#grao)"/>
    <g clip-path="url(#cm)">${manchas}</g>
    <path d="${borda}" fill="url(#volume)"/>
    <path d="${borda}" fill="url(#vinheta)"/>
    <path d="${borda}" fill="url(#luz)"/>`;
  return svg(S, defs, corpo);
}

function molho() {
  const r = rng(21);
  const forma = blob(r, 500, 500, 405, 0.035, 30);
  // Espiral da concha: traços um pouco mais claros/escuros.
  let espiral = "";
  for (let volta = 0; volta < 2; volta++) {
    let d = "";
    for (let t = 0; t <= 1; t += 0.01) {
      const a = t * Math.PI * 9 + volta * 1.7;
      const k = 30 + t * 360 + (r() - 0.5) * 6;
      const [x, y] = [500 + Math.cos(a) * k, 500 + Math.sin(a) * k];
      d += `${t === 0 ? "M" : "L"}${f(x)},${f(y)}`;
    }
    espiral += `<path d="${d}" fill="none" stroke="${volta ? "#7d1408" : "#f26b45"}" stroke-width="${volta ? 9 : 14}" stroke-linecap="round" opacity="${volta ? 0.22 : 0.28}"/>`;
  }
  let pontos = "";
  for (let i = 0; i < 90; i++) {
    const [x, y] = noCirculo(r, 380, 500, 500);
    pontos += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + r() * 6)}" fill="${r() > 0.5 ? "#8c1a0b" : "#f47a52"}" opacity="${f(0.25 + r() * 0.3)}"/>`;
  }
  const defs = `
    <radialGradient id="gs" cx="48%" cy="46%" r="55%"><stop offset="0" stop-color="#d23a20"/><stop offset=".7" stop-color="#b82a14"/><stop offset="1" stop-color="#8c1d0b"/></radialGradient>
    <radialGradient id="brilho" cx="36%" cy="30%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>
    ${filtroGrao("gm", { freq: 1.1, octaves: 3, escuro: 0.2, claro: 0.12, semente: 5 })}
    <filter id="borrar"><feGaussianBlur stdDeviation="2.2"/></filter>
    <clipPath id="cs"><path d="${forma}"/></clipPath>
    ${luz("lm", { relevo: 1.4, borro: 22, grao: 0.35, brilho: 0.22, expoente: 45, ganho: 1.0, ruido: 0.5, semente: 3 })}`;
  const corpo = `
    <path d="${forma}" fill="#6e1206" opacity=".35" filter="url(#borrar)" transform="translate(0 6)"/>
    <g filter="url(#lm)"><path d="${forma}" fill="url(#gs)" filter="url(#gm)"/></g>
    <g clip-path="url(#cs)" filter="url(#borrar)">${espiral}${pontos}</g>
    <path d="${forma}" fill="url(#brilho)"/>`;
  return svg(1000, defs, corpo);
}

/** Queijo ralado: centenas de fios sobre o círculo do molho. */
function queijo(chave, cores, quantidade = 2600, raio = 392, assadoManchas = false) {
  const r = rng(chave.length * 131);
  let fios = "";
  for (let i = 0; i < quantidade; i++) {
    const [x, y] = noCirculo(r, raio, 500, 500);
    const comp = 14 + r() * 26;
    const larg = 3.2 + r() * 2.6;
    const ang = r() * Math.PI;
    const curva = (r() - 0.5) * comp * 0.8;
    const [dx, dy] = [Math.cos(ang) * comp / 2, Math.sin(ang) * comp / 2];
    const cor = cores[Math.floor(r() * cores.length)];
    fios += `<path d="M${f(x - dx)},${f(y - dy)} Q${f(x - dy * 0.0 + Math.cos(ang + 1.57) * curva)},${f(y + Math.sin(ang + 1.57) * curva)} ${f(x + dx)},${f(y + dy)}" stroke="${cor}" stroke-width="${f(larg)}" stroke-linecap="round" fill="none"/>`;
  }
  let manchas = "";
  if (assadoManchas) {
    for (let i = 0; i < 26; i++) {
      const [x, y] = noCirculo(r, raio - 20, 500, 500);
      manchas += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(10 + r() * 22)}" ry="${f(8 + r() * 14)}" fill="#c98a3a" opacity="${f(0.35 + r() * 0.35)}"/>`;
    }
  }
  const defs = `${sombraSuave("sq", 1.6, 1.8, 0.4)}<filter id="b"><feGaussianBlur stdDeviation="5"/></filter>${luz("lq", { relevo: 2.2, borro: 1.6, grao: 2, brilho: 0.7, expoente: 18, ganho: 1.0 })}`;
  return svg(1000, defs, `<g filter="url(#sq)">${fios}</g><g filter="url(#b)">${manchas}</g>`);
}

/** Queijo derretido e gratinado (troca do queijo ralado quando a pizza sai do forno). */
function queijoDerretido() {
  const r = rng(404);
  let poças = "";
  for (let i = 0; i < 120; i++) {
    const [x, y] = noCirculo(r, 330, 500, 500);
    poças += `<path d="${blob(r, x, y, 24 + r() * 36, 0.3, 9)}" fill="${["#fbe9b7", "#f7dd9c", "#fdf1cf"][Math.floor(r() * 3)]}"/>`;
  }
  let gratinado = "";
  for (let i = 0; i < 60; i++) {
    const [x, y] = noCirculo(r, 330, 500, 500);
    gratinado += `<path d="${blob(r, x, y, 6 + r() * 18, 0.4, 7)}" fill="${r() > 0.4 ? "#d99a45" : "#b06a24"}" opacity="${f(0.35 + r() * 0.4)}"/>`;
  }
  const defs = `<filter id="derrete"><feGaussianBlur stdDeviation="6" result="b"/><feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"/></filter>
    <filter id="g2"><feGaussianBlur stdDeviation="4"/></filter>${filtroGrao("tq", { freq: 0.9, octaves: 2, escuro: 0.08, claro: 0.1, semente: 7 })}${sombraSuave("sq", 3, 2, 0.25)}`;
  return svg(
    1000,
    `${defs}${luz("lqd", { relevo: 3.5, borro: 8, grao: 0.7, brilho: 1.0, expoente: 32, ganho: 1.0, semente: 4 })}`,
    `<g filter="url(#sq)"><g filter="url(#lqd)"><g filter="url(#derrete)">${poças}</g><g filter="url(#g2)">${gratinado}</g></g></g>`
  );
}

/** Cobertura cremosa/derretida (chocolate, doce de leite) com brilho. */
function coberturaLisa(chave, cores) {
  const r = rng(chave.length * 977);
  const forma = blob(r, 500, 500, 392, 0.06, 26);
  let gotas = "";
  for (let i = 0; i < 40; i++) {
    const [x, y] = noCirculo(r, 360, 500, 500);
    gotas += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(10 + r() * 30)}" ry="${f(6 + r() * 14)}" fill="#fff" opacity="${f(0.06 + r() * 0.1)}" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>`;
  }
  const defs = `<radialGradient id="g" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="${cores[0]}"/><stop offset=".8" stop-color="${cores[1]}"/><stop offset="1" stop-color="${cores[2]}"/></radialGradient>
    ${filtroGrao("t", { freq: 0.6, octaves: 2, escuro: 0.1, claro: 0.08, semente: 4 })}${sombraSuave("s", 4, 3, 0.3)}`;
  return svg(
    1000,
    `${defs}${luz("lc", { relevo: 3, borro: 14, grao: 0.5, brilho: 1.3, expoente: 40, ganho: 1.0, semente: 6 })}`,
    `<g filter="url(#s)"><g filter="url(#lc)"><path d="${forma}" fill="url(#g)" filter="url(#t)"/></g></g>${gotas}`
  );
}

/** Fios finos espalhados (leite condensado, orégano, parmesão ralado). */
function salpicado(chave, { quantidade, cores, tamanho: [min, max], forma = "floco", raio = 390, opacidade = 1 }) {
  const r = rng(chave.length * 353);
  let itens = "";
  for (let i = 0; i < quantidade; i++) {
    const [x, y] = noCirculo(r, raio, 500, 500);
    const t = min + r() * (max - min);
    const cor = cores[Math.floor(r() * cores.length)];
    if (forma === "fio") {
      const a = r() * Math.PI;
      const c = t * 6;
      itens += `<path d="M${f(x - Math.cos(a) * c)},${f(y - Math.sin(a) * c)} Q${f(x + (r() - 0.5) * c)},${f(y + (r() - 0.5) * c)} ${f(x + Math.cos(a) * c)},${f(y + Math.sin(a) * c)}" stroke="${cor}" stroke-width="${f(t)}" fill="none" stroke-linecap="round" opacity="${opacidade}"/>`;
    } else {
      itens += `<path d="${blob(r, x, y, t, 0.35, 6)}" fill="${cor}" opacity="${opacidade}"/>`;
    }
  }
  const defs = sombraSuave("s", 0.8, 0.8, 0.25);
  return svg(1000, defs, `<g filter="url(#s)">${itens}</g>`);
}

// Pedaços (200x200, peça centrada) ---------------------------------------------------------

const P = 200;
const peca = (defs, corpo, opcoesLuz = {}) =>
  svg(P, `${defs}${sombraSuave("sp", 3.5, 4.5, 0.6)}${luz("lp", opcoesLuz)}`, `<g filter="url(#sp)"><g filter="url(#lp)">${corpo}</g></g>`);
const brilho = (cx, cy, rx, ry, op = 0.35) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${op}" transform="rotate(-30 ${cx} ${cy})"/>`;

function rodelaEmbutido(semente, { r0 = 74, cores, borda, gordura, pontos = 34, curvado = false }) {
  const r = rng(semente);
  const forma = blob(r, 100, 100, r0, 0.04, 18);
  let specks = "";
  for (let i = 0; i < pontos; i++) {
    const [x, y] = noCirculo(r, r0 - 12, 100, 100);
    specks += `<path d="${blob(r, x, y, 2 + r() * 4.5, 0.4, 6)}" fill="${gordura}" opacity="${f(0.55 + r() * 0.4)}"/>`;
  }
  const defs = `<radialGradient id="g${semente}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${cores[0]}"/><stop offset="${curvado ? 0.7 : 0.85}" stop-color="${cores[1]}"/><stop offset="1" stop-color="${borda}"/></radialGradient>
    ${filtroGrao(`t${semente}`, { freq: 1.6, octaves: 2, escuro: 0.18, claro: 0.1, semente })}<clipPath id="c${semente}"><path d="${forma}"/></clipPath>`;
  return peca(
    defs,
    `<path d="${forma}" fill="url(#g${semente})" filter="url(#t${semente})"/><g clip-path="url(#c${semente})">${specks}</g>`,
    { relevo: curvado ? 3.2 : 2.2, borro: curvado ? 9 : 12, grao: 1.4, brilho: 0.95, expoente: 30, semente }
  );
}

function bacon() {
  const r = rng(31);
  // Fatia ondulada: faixas alternadas de carne e gordura.
  const faixas = [
    ["#9c3a24", 14],
    ["#f0cdb8", 8],
    ["#b0472d", 12],
    ["#f5d9c6", 7],
    ["#93321e", 13],
  ];
  let y = 62;
  let corpo = "";
  for (const [cor, alt] of faixas) {
    let topo = "";
    let base = "";
    for (let x = 18; x <= 182; x += 8) {
      const o = Math.sin(x / 18 + y / 30) * 7 + (r() - 0.5) * 2;
      topo += `${x === 18 ? "M" : "L"}${x},${f(y + o)}`;
      base = `L${x},${f(y + alt + o)}` + base;
    }
    corpo += `<path d="${topo}${base.replace(/^L/, "L")}Z" fill="${cor}"/>`;
    y += alt;
  }
  const defs = `${filtroGrao("tb", { freq: 1.4, octaves: 2, escuro: 0.22, claro: 0.1, semente: 31 })}`;
  return peca(defs, `<g filter="url(#tb)">${corpo}</g>${brilho(70, 80, 30, 6, 0.25)}`);
}

function bolota(semente, cores, { voltas = 3, raio = 60 } = {}) {
  // Porção cremosa em espiral (catupiry, cheddar, cream cheese).
  const r = rng(semente);
  let camadas = "";
  for (let i = 0; i < voltas; i++) {
    const k = raio * (1 - i * 0.28);
    const forma = blob(r, 100 + (r() - 0.5) * 6, 100 - i * 6, k, 0.09, 12, 0.92);
    camadas += `<path d="${forma}" fill="url(#gb${semente})" stroke="${cores[2]}" stroke-opacity=".75" stroke-width="3"/>`;
  }
  const defs = `<radialGradient id="gb${semente}" cx="42%" cy="35%" r="70%"><stop offset="0" stop-color="${cores[0]}"/><stop offset=".7" stop-color="${cores[1]}"/><stop offset="1" stop-color="${cores[2]}"/></radialGradient>`;
  return peca(defs, camadas, { relevo: 4, borro: 6, grao: 0.9, brilho: 1.1, expoente: 30, ganho: 1.02, semente });
}

function grupoGraos(semente, { n, raio, cores, forma = "grao", espalhar = 42 }) {
  const r = rng(semente);
  let itens = "";
  for (let i = 0; i < n; i++) {
    const [x, y] = noCirculo(r, espalhar, 100, 100);
    const a = r() * 180;
    const d =
      forma === "grao"
        ? `<rect x="${f(x - raio)}" y="${f(y - raio * 0.85)}" width="${f(raio * 2)}" height="${f(raio * 1.7)}" rx="${f(raio * 0.7)}" fill="url(#gg${semente})" transform="rotate(${f(a)} ${f(x)} ${f(y)})"/>`
        : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(raio * (0.9 + r() * 0.2))}" fill="url(#gg${semente})"/>`;
    itens += d + `<circle cx="${f(x - raio * 0.35)}" cy="${f(y - raio * 0.35)}" r="${f(raio * 0.28)}" fill="#fff" opacity=".55"/>`;
  }
  const defs = `<radialGradient id="gg${semente}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${cores[0]}"/><stop offset=".75" stop-color="${cores[1]}"/><stop offset="1" stop-color="${cores[2]}"/></radialGradient>`;
  return peca(defs, itens);
}

function champignonAntigo() {
  const r = rng(41);
  const chapeu = `M30,98 C30,40 170,40 170,98 C150,104 128,100 116,104 L118,160 C118,170 82,170 82,160 L84,104 C72,100 50,104 30,98Z`;
  let lamelas = "";
  for (let i = 0; i < 9; i++) {
    const x = 46 + i * 13.5;
    lamelas += `<path d="M${x},${96 + r() * 3} Q${x + 2},88 ${x + 4},${80 + r() * 6}" stroke="#b58e63" stroke-width="1.4" fill="none" opacity=".6"/>`;
  }
  const defs = `<linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5ead6"/><stop offset="1" stop-color="#dfc9a6"/></linearGradient>${filtroGrao("tc", { freq: 1.3, octaves: 2, escuro: 0.12, claro: 0.08, semente: 41 })}`;
  return peca(defs, `<path d="${chapeu}" fill="url(#gc)" stroke="#a98058" stroke-width="5" filter="url(#tc)"/>${lamelas}`);
}

function champignon() {
  const perfil = "M24,96 C24,46 70,26 100,26 C130,26 176,46 176,96 C176,104 160,106 146,104 C134,103 126,106 122,112 L124,158 C124,172 76,172 76,158 L78,112 C74,106 66,103 54,104 C40,106 24,104 24,96Z";
  const defs = `<radialGradient id="mc" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#eadcc0"/><stop offset=".8" stop-color="#dcc69f"/><stop offset="1" stop-color="#c7aa7c"/></radialGradient>`;
  return peca(
    defs,
    `<path d="${perfil}" fill="#8f6a45"/><path d="${perfil}" fill="url(#mc)" transform="translate(100 98) scale(.9) translate(-100 -98)"/>
     <path d="M44,100 C60,96 80,98 100,98 C120,98 140,96 156,100" stroke="#b89a72" stroke-width="2" fill="none" opacity=".6"/>`,
    { relevo: 2, borro: 10, grao: 1.6, brilho: 0.35, expoente: 14, ganho: 1.0 }
  );
}

function azeitona() {
  const defs = `<radialGradient id="ga" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#4b403a"/><stop offset=".7" stop-color="#211a17"/><stop offset="1" stop-color="#0f0b09"/></radialGradient>`;
  return peca(
    defs,
    `<path fill-rule="evenodd" d="M100,38 a62,54 0 1,0 0.1,0 Z M100,76 a20,18 0 1,0 0.1,0 Z" fill="url(#ga)"/>${brilho(78, 64, 18, 7, 0.5)}`
  );
}

function cebola() {
  const r = rng(51);
  let aneis = "";
  for (let i = 0; i < 2; i++) {
    const k = 62 - i * 18;
    aneis += `<path d="M${100 - k},100 A${k},${k * 0.92} 0 1,1 ${f(100 + k * Math.cos(0.5))},${f(100 + k * 0.92 * Math.sin(0.5))}" fill="none" stroke="url(#gce)" stroke-width="${11 - i * 2}" stroke-linecap="round"/>`;
    aneis += `<path d="M${100 - k + 3},100 A${k - 3},${(k - 3) * 0.92} 0 1,1 ${f(100 + (k - 3) * Math.cos(0.5))},${f(100 + (k - 3) * 0.92 * Math.sin(0.5))}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>`;
  }
  void r;
  const defs = `<linearGradient id="gce" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efdce9"/><stop offset=".6" stop-color="#d6b2cf"/><stop offset="1" stop-color="#b98cb2"/></linearGradient>`;
  return peca(defs, aneis);
}

function tomate(semente = 61, cereja = false) {
  const r = rng(semente);
  const R = cereja ? 46 : 74;
  const forma = blob(r, 100, 100, R, 0.03, 16);
  let gomos = "";
  const n = cereja ? 2 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const cx = 100 + Math.cos(a) * R * 0.45;
    const cy = 100 + Math.sin(a) * R * 0.45;
    gomos += `<path d="${blob(r, cx, cy, R * 0.28, 0.15, 8)}" fill="#f07b5f"/>`;
    for (let s = 0; s < 4; s++) {
      const [x, y] = noCirculo(r, R * 0.16, cx, cy);
      gomos += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="3.2" ry="2" fill="#f7d58a" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>`;
    }
  }
  const defs = `<radialGradient id="gt${semente}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f6a089"/><stop offset=".55" stop-color="#e2533b"/><stop offset=".9" stop-color="#cf3a24"/><stop offset="1" stop-color="#a8261a"/></radialGradient>`;
  return peca(defs, `<path d="${forma}" fill="url(#gt${semente})"/>${gomos}<circle cx="100" cy="100" r="${R * 0.14}" fill="#f9c3b3"/>${brilho(76, 68, 22, 8, 0.35)}`);
}

function pimentao() {
  const defs = `<linearGradient id="gp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6cc04a"/><stop offset=".6" stop-color="#3d8f2b"/><stop offset="1" stop-color="#2a6a1d"/></linearGradient>`;
  return peca(
    defs,
    `<path d="M44,120 C40,70 70,40 104,42 C140,44 162,72 158,110" fill="none" stroke="url(#gp)" stroke-width="16" stroke-linecap="round"/><path d="M50,116 C48,76 74,52 104,52" fill="none" stroke="#b5ea8f" stroke-width="3" stroke-linecap="round" opacity=".7"/>`
  );
}

function folha(semente, cores, { serrilhada = false, larg = 40 } = {}) {
  const r = rng(semente);
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const w = Math.sin(t * Math.PI) * larg * (serrilhada && i % 2 ? 0.7 : 1);
    pts.push([30 + t * 140, 100 - w + (r() - 0.5) * 3]);
  }
  for (let i = 9; i >= 1; i--) {
    const t = i / 10;
    const w = Math.sin(t * Math.PI) * larg * (serrilhada && i % 2 ? 0.7 : 1);
    pts.push([30 + t * 140, 100 + w + (r() - 0.5) * 3]);
  }
  let nervuras = `<path d="M30,100 Q100,96 170,100" stroke="${cores[2]}" stroke-width="2.5" fill="none" opacity=".7"/>`;
  for (let i = 1; i < 6; i++) {
    const x = 30 + i * 24;
    nervuras += `<path d="M${x},99 Q${x + 12},${86 - (i % 2) * 4} ${x + 20},80" stroke="${cores[2]}" stroke-width="1.2" fill="none" opacity=".5"/><path d="M${x},101 Q${x + 12},${114 + (i % 2) * 4} ${x + 20},120" stroke="${cores[2]}" stroke-width="1.2" fill="none" opacity=".5"/>`;
  }
  const defs = `<linearGradient id="gf${semente}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cores[0]}"/><stop offset="1" stop-color="${cores[1]}"/></linearGradient>`;
  return peca(
    `${defs}<clipPath id="cf${semente}"><path d="${curvaFechada(pts)}"/></clipPath>`,
    `<g transform="rotate(-25 100 100)"><path d="${curvaFechada(pts)}" fill="url(#gf${semente})"/><g clip-path="url(#cf${semente})">${nervuras}</g></g>`,
    { relevo: 3.2, borro: 7, grao: 1.1, brilho: 1.2, expoente: 34, semente }
  );
}

function palmito() {
  let aneis = "";
  for (let i = 0; i < 4; i++) aneis += `<circle cx="100" cy="100" r="${54 - i * 12}" fill="none" stroke="#a8955c" stroke-width="2.6" opacity=".85"/>`;
  const defs = `<radialGradient id="gpa" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#f6ecc4"/><stop offset="1" stop-color="#dccb8e"/></radialGradient>${filtroGrao("tp", { freq: 1.5, octaves: 2, escuro: 0.1, claro: 0.08, semente: 71 })}`;
  return peca(defs, `<circle cx="100" cy="100" r="62" fill="url(#gpa)" filter="url(#tp)"/>${aneis}`);
}

function desfiado(semente, cores, { n = 22, compr = [20, 46], larg = [5, 9] } = {}) {
  // Frango, carne seca, atum: fibras sobrepostas.
  const r = rng(semente);
  let fibras = "";
  for (let i = 0; i < n; i++) {
    const [x, y] = noCirculo(r, 34, 100, 100);
    const c = compr[0] + r() * (compr[1] - compr[0]);
    const w = larg[0] + r() * (larg[1] - larg[0]);
    const a = r() * 180;
    fibras += `<rect x="${f(x - c / 2)}" y="${f(y - w / 2)}" width="${f(c)}" height="${f(w)}" rx="${f(w / 2)}" fill="${cores[Math.floor(r() * cores.length)]}" transform="rotate(${f(a)} ${f(x)} ${f(y)})"/>`;
  }
  const defs = filtroGrao(`td${semente}`, { freq: 1.8, octaves: 2, escuro: 0.18, claro: 0.1, semente });
  return peca(defs, `<g filter="url(#td${semente})">${fibras}</g>`);
}

function presunto(semente, cores) {
  const r = rng(semente);
  // Fatia dobrada em leque.
  let dobras = "";
  for (let i = 0; i < 3; i++) {
    const forma = blob(r, 92 + i * 9, 96 + i * 4, 52 - i * 6, 0.12, 10, 0.7);
    dobras += `<path d="${forma}" fill="url(#gpr${semente})" stroke="${cores[2]}" stroke-width="2" stroke-opacity=".5"/>`;
  }
  const defs = `<radialGradient id="gpr${semente}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${cores[0]}"/><stop offset="1" stop-color="${cores[1]}"/></radialGradient>`;
  return peca(defs, `${dobras}${brilho(80, 80, 20, 6, 0.3)}`);
}

function ovo() {
  return peca(
    `<radialGradient id="gy" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#f0a818"/></radialGradient>`,
    `<ellipse cx="100" cy="100" rx="70" ry="54" fill="#fbf8f0" stroke="#e8e0cf" stroke-width="3"/><circle cx="104" cy="100" r="30" fill="url(#gy)"/>${brilho(80, 80, 20, 8, 0.45)}`
  );
}

function brocolis() {
  const r = rng(91);
  let floretes = `<path d="M92,170 L96,110 L108,110 L112,170Z" fill="#9ccc65"/>`;
  for (let i = 0; i < 9; i++) {
    const [x, y] = noCirculo(r, 34, 100, 80);
    floretes += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(18 + r() * 8)}" fill="url(#gbr)"/>`;
  }
  return peca(
    `<radialGradient id="gbr" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#5fae3c"/><stop offset="1" stop-color="#2b6b1f"/></radialGradient>${filtroGrao("tbr", { freq: 2, octaves: 2, escuro: 0.3, claro: 0.15, semente: 91 })}`,
    `<g filter="url(#tbr)">${floretes}</g>`
  );
}

function gorgonzola() {
  const r = rng(95);
  let pedacos = "";
  for (let i = 0; i < 4; i++) {
    const [x, y] = noCirculo(r, 32, 100, 100);
    pedacos += `<path d="${blob(r, x, y, 18 + r() * 10, 0.3, 7)}" fill="#f4efe1" stroke="#d9d2bd" stroke-width="1.5"/>`;
    for (let v = 0; v < 6; v++) {
      const [vx, vy] = noCirculo(r, 12, x, y);
      pedacos += `<circle cx="${f(vx)}" cy="${f(vy)}" r="${f(1.5 + r() * 2.5)}" fill="#4f6f86" opacity=".75"/>`;
    }
  }
  return peca("", pedacos);
}

function morango() {
  let sementes = "";
  const r = rng(101);
  for (let i = 0; i < 14; i++) {
    const [x, y] = noCirculo(r, 34, 100, 108);
    sementes += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="2" ry="3" fill="#f7e27a"/>`;
  }
  return peca(
    `<radialGradient id="gmo" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#ffb3a7"/><stop offset=".45" stop-color="#e8392f"/><stop offset="1" stop-color="#b3141d"/></radialGradient>`,
    `<path d="M100,170 C50,140 40,90 60,64 C76,44 124,44 140,64 C160,90 150,140 100,170Z" fill="url(#gmo)"/>${sementes}<path d="M70,60 Q100,40 130,60 Q100,54 70,60Z" fill="#3f8f2b"/>${brilho(80, 84, 14, 6, 0.4)}`
  );
}

function rodela(semente, cores, { r0 = 58, miolo = null, aneis = 0 } = {}) {
  const r = rng(semente);
  const forma = blob(r, 100, 100, r0, 0.04, 14);
  let extra = miolo ? `<circle cx="100" cy="100" r="${r0 * 0.3}" fill="${miolo}" opacity=".8"/>` : "";
  for (let i = 1; i <= aneis; i++) extra += `<circle cx="100" cy="100" r="${f(r0 * (1 - i / (aneis + 1)))}" fill="none" stroke="${cores[2]}" stroke-width="1.5" opacity=".5"/>`;
  return peca(
    `<radialGradient id="gr${semente}" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="${cores[0]}"/><stop offset="1" stop-color="${cores[1]}"/></radialGradient>`,
    `<path d="${forma}" fill="url(#gr${semente})" stroke="${cores[2]}" stroke-width="3"/>${extra}${brilho(80, 76, 16, 6, 0.35)}`
  );
}

function confete() {
  const r = rng(111);
  const cores = ["#e53935", "#fdd835", "#43a047", "#1e88e5", "#fb8c00", "#8e24aa"];
  let c = "";
  for (let i = 0; i < 6; i++) {
    const [x, y] = noCirculo(r, 40, 100, 100);
    c += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="15" ry="13" fill="${cores[i]}"/><ellipse cx="${f(x - 4)}" cy="${f(y - 4)}" rx="5" ry="3" fill="#fff" opacity=".6"/>`;
  }
  return peca("", c);
}

function barras(semente, cores) {
  // Kit Kat: barras de chocolate com frisos.
  const r = rng(semente);
  let b = "";
  for (let i = 0; i < 2; i++) {
    const y = 70 + i * 34 + (r() - 0.5) * 6;
    b += `<rect x="40" y="${f(y)}" width="120" height="28" rx="5" fill="${cores[0]}" stroke="${cores[1]}" stroke-width="3"/><line x1="100" y1="${f(y)}" x2="100" y2="${f(y + 28)}" stroke="${cores[1]}" stroke-width="3"/>`;
  }
  return peca("", `<g transform="rotate(-18 100 100)">${b}</g>`);
}

function cubos(semente, cores) {
  const r = rng(semente);
  let c = "";
  for (let i = 0; i < 4; i++) {
    const [x, y] = noCirculo(r, 34, 100, 100);
    c += `<rect x="${f(x - 16)}" y="${f(y - 16)}" width="32" height="32" rx="6" fill="${cores[0]}" stroke="${cores[1]}" stroke-width="2" transform="rotate(${f(r() * 90)} ${f(x)} ${f(y)})"/>`;
  }
  return peca("", c);
}

function nozes() {
  const r = rng(121);
  let n = "";
  for (let i = 0; i < 3; i++) {
    const [x, y] = noCirculo(r, 30, 100, 100);
    n += `<path d="${blob(r, x, y, 24, 0.25, 10)}" fill="#a86b32" stroke="#6d3f17" stroke-width="2"/><path d="M${f(x - 14)},${f(y)} Q${f(x)},${f(y - 10)} ${f(x + 14)},${f(y)} M${f(x - 10)},${f(y + 8)} Q${f(x)},${f(y)} ${f(x + 10)},${f(y + 8)}" stroke="#6d3f17" stroke-width="2" fill="none"/>`;
  }
  return peca("", n);
}

function alho() {
  const r = rng(131);
  let a = "";
  for (let i = 0; i < 5; i++) {
    const [x, y] = noCirculo(r, 38, 100, 100);
    a += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="14" ry="10" fill="#f0c56a" stroke="#c98a2e" stroke-width="2" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>`;
  }
  return peca("", a);
}

// Cenário: pá, forno, caixa ------------------------------------------------------------

/** Veios de madeira: ruído esticado na horizontal, tingido nas cores dadas. */
function filtroMadeira(id, [claro, escuro], semente) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="4" seed="${semente}" result="n"/>
    <feColorMatrix in="n" type="luminanceToAlpha" result="a"/>
    <feFlood flood-color="${escuro}" result="e"/>
    <feComposite in="e" in2="a" operator="in" result="veio"/>
    <feFlood flood-color="${claro}" result="base"/>
    <feMerge result="m"><feMergeNode in="base"/><feMergeNode in="veio"/></feMerge>
    <feComposite in="m" in2="SourceGraphic" operator="in"/>
  </filter>`;
}

function pa() {
  // Pá de pizzaiolo vista de cima: lâmina redonda + cabo (ocupa 1000 x 1500).
  const defs = `${filtroMadeira("mp", ["#d9a86b", "#9c6a35"], 13)}
    <linearGradient id="luzp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity=".15"/></linearGradient>
    <filter id="sp" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#2a1607" flood-opacity=".4"/></filter>`;
  const forma = `M500,20 C780,20 980,220 980,500 C980,760 800,940 590,975 L575,1480 L425,1480 L410,975 C200,940 20,760 20,500 C20,220 220,20 500,20Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1500" width="1000" height="1500"><defs>${defs}</defs>
    <g filter="url(#sp)"><path d="${forma}" fill="#c8945a"/></g>
    <path d="${forma}" fill="#c8945a" filter="url(#mp)"/>
    <path d="${forma}" fill="url(#luzp)"/>
    <path d="${forma}" fill="none" stroke="#7a4f22" stroke-opacity=".45" stroke-width="6"/></svg>`;
}

function forno() {
  // Boca do forno a lenha de frente: tijolos em arco e o interior escuro (as chamas são animadas no app).
  const r = rng(601);
  let tijolos = "";
  for (let i = 0; i < 26; i++) {
    const a0 = Math.PI + (i / 26) * Math.PI;
    const a1 = Math.PI + ((i + 1) / 26) * Math.PI;
    const p = (a, k) => [500 + Math.cos(a) * k, 640 + Math.sin(a) * k];
    const [[x1, y1], [x2, y2], [x3, y3], [x4, y4]] = [p(a0, 360), p(a1, 360), p(a1, 470), p(a0, 470)];
    const cor = ["#b5502c", "#a4462a", "#c25d35", "#9a3f22"][Math.floor(r() * 4)];
    tijolos += `<path d="M${f(x1)},${f(y1)} L${f(x2)},${f(y2)} L${f(x3)},${f(y3)} L${f(x4)},${f(y4)}Z" fill="${cor}" stroke="#e8d6bd" stroke-width="7"/>`;
  }
  let parede = "";
  for (let y = 0; y < 1000; y += 60) {
    for (let x = (y / 60) % 2 ? -60 : 0; x < 1000; x += 120) {
      parede += `<rect x="${x + 3}" y="${y + 3}" width="114" height="54" rx="4" fill="${["#c9a27d", "#bf9671", "#d1ab86"][Math.floor(r() * 3)]}"/>`;
    }
  }
  const defs = `<radialGradient id="boca" cx="50%" cy="85%" r="70%"><stop offset="0" stop-color="#ff9d3c"/><stop offset=".35" stop-color="#9a3410"/><stop offset=".8" stop-color="#2a0e05"/><stop offset="1" stop-color="#120502"/></radialGradient>
    ${filtroGrao("tf", { freq: 0.8, octaves: 3, escuro: 0.2, claro: 0.08, semente: 8 })}
    <radialGradient id="vf" cx="50%" cy="60%" r="65%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <clipPath id="cf"><rect width="1000" height="1000" rx="120"/></clipPath>`;
  const corpo = `<g clip-path="url(#cf)"><rect width="1000" height="1000" fill="#e8d6bd"/><g filter="url(#tf)">${parede}</g>
    <path d="M140,640 A360,360 0 0,1 860,640 L860,1000 L140,1000Z" fill="url(#boca)"/>
    <g filter="url(#tf)">${tijolos}</g>
    <rect x="100" y="900" width="800" height="100" fill="#8f6a4a"/><rect x="100" y="900" width="800" height="14" fill="#b38b66"/>
    <rect width="1000" height="1000" fill="url(#vf)"/></g>`;
  return svg(1000, defs, corpo);
}

function caixa(tampa) {
  // Caixa de pizza de papelão (kraft) vista de cima; a tampa tem o selo da pizzaria.
  const defs = `${filtroGrao("kr", { freq: 1.2, octaves: 3, escuro: 0.12, claro: 0.08, semente: tampa ? 21 : 22 })}
    <linearGradient id="lk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <filter id="sc" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#2a1607" flood-opacity=".35"/></filter>`;
  const selo = `<circle cx="500" cy="500" r="190" fill="none" stroke="#c9351a" stroke-width="22"/>
    <circle cx="500" cy="500" r="150" fill="#c9351a"/>
    <path d="M500,395 L590,560 Q500,600 410,560Z" fill="#f6c768" stroke="#fff3d6" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="480" cy="500" r="16" fill="#c9351a"/><circle cx="530" cy="530" r="13" fill="#c9351a"/><circle cx="495" cy="555" r="11" fill="#c9351a"/>
    <path d="M220,820 L780,820" stroke="#c9351a" stroke-width="14" stroke-linecap="round" opacity=".8"/>`;
  const corpo = tampa
    ? `<g filter="url(#sc)"><rect x="20" y="20" width="960" height="960" rx="26" fill="#c99a62"/></g>
       <rect x="20" y="20" width="960" height="960" rx="26" fill="#c99a62" filter="url(#kr)"/>
       <rect x="20" y="20" width="960" height="960" rx="26" fill="url(#lk)"/>
       <rect x="60" y="60" width="880" height="880" rx="16" fill="none" stroke="#a87b45" stroke-width="5" stroke-dasharray="14 10"/>${selo}`
    : `<g filter="url(#sc)"><rect x="20" y="20" width="960" height="960" rx="26" fill="#b88a55"/></g>
       <rect x="20" y="20" width="960" height="960" rx="26" fill="#b88a55" filter="url(#kr)"/>
       <rect x="70" y="70" width="860" height="860" rx="12" fill="#d8b98d" filter="url(#kr)"/>
       <rect x="70" y="70" width="860" height="860" rx="12" fill="none" stroke="#9a6f3d" stroke-width="10"/>`;
  return svg(1000, defs, corpo);
}

// Catálogo --------------------------------------------------------------------------------

const itens = {
  // Cenário.
  forno: [forno(), 720],
  "caixa-base": [caixa(false), 720],
  "caixa-tampa": [caixa(true), 720],
  // Bases (1000 px).
  "massa-crua": [massa(false), 768],
  "massa-assada": [massa(true), 768],
  molho: [molho(), 768],
  // Coberturas (pizza inteira).
  mussarela: [queijo("mussarela", ["#f6ecca", "#efe0b4", "#faf2da", "#e9d7a4"]), 768],
  "mussarela-extra": [queijo("mussarela-extra", ["#f8eecf", "#f1e3b8", "#fcf5e0", "#ead9a8"], 1900, 380), 768],
  "mussarela-gratinada": [queijoDerretido(), 768],
  "chocolate-preto": [coberturaLisa("chocolate-preto", ["#6b3a1f", "#4a2512", "#2f170a"]), 768],
  "chocolate-branco": [coberturaLisa("chocolate-branco", ["#fffaf0", "#f4ead2", "#e3d3ae"]), 768],
  "doce-de-leite": [coberturaLisa("doce-de-leite", ["#d99a4e", "#b8732c", "#8f5418"]), 768],
  "leite-condensado": [salpicado("leite-condensado", { quantidade: 70, cores: ["#fffdf6"], tamanho: [5, 9], forma: "fio", opacidade: 0.9 }), 768],
  oregano: [salpicado("oregano", { quantidade: 420, cores: ["#55702c", "#3f5a1e", "#6b8a3a"], tamanho: [2.5, 5] }), 768],
  parmesao: [salpicado("parmesao", { quantidade: 340, cores: ["#eed48c", "#e2c06c", "#f3e0a6"], tamanho: [3, 7] }), 768],
  "coco-ralado": [salpicado("coco", { quantidade: 380, cores: ["#ffffff", "#f6f2ea"], tamanho: [2, 5], forma: "fio" }), 768],
  // Pedaços (256 px).
  calabresa: [rodelaEmbutido(11, { cores: ["#a33a2e", "#86271d"], borda: "#3f1008", gordura: "#d99a8a", pontos: 46 }), 256],
  pepperoni: [rodelaEmbutido(13, { r0: 66, cores: ["#b8301f", "#8f2014"], borda: "#3d0b05", gordura: "#e0806a", pontos: 22, curvado: true }), 256],
  bacon: [bacon(), 256],
  catupiry: [bolota(21, ["#ffffff", "#f3ebdd", "#b9a687"]), 256],
  cheddar: [bolota(23, ["#ffc552", "#f39a1e", "#c7700c"]), 256],
  "cream-cheese": [bolota(25, ["#ffffff", "#eef0f2", "#9aa3ad"], { voltas: 2, raio: 54 }), 256],
  milho: [grupoGraos(31, { n: 6, raio: 13, cores: ["#ffe27a", "#f6c22e", "#d99a12"] }), 256],
  ervilha: [grupoGraos(33, { n: 5, raio: 15, cores: ["#9be07a", "#5fae3c", "#3c7f24"], forma: "bola" }), 256],
  champignon: [champignon(), 256],
  azeitona: [azeitona(), 256],
  cebola: [cebola(), 256],
  tomate: [tomate(61), 256],
  "tomate-cereja": [tomate(63, true), 256],
  pimentao: [pimentao(), 256],
  manjericao: [folha(81, ["#4fa93a", "#205e19", "#9fd17a"]), 256],
  rucula: [folha(83, ["#6bab3f", "#3a6f22", "#b9de95"], { serrilhada: true, larg: 30 }), 256],
  palmito: [palmito(), 256],
  frango: [desfiado(85, ["#c98d45", "#b8783a", "#dca463"]), 256],
  "carne-seca": [desfiado(87, ["#7a3e22", "#5e2c16", "#8f4e2c"], { n: 26, compr: [16, 40], larg: [4, 7] }), 256],
  atum: [desfiado(89, ["#d9a98b", "#c99376", "#e6bea4"], { n: 16, compr: [14, 30], larg: [8, 13] }), 256],
  presunto: [presunto(93, ["#f6b3b0", "#e88d8a", "#c96e6b"]), 256],
  lombo: [presunto(94, ["#f2c1ad", "#dd9c85", "#b9775f"]), 256],
  ovo: [ovo(), 256],
  brocolis: [brocolis(), 256],
  gorgonzola: [gorgonzola(), 256],
  morango: [morango(), 256],
  banana: [rodela(103, ["#fff6c8", "#f5e08f", "#d8b860"], { miolo: "#cdb36a", aneis: 1 }), 256],
  cereja: [rodela(105, ["#ff5a5f", "#b3001b", "#7a0012"], { r0: 34 }), 256],
  ameixa: [rodela(107, ["#7b3b6a", "#4a1d3f", "#2c0f25"], { r0: 40 }), 256],
  damasco: [rodela(109, ["#ffc27a", "#f08a2a", "#c56a12"], { r0: 44 }), 256],
  confete: [confete(), 256],
  kitkat: [barras(115, ["#7a3f1f", "#5a2c14"]), 256],
  goiabada: [cubos(117, ["#c2272d", "#8e1b20"]), 256],
  nozes: [nozes(), 256],
  alho: [alho(), 256],
};

for (const [nome, [conteudo, px]] of Object.entries(itens)) await salvar(nome, conteudo, px);
// A pá não é quadrada (lâmina + cabo).
{
  const buffer = await sharp(Buffer.from(pa())).resize(600, 900).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toBuffer();
  writeFileSync(join(destino, "pa.webp"), buffer);
  gerados.push(`pa.webp (${Math.round(buffer.length / 1024)} KB)`);
}
console.log(`${gerados.length} camadas em ${destino}:\n  ${gerados.join("\n  ")}`);
