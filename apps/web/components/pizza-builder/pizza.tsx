"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { CAMADAS_BASE, type TipoCamada } from "./biblioteca";
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

function Cobertura({ item, assada, reduzido }: { item: Item; assada: boolean; reduzido: boolean }) {
  const recorte = recorteDoSetor(item.setor);
  const { visual } = item;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      style={{ clipPath: recorte, WebkitClipPath: recorte }}
      // "Chuva" de queijo: desce de leve, assenta e aparece.
      initial={reduzido ? { opacity: 0 } : { opacity: 0, y: "-6%", scale: 1.06 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: reduzido ? 1 : 1.04, transition: { duration: 0.25 } }}
      transition={reduzido ? { duration: 0.15 } : { duration: 0.55, ease: [0.2, 0.8, 0.3, 1] }}
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
  );
}

function Pedacos({ item, reduzido }: { item: Item; reduzido: boolean }) {
  const { visual, setor } = item;
  const fracao = (setor.fim - setor.inicio) / 360;
  const quantidade = Math.max(2, Math.round(visual.quantidade * fracao));
  const pedacos = useMemo(() => espalhar(item.chave, quantidade, setor, 37), [item.chave, quantidade, setor]);
  return (
    <div className="pointer-events-none absolute inset-0">
      {pedacos.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${visual.tamanho * p.escala}%`, height: `${visual.tamanho * p.escala}%`, transform: "translate(-50%, -50%)" }}
        >
          <motion.div
            className="size-full"
            initial={reduzido ? { opacity: 0 } : { opacity: 0, y: "-320%", rotate: p.rotacao - 140, scale: 1.35 }}
            // Cai, achata ao tocar a pizza e assenta.
            animate={reduzido ? { opacity: 1, rotate: p.rotacao } : { opacity: [0, 1, 1, 1], y: ["-320%", "0%", "-14%", "0%"], rotate: p.rotacao, scale: [1.35, 0.9, 1.04, 1] }}
            exit={reduzido ? { opacity: 0 } : { opacity: 0, y: "-220%", scale: 1.2, rotate: p.rotacao + 90, transition: { duration: 0.28, delay: (pedacos.length - i) * 0.015 } }}
            transition={reduzido ? { duration: 0.15 } : { duration: 0.62, times: [0, 0.58, 0.8, 1], ease: "easeOut", delay: p.atraso }}
          >
            {visual.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={visual.url} alt="" draggable={false} className="size-full object-contain" />
            ) : (
              <span className="block size-full rounded-[45%_55%_50%_50%] shadow-[inset_0_-2px_0_rgb(0_0_0/0.2)]" style={{ background: corDoNome(item.nome) }} />
            )}
          </motion.div>
        </div>
      ))}
    </div>
  );
}

function Borda({ camada, reduzido }: { camada: Camada; reduzido: boolean }) {
  const url = camada.visuais[0]?.url;
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      {url ? (
        <motion.img
          src={url}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-contain"
          style={{ maskImage: "radial-gradient(circle, transparent 41%, #000 43%)", WebkitMaskImage: "radial-gradient(circle, transparent 41%, #000 43%)" }}
          initial={reduzido ? false : { rotate: -120, scale: 1.08 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={reduzido ? { duration: 0 } : { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        />
      ) : (
        // Recheio da borda: um cordão cremoso que "corre" em volta da pizza.
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
          <motion.circle
            cx="50"
            cy="50"
            r="45.2"
            fill="none"
            stroke={camada.nome.toLowerCase().includes("chocolate") ? "#5b2e14" : camada.nome.toLowerCase().includes("cheddar") ? "#f39a1e" : "#fbf6ea"}
            strokeWidth="3.6"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0.6px 0.6px rgb(60 30 10 / 0.45))" }}
            initial={reduzido ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduzido ? 0 : 0.9, ease: "easeInOut" }}
          />
        </svg>
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
  /** O molho se espalha ao aparecer (abertura da página). */
  molhoAnimado?: boolean;
  base?: BasePizza;
  className?: string;
}

export function Pizza({ escala, fatias, fatiaAtiva, aoEscolherFatia, ingredientes, borda, assada = false, molhoAnimado = false, base = BASE_PADRAO, className }: PizzaProps) {
  const reduzido = useReducedMotion() ?? false;
  const total = Math.max(1, fatias.length);
  const linhas = divisorias(total);

  // Tudo numa lista só, ordenada por camada: coberturas, pedaços, salpicados.
  const itens: Item[] = [
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
      <div className="absolute inset-[4%] translate-y-[3%] rounded-full bg-stone-900/25 blur-2xl" aria-hidden />
      {/* Massa crua e assada empilhadas: o forno troca uma pela outra (crossfade). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={base.massaCrua} alt="" draggable={false} className="absolute inset-0 size-full transition-opacity duration-700" style={{ opacity: assada ? 0 : 1 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={base.massaAssada} alt="" draggable={false} className="absolute inset-0 size-full transition-opacity duration-700" style={{ opacity: assada ? 1 : 0 }} />
      <motion.img
        src={base.molho}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full"
        initial={molhoAnimado && !reduzido ? { scale: 0.15, rotate: -220, opacity: 0.4 } : false}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: 0.15 }}
      />

      <AnimatePresence>
        {itens.map((item) =>
          item.visual.tipo === "cobertura" ? (
            <Cobertura key={item.chave} item={item} assada={assada} reduzido={reduzido} />
          ) : (
            <Pedacos key={item.chave} item={item} reduzido={reduzido} />
          )
        )}
      </AnimatePresence>
      <AnimatePresence>{borda && <Borda key={borda.chave} camada={borda} reduzido={reduzido} />}</AnimatePresence>

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
