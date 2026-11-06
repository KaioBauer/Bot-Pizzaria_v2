"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useState } from "react";
import { BASE_SALGADA, CAMADAS_BASE, coresDaBorda, type BaseSabor, type CoresBorda, type TipoCamada } from "./biblioteca";
import { corDoNome, divisorias, espalhar, recorteDoSetor, setorDaFatia, type Setor } from "./geometria";

/**
 * Pizza vista de cima, montada em camadas: massa → molho → coberturas (queijo,
 * chocolate) → pedaços (calabresa, milho...) → salpicados (orégano) → borda.
 * Só anima transform/opacity (60fps no celular). Componente de apresentação:
 * o que está na pizza vem de fora.
 */

export interface CamadaVisual {
  /** Identidade estável dentro da camada (semente das posições). */
  chave: string;
  /** null = sem imagem: pedaços ilustrados na cor do nome. */
  url: string | null;
  /** Troca depois do forno (queijo ralado -> gratinado). */
  assadaUrl?: string | undefined;
  tipo: TipoCamada;
  /** Pedaços na pizza inteira (numa fatia, proporcional). */
  quantidade: number;
  /** Tamanho do pedaço em % do diâmetro. */
  tamanho: number;
  /** 0 coberturas, 1 pedaços, 2 salpicados. */
  ordem: number;
}

export interface Camada {
  chave: string;
  nome: string;
  visuais: CamadaVisual[];
}

export interface BasePizza {
  massaCrua: string;
  molho: string;
  massaAssada: string;
}

export const BASE_PADRAO: BasePizza = CAMADAS_BASE;

interface Item {
  chave: string;
  nome: string;
  visual: CamadaVisual;
  setor: Setor;
}

/** Fiapos que caem enquanto a cobertura aparece (queijo sendo ralado por cima). */
function Chuva({ semente, setor, cor }: { semente: string; setor: Setor; cor: string }) {
  const fiapos = useMemo(() => espalhar(`${semente}:chuva`, 16, setor, 36), [semente, setor]);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {fiapos.map((p, i) => (
        <motion.span
          key={i}
          className="absolute block h-[1.1%] w-[4.5%] rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: cor, rotate: p.rotacao }}
          initial={{ y: "-2600%", opacity: 0 }}
          animate={{ y: ["-2600%", "0%"], opacity: [0, 1, 0] }}
          transition={{ duration: 0.55, delay: p.atraso * 1.4, ease: "easeIn", times: [0, 0.85, 1] }}
        />
      ))}
    </div>
  );
}

const COR_DA_CHUVA: Record<string, string> = {
  mussarela: "#fbf3d6",
  "mussarela-extra": "#fbf3d6",
  "base-queijo": "#fbf3d6",
  parmesao: "#f6ebc8",
  "coco-ralado": "#ffffff",
  oregano: "#4f6a28",
  "chocolate-preto": "#5b2e14",
  "chocolate-branco": "#fbf4e2",
  "doce-de-leite": "#c98a3e",
  "leite-condensado": "#fffdf6",
};

function Cobertura({ item, assada, reduzido, semEntrada }: { item: Item; assada: boolean; reduzido: boolean; semEntrada: boolean }) {
  const recorte = recorteDoSetor(item.setor);
  const { visual } = item;
  const animar = !reduzido && !semEntrada;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      style={{ clipPath: recorte, WebkitClipPath: recorte }}
      initial={semEntrada ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      transition={{ duration: reduzido ? 0.15 : 0.2 }}
    >
      {animar && COR_DA_CHUVA[visual.chave] && <Chuva semente={item.chave} setor={item.setor} cor={COR_DA_CHUVA[visual.chave]!} />}
      <motion.div
        className="absolute inset-0"
        // Aparece do centro para fora, como se fosse espalhado por cima.
        style={{
          maskImage: "radial-gradient(circle, #000 var(--raio), transparent calc(var(--raio) + 9%))",
          WebkitMaskImage: "radial-gradient(circle, #000 var(--raio), transparent calc(var(--raio) + 9%))",
        }}
        initial={animar ? { "--raio": "0%" } : false}
        animate={{ "--raio": "75%" }}
        transition={{ duration: 0.75, ease: [0.25, 0.8, 0.3, 1], delay: 0.12 }}
      >
      {visual.url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visual.url} alt="" draggable={false} className="absolute inset-0 size-full transition-opacity duration-700" style={{ opacity: assada && visual.assadaUrl ? 0 : 1 }} />
          {visual.assadaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={visual.assadaUrl} alt="" draggable={false} className="absolute inset-0 size-full transition-opacity duration-700" style={{ opacity: assada ? 1 : 0 }} />
          )}
        </>
      ) : (
        <div className="absolute inset-[10%] rounded-full opacity-80" style={{ background: corDoNome(item.nome) }} />
      )}
      </motion.div>
    </motion.div>
  );
}

/** Nuvenzinha de farinha no ponto onde o pedaço bate na pizza. */
function Farinha({ atraso }: { atraso: number }) {
  return (
    <>
      {[0, 72, 144, 216, 288].map((angulo) => (
        <motion.span
          key={angulo}
          className="absolute top-1/2 left-1/2 block size-[14%] rounded-full bg-[#fffaf0]"
          initial={{ opacity: 0, x: "-50%", y: "-50%", scale: 0.4 }}
          animate={{
            opacity: [0, 0.9, 0],
            x: ["-50%", `${-50 + Math.cos((angulo * Math.PI) / 180) * 420}%`],
            y: ["-50%", `${-50 + Math.sin((angulo * Math.PI) / 180) * 420}%`],
            scale: [0.4, 1, 0.6],
          }}
          transition={{ duration: 0.45, delay: atraso, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

function Pedacos({ item, reduzido, semEntrada }: { item: Item; reduzido: boolean; semEntrada: boolean }) {
  const { visual, setor } = item;
  const fracao = (setor.fim - setor.inicio) / 360;
  const quantidade = Math.max(2, Math.round(visual.quantidade * fracao));
  const pedacos = useMemo(() => espalhar(item.chave, quantidade, setor, 37), [item.chave, quantidade, setor]);
  const animar = !reduzido && !semEntrada;
  const QUEDA = 0.62;
  // Momento em que o pedaço toca a pizza (fração da animação).
  const IMPACTO = 0.55;
  // Sombra e farinha só existem durante a queda: invisíveis e montadas, pesavam na rolagem.
  const [caindo, setCaindo] = useState(animar);
  useEffect(() => {
    if (!caindo) return;
    const ultimo = Math.max(0, ...pedacos.map((p) => p.atraso));
    const id = setTimeout(() => setCaindo(false), (ultimo + QUEDA + 0.6) * 1000);
    return () => clearTimeout(id);
  }, [caindo, pedacos]);
  return (
    <div className="pointer-events-none absolute inset-0">
      {pedacos.map((p, i) => {
        // Escorregadinha depois do impacto, sempre a mesma para o pedaço.
        const deslize = ((p.rotacao % 20) - 10) * 0.6;
        return (
          <div
            key={i}
            className="absolute"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${(visual.tamanho * p.escala).toFixed(2)}%`, height: `${(visual.tamanho * p.escala).toFixed(2)}%`, transform: "translate(-50%, -50%)" }}
          >
            {animar && caindo && (
              <>
                {/* Sombra que cresce e escurece à medida que o pedaço se aproxima. */}
                <motion.span
                  className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle,#3a1d08_35%,transparent_70%)]"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 0.45, 0], scale: [0.3, 1, 1] }}
                  transition={{ duration: QUEDA + 0.25, times: [0, IMPACTO * 0.85, 1], delay: p.atraso }}
                />
                {i % 2 === 0 && <Farinha atraso={p.atraso + QUEDA * IMPACTO} />}
              </>
            )}
            <motion.div
              className="size-full"
              initial={semEntrada ? false : reduzido ? { opacity: 0 } : { opacity: 0, y: "-380%", rotate: p.rotacao - 160, scale: 1.45 }}
              // Cai acelerando (gravidade), achata ao tocar, quica e escorrega um tiquinho.
              animate={
                !animar
                  ? { opacity: 1, rotate: p.rotacao }
                  : {
                      opacity: [0, 1, 1, 1, 1],
                      y: ["-380%", "0%", "-16%", "0%", "0%"],
                      x: ["0%", "0%", `${deslize * 0.6}%`, `${deslize}%`, `${deslize}%`],
                      rotate: [p.rotacao - 160, p.rotacao - 8, p.rotacao + 4, p.rotacao, p.rotacao],
                      scaleX: [1.45, 1.12, 0.96, 1.02, 1],
                      scaleY: [1.45, 0.82, 1.06, 0.98, 1],
                    }
              }
              exit={reduzido ? { opacity: 0 } : { opacity: 0, y: "-220%", scale: 1.2, rotate: p.rotacao + 90, transition: { duration: 0.28, delay: (pedacos.length - i) * 0.015 } }}
              transition={
                !animar
                  ? { duration: 0.15 }
                  : { duration: QUEDA, times: [0, IMPACTO, 0.72, 0.88, 1], ease: ["easeIn", "easeOut", "easeIn", "easeOut"], delay: p.atraso }
              }
            >
            {visual.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={visual.url} alt="" draggable={false} className="size-full object-contain" />
            ) : (
              <span className="block size-full rounded-[45%_55%_50%_50%] shadow-[inset_0_-2px_0_rgb(0_0_0/0.2)]" style={{ background: corDoNome(item.nome) }} />
            )}
          </motion.div>
          </div>
        );
      })}
    </div>
  );
}

/** Caminho fechado em volta da borda, com ondulação leve e fixa (feito à mão, não um círculo perfeito). */
function caminhoDaBorda(raio: number, ondas: { amp: number; freq: number; fase: number }[], passos = 160): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= passos; i++) {
    // Começa embaixo (perto do polegar) e dá a volta no sentido horário.
    const a = (i / passos) * Math.PI * 2 + Math.PI / 2;
    const k = raio + ondas.reduce((soma, o) => soma + o.amp * Math.sin(a * o.freq + o.fase), 0);
    pts.push([50 + Math.cos(a) * k, 50 + Math.sin(a) * k]);
  }
  return `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L")}`;
}

// Leve irregularidade: o cordão sobe e desce um pouco, como feito à mão.
const CORDAO = caminhoDaBorda(44.6, [
  { amp: 0.45, freq: 3, fase: 0.4 },
  { amp: 0.25, freq: 7, fase: 1.3 },
  { amp: 0.12, freq: 13, fase: 2.1 },
]);

/** Saco de confeitar com bico de metal, recheio aparecendo pelo plástico e o nó torcido em cima. */
const CORPO_SACO = "M-2.6,-5.6 C-5.2,-12 -8.5,-20 -8,-27 C-7.5,-30 -3,-31.5 0,-31.5 C3,-31.5 7.5,-30 8,-27 C8.5,-20 5.2,-12 2.6,-5.6 Z";

function SacoDeConfeitar({ cores, id }: { cores: CoresBorda; id: string }) {
  return (
    <g transform="rotate(28) scale(1.6)">
      <defs>
        <linearGradient id={`plastico${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="0.75" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={`metal${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8f969f" />
          <stop offset="0.4" stopColor="#eef1f4" />
          <stop offset="1" stopColor="#7b828b" />
        </linearGradient>
        <filter id={`sombraSaco${id}`} x="-40%" y="-20%" width="180%" height="140%">
          <feDropShadow dx="1.2" dy="1.8" stdDeviation="1.1" floodColor="#2b1406" floodOpacity="0.35" />
        </filter>
      </defs>
      {/* "Aperto": o saco pulsa de leve enquanto aplica. */}
      <motion.g
        filter={`url(#sombraSaco${id})`}
        style={{ transformOrigin: "0px -16px" }}
        animate={{ scaleX: [1, 0.94, 1, 0.95, 1] }}
        transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Plástico branco do saco. */}
        <path d={CORPO_SACO} fill="#fbfaf6" stroke="#cfc8b8" strokeWidth="0.45" />
        {/* Recheio aparecendo pelo plástico, só na parte de baixo (perto do bico). */}
        <clipPath id={`corpo${id}`}>
          <path d={CORPO_SACO} />
        </clipPath>
        <g clipPath={`url(#corpo${id})`}>
          <path d="M-9,-17 C-4,-15.5 4,-16.5 9,-18 L9,0 L-9,0 Z" fill={cores.base} opacity="0.92" />
          <path d="M-9,-17 C-4,-15.5 4,-16.5 9,-18" stroke={cores.sombra} strokeOpacity="0.5" strokeWidth="0.6" fill="none" />
        </g>
        <path d={CORPO_SACO} fill={`url(#plastico${id})`} />
        {/* Rugas e brilho do plástico. */}
        <path d="M-6.6,-25 C-3,-23.4 2,-24 6.4,-26" stroke="#bdb5a3" strokeOpacity="0.6" strokeWidth="0.4" fill="none" />
        <path d="M-5.6,-21 C-2.6,-19.8 1.8,-20.2 5.2,-21.8" stroke="#bdb5a3" strokeOpacity="0.45" strokeWidth="0.35" fill="none" />
        <path d="M-4.8,-27.5 C-4.6,-21 -3.8,-14 -2.3,-8" stroke="#ffffff" strokeOpacity="0.95" strokeWidth="1" strokeLinecap="round" fill="none" />
        {/* Nó torcido em cima. */}
        <path d="M-3,-31 C-2,-33.5 2,-33.5 3,-31 L2,-35.5 C1,-37 -1,-37 -2,-35.5 Z" fill="#f2ede2" stroke="#c9c0ad" strokeWidth="0.4" />
        <path d="M-2.2,-32.5 L2.2,-34 M-2,-34.2 L2,-35.6" stroke="#b3a993" strokeWidth="0.35" />
        {/* Bico pitanga de metal. */}
        <path d="M-3,-6.2 L3,-6.2 L1.1,0 L-1.1,0 Z" fill={`url(#metal${id})`} stroke="#6f7680" strokeWidth="0.3" />
        <path d="M-1.8,-6 L-0.65,-0.3 M0,-6 L0,-0.3 M1.8,-6 L0.65,-0.3" stroke="#6f7680" strokeWidth="0.25" />
        {/* Recheio saindo pela ponta. */}
        <ellipse cx="0" cy="0.5" rx="1.5" ry="1" fill={cores.base} stroke={cores.sombra} strokeWidth="0.3" />
      </motion.g>
    </g>
  );
}

/**
 * Recheio da borda aplicado com bico de confeiteiro (pitanga): cordão grosso,
 * levemente irregular, com ranhuras transversais de corda torcida, contorno,
 * sombra e brilho. Animado, uma máscara "desenha" o cordão enquanto o saco
 * de confeitar vai na frente. Estático serve de prévia.
 */
export function AnelDeRecheio({ nome, animar = true }: { nome: string; animar?: boolean }) {
  const cores = coresDaBorda(nome);
  const id = useId().replace(/:/g, "");
  const DURACAO = 2.2;
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
      <defs>
        <filter id={`s${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        {animar && (
          <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="-5" y="-5" width="110" height="110">
            <motion.path
              d={CORDAO}
              fill="none"
              stroke="#fff"
              strokeWidth="11"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DURACAO, ease: "linear" }}
            />
          </mask>
        )}
      </defs>
      <g mask={animar ? `url(#m${id})` : undefined}>
        {/* Sombra no pão. */}
        <path d={CORDAO} fill="none" stroke="#2e1606" strokeOpacity="0.5" strokeWidth="7" strokeLinecap="round" transform="translate(0.5 0.9)" filter={`url(#s${id})`} />
        {/* Volume: contorno escuro e miolo na cor do recheio, puxado para a luz. */}
        <path d={CORDAO} fill="none" stroke={cores.sombra} strokeWidth="6.6" strokeLinecap="round" />
        <path d={CORDAO} fill="none" stroke={cores.base} strokeWidth="5.2" strokeLinecap="round" transform="translate(-0.2 -0.3)" />
        {/* Ranhuras transversais do bico pitanga (corda torcida). */}
        <path d={CORDAO} fill="none" stroke={cores.sombra} strokeOpacity="0.55" strokeWidth="5.4" strokeDasharray="0.9 2.3" />
        <path d={CORDAO} fill="none" stroke={cores.brilho} strokeOpacity="0.75" strokeWidth="4" strokeDasharray="0.8 2.4" strokeDashoffset="1.5" transform="translate(-0.45 -0.6)" />
        {/* Reflexo no alto do cordão. */}
        <path d={CORDAO} fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.9" strokeLinecap="round" transform="translate(-1 -1.3)" />
      </g>

      {animar && (
        // Saco de confeitar inteiro, inclinado como na mão de quem aplica: a ponta
        // acompanha o cordão e o saco não gira (fica sempre "segurado" do mesmo jeito).
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: DURACAO + 0.5, times: [0, 0.08, 0.88, 1] }}>
          <g>
            <animateMotion dur={`${DURACAO}s`} path={CORDAO} rotate="0" fill="freeze" />
            <SacoDeConfeitar cores={cores} id={id} />
          </g>
        </motion.g>
      )}
    </svg>
  );
}

function Borda({ camada, reduzido }: { camada: Camada; reduzido: boolean }) {
  const visual = camada.visuais[0];
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      {visual?.url && visual.tipo === "cobertura" ? (
        // Imagem do anel inteiro enviada pelo painel.
        <motion.img
          src={visual.url}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-contain"
          style={{ maskImage: "radial-gradient(circle, transparent 41%, #000 43%)", WebkitMaskImage: "radial-gradient(circle, transparent 41%, #000 43%)" }}
          initial={reduzido ? false : { rotate: -120, scale: 1.08 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={reduzido ? { duration: 0 } : { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        />
      ) : (
        <AnelDeRecheio nome={camada.nome} animar={!reduzido} />
      )}
    </motion.div>
  );
}

export interface PizzaProps {
  /** Escala pelo tamanho (0–1), animada. */
  escala: number;
  /** Um sabor por fatia (null = fatia vazia). O tamanho do array é o nº de fatias. Vazio = sem divisão. */
  fatias: (Camada | null)[];
  fatiaAtiva?: number;
  aoEscolherFatia?: (indice: number) => void;
  /** Ingredientes: valem para a pizza inteira. */
  ingredientes: Camada[];
  borda: Camada | null;
  assada?: boolean;
  /**
   * Base de cada fatia (mesmo tamanho de `fatias`; pizza inteira = 1 item).
   * Salgada: molho + muçarela; doce: só a massa. Padrão: salgada.
   */
  bases?: BaseSabor[];
  /** Sem animação de entrada (cópia da pizza, ex.: a fatia puxada). */
  semEntrada?: boolean;
  base?: BasePizza;
  className?: string;
}

export function Pizza({ escala, fatias, fatiaAtiva, aoEscolherFatia, ingredientes, borda, assada = false, bases, semEntrada = false, base = BASE_PADRAO, className }: PizzaProps) {
  const reduzido = useReducedMotion() ?? false;
  const total = Math.max(1, fatias.length);
  const linhas = divisorias(total);

  // Tudo numa lista só, ordenada por camada: molho, queijo da base, coberturas, pedaços, salpicados.
  const itens: Item[] = [
    ...Array.from({ length: total }, (_, i) =>
      (bases?.[i] ?? "salgada") === "doce"
        ? []
        : BASE_SALGADA.map((visual) => ({ chave: `base:${total}:${i}:${visual.chave}`, nome: "Molho e muçarela", visual, setor: setorDaFatia(i, total) }))
    ).flat(),
    ...fatias.flatMap((sabor, i) =>
      sabor ? sabor.visuais.map((visual) => ({ chave: `${total}:${i}:${sabor.chave}:${visual.chave}`, nome: sabor.nome, visual, setor: setorDaFatia(i, total) })) : []
    ),
    ...ingredientes.flatMap((ing) => ing.visuais.map((visual) => ({ chave: `ing:${ing.chave}:${visual.chave}`, nome: ing.nome, visual, setor: { inicio: 0, fim: 360 } }))),
  ].sort((a, b) => a.visual.ordem - b.visual.ordem);

  return (
    <motion.div
      className={`relative aspect-square select-none ${className ?? ""}`}
      animate={{ scale: escala }}
      transition={reduzido ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 16 }}
      role="img"
      aria-label={["Pizza", ...fatias.map((f, i) => (f ? `${total > 1 ? `fatia ${i + 1}: ` : ""}${f.nome}` : null)), ...ingredientes.map((i) => i.nome), borda?.nome]
        .filter(Boolean)
        .join(", ")}
    >
      {/* Sombra em gradiente (blur custava caro a cada quadro da rolagem). */}
      <div className="absolute inset-[-2%] translate-y-[3%] rounded-full bg-[radial-gradient(circle,rgb(28_25_23/0.28)_45%,rgb(28_25_23/0.1)_58%,transparent_70%)]" aria-hidden />
      {/* Massa crua e assada empilhadas: o forno troca uma pela outra (crossfade). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={base.massaCrua} alt="" draggable={false} className="absolute inset-0 size-full transition-opacity duration-700" style={{ opacity: assada ? 0 : 1 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={base.massaAssada} alt="" draggable={false} className="absolute inset-0 size-full transition-opacity duration-700" style={{ opacity: assada ? 1 : 0 }} />

      <AnimatePresence>
        {itens.map((item) =>
          item.visual.tipo === "cobertura" ? (
            <Cobertura key={item.chave} item={item} assada={assada} reduzido={reduzido} semEntrada={semEntrada} />
          ) : (
            <Pedacos key={item.chave} item={item} reduzido={reduzido} semEntrada={semEntrada} />
          )
        )}
      </AnimatePresence>
      <AnimatePresence>{borda && <Borda key={borda.chave} camada={borda} reduzido={reduzido || semEntrada} />}</AnimatePresence>

      {/* Brilho quente de forno por cima de tudo (só opacidade). */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(255_210_140/0.18),rgb(170_80_20/0.18))] mix-blend-multiply transition-opacity duration-700"
        style={{ opacity: assada ? 1 : 0 }}
        aria-hidden
      />

      {total > 1 && (
        <>
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {linhas.map((p, i) => (
              <line key={i} x1="50" y1="50" x2={p.x} y2={p.y} stroke="#fffcf7" strokeOpacity="0.95" strokeWidth="0.7" strokeDasharray="2 1.4" />
            ))}
          </svg>
          {/* Toque numa fatia para escolhê-la; as outras ficam um pouco apagadas. */}
          {fatias.map((_, i) => {
            const recorte = recorteDoSetor(setorDaFatia(i, total));
            const ativa = i === fatiaAtiva;
            return (
              <button
                key={i}
                type="button"
                onClick={() => aoEscolherFatia?.(i)}
                aria-label={`Escolher fatia ${i + 1}`}
                aria-pressed={ativa}
                className="absolute inset-0 rounded-full transition-[background-color] duration-200"
                style={{ clipPath: recorte, WebkitClipPath: recorte, backgroundColor: ativa ? "rgb(255 252 247 / 0)" : "rgb(28 25 23 / 0.2)" }}
              />
            );
          })}
        </>
      )}
    </motion.div>
  );
}
