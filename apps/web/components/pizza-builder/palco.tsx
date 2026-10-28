"use client";

import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CAMADAS_BASE } from "./biblioteca";
import { aleatorio, hash, recorteDoSetor } from "./geometria";
import { Pizza, type PizzaProps } from "./pizza";

const CENARIO = {
  pa: "/pedir/camadas/pa.webp",
  forno: "/pedir/camadas/forno.webp",
  caixaBase: "/pedir/camadas/caixa-base.webp",
  caixaTampa: "/pedir/camadas/caixa-tampa.webp",
};
export const IMAGENS_CENARIO = [...Object.values(CENARIO), CAMADAS_BASE.massaAssada];

type Etapa = "montando" | "pa" | "forno" | "saindo" | "corte" | "fatia" | "caixa" | "voando";

/**
 * Palco da pizza com o final "vai pro forno" — a pá entra, a
 * pizza vai ao forno a lenha, sai assada borbulhando, é cortada, uma fatia
 * puxa o queijo, vai para a caixa e a caixa voa até `alvoId` (carrinho).
 * Só transform/opacity; com "reduzir movimento" vira uma troca rápida.
 */
export function Palco({
  assar,
  alvoId,
  aoTerminar,
  sobreposicao,
  fatiasCorte = 8,
  ...pizza
}: PizzaProps & {
  /** Muda para true para disparar a sequência do forno. */
  assar: boolean;
  alvoId: string;
  aoTerminar: () => void;
  /** Camada extra sobre o palco (ex.: "+R$" flutuando). */
  sobreposicao?: ReactNode;
  /** Quantas fatias o cortador marca. */
  fatiasCorte?: number;
}) {
  const [escopo, animar] = useAnimate<HTMLDivElement>();
  const reduzido = useReducedMotion() ?? false;
  const [etapa, setEtapa] = useState<Etapa>("montando");
  const [assada, setAssada] = useState(false);
  const pular = useRef(false);
  const terminar = useRef(aoTerminar);
  useEffect(() => {
    terminar.current = aoTerminar;
  });

  useEffect(() => {
    if (!assar) return;
    let cancelado = false;
    pular.current = false;
    const parar = () => cancelado || pular.current;
    const espera = (ms: number) => new Promise((ok) => setTimeout(ok, parar() ? 0 : ms));
    const el = (seletor: string) => escopo.current?.querySelector<HTMLElement>(seletor) ?? null;

    void (async () => {
      const conjunto = el("[data-conjunto]");
      const disco = el("[data-pizza]");
      if (!conjunto || !disco) return;
      if (reduzido) {
        setAssada(true);
        await espera(600);
      } else {
        // 1. A pá entra por baixo.
        setEtapa("pa");
        await espera(380);
        // 2. Pizza e pá entram no forno.
        if (!parar()) {
          setEtapa("forno");
          await animar(conjunto, { scale: 0.42, y: "14%" }, { duration: 0.5, ease: [0.4, 0, 0.2, 1] });
        }
        await espera(500);
        setAssada(true);
        await espera(550);
        // 3. Sai assada, borbulhando.
        if (!parar()) {
          setEtapa("saindo");
          await animar(conjunto, { scale: 1, y: 0 }, { type: "spring", stiffness: 210, damping: 18 });
        }
        await espera(650);
        // 4. Cortador e 5. fatia puxando o queijo.
        if (!parar()) setEtapa("corte");
        await espera(650);
        if (!parar()) setEtapa("fatia");
        await espera(850);
        // 6. Caixa fecha e voa para o carrinho.
        if (!parar()) {
          setEtapa("caixa");
          await animar(disco, { scale: 0.86 }, { duration: 0.3 });
        }
        await espera(700);
        if (!parar()) {
          setEtapa("voando");
          const alvo = document.getElementById(alvoId)?.getBoundingClientRect();
          const origem = conjunto.getBoundingClientRect();
          if (alvo) {
            await animar(
              conjunto,
              {
                x: alvo.left + alvo.width / 2 - (origem.left + origem.width / 2),
                y: alvo.top + alvo.height / 2 - (origem.top + origem.height / 2),
                scale: 0.08,
                rotate: -12,
                opacity: 0.5,
              },
              { duration: 0.62, ease: [0.5, 0, 0.75, 0] }
            );
          }
        }
      }
      if (cancelado) return;
      // Volta ao início escondido (sem mostrar os ingredientes antigos saindo) e reaparece.
      await animar(conjunto, { opacity: 0 }, { duration: 0 });
      terminar.current();
      setAssada(false);
      setEtapa("montando");
      await Promise.all([animar(conjunto, { x: 0, y: 0, scale: 1, rotate: 0 }, { duration: 0 }), animar(disco, { scale: 1 }, { duration: 0 })]);
      await espera(380);
      await animar(conjunto, { opacity: 1 }, { duration: 0.35 });
    })();
    return () => {
      cancelado = true;
    };
  }, [assar, alvoId, animar, escopo, reduzido]);

  const comCaixa = etapa === "caixa" || etapa === "voando";
  const noForno = etapa === "forno";

  return (
    <div ref={escopo} className="relative mx-auto w-full">
      {/* Forno a lenha atrás da pizza: ela entra pela boca, na frente das chamas. */}
      <AnimatePresence>{noForno && <Forno key="forno" />}</AnimatePresence>

      <div data-conjunto className="relative z-[15]">
        {/* Fundo da caixa entra por baixo da pizza. */}
        <AnimatePresence>
          {comCaixa && (
            // eslint-disable-next-line @next/next/no-img-element
            <motion.img
              key="caixa-base"
              src={CENARIO.caixaBase}
              alt=""
              className="pointer-events-none absolute inset-[-6%] size-[112%] max-w-none"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </AnimatePresence>
        {/* Pá de pizzaiolo: desliza por baixo e leva a pizza ao forno. */}
        <AnimatePresence>
          {(etapa === "pa" || noForno) && (
            // eslint-disable-next-line @next/next/no-img-element
            <motion.img
              key="pa"
              src={CENARIO.pa}
              alt=""
              className="pointer-events-none absolute top-[-4%] left-[-4%] w-[108%] max-w-none"
              initial={{ y: "70%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "80%", opacity: 0, transition: { duration: 0.35 } }}
              transition={{ duration: 0.38, ease: [0.2, 0.8, 0.3, 1] }}
            />
          )}
        </AnimatePresence>

        <div data-pizza className="relative">
          <Pizza {...pizza} assada={assada || pizza.assada} />
          <AnimatePresence>{etapa === "saindo" && <Bolhas key="bolhas" />}</AnimatePresence>
          <AnimatePresence>{(etapa === "saindo" || etapa === "corte") && <Vapor key="vapor" />}</AnimatePresence>
          <AnimatePresence>{(etapa === "corte" || etapa === "fatia" || comCaixa) && <Cortes key="cortes" total={fatiasCorte} />}</AnimatePresence>
          <AnimatePresence>{etapa === "fatia" && <FatiaPuxada key="fatia" total={fatiasCorte} pizza={{ ...pizza, assada: true }} />}</AnimatePresence>
        </div>

        {/* Tampa: fecha por cima (dobradiça em cima). */}
        <AnimatePresence>
          {comCaixa && (
            <motion.div key="tampa" className="pointer-events-none absolute inset-[-6%] z-20" style={{ perspective: 900 }} exit={{ opacity: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img
                src={CENARIO.caixaTampa}
                alt=""
                className="size-full max-w-none"
                style={{ transformOrigin: "50% 0%" }}
                initial={{ rotateX: -175, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={{ duration: 0.55, ease: [0.3, 0.7, 0.2, 1], delay: 0.15 }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {assar && etapa !== "voando" && !reduzido && (
        <button
          type="button"
          onClick={() => {
            pular.current = true;
          }}
          className="absolute right-0 -bottom-2 z-40 rounded-full bg-stone-900/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
        >
          Pular
        </button>
      )}
      {sobreposicao}
    </div>
  );
}

/** Boca do forno a lenha com chamas que tremulam (escala/opacidade). */
function Forno() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-[-14%] z-[14]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.3 } }}
      transition={{ duration: 0.3 }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={CENARIO.forno} alt="" className="absolute inset-0 size-full rounded-[12%]" />
      {/* Chamas ao fundo, atrás da pizza. */}
      <div className="absolute inset-x-[22%] bottom-[16%] flex h-[36%] items-end justify-center gap-[2%]">
        {[0.7, 1, 0.85, 1.1, 0.75].map((altura, i) => (
          <motion.span
            key={i}
            className="block w-[16%] origin-bottom rounded-[50%_50%_45%_45%/70%_70%_30%_30%] bg-[radial-gradient(ellipse_at_50%_90%,#fff3b0,#ffb43c_35%,#f0601c_65%,transparent_75%)] blur-[1px]"
            style={{ height: `${altura * 100}%` }}
            animate={{ scaleY: [1, 1.25, 0.9, 1.15, 1], scaleX: [1, 0.85, 1.05, 0.9, 1], opacity: [0.85, 1, 0.8, 1, 0.85] }}
            transition={{ duration: 0.7 + i * 0.08, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
      {/* Brilho quente pulsando. */}
      <motion.div
        className="absolute inset-x-[18%] bottom-[10%] h-[45%] rounded-full bg-[radial-gradient(ellipse,rgb(255_150_50/0.55),transparent_70%)]"
        animate={{ opacity: [0.5, 1, 0.6, 0.9] }}
        transition={{ duration: 1.1, repeat: Infinity }}
      />
    </motion.div>
  );
}

/** Queijo borbulhando quando a pizza sai do forno. */
function Bolhas() {
  const bolhas = useMemo(() => {
    const r = aleatorio(hash("bolhas"));
    return Array.from({ length: 16 }, () => {
      const a = r() * Math.PI * 2;
      const k = Math.sqrt(r()) * 30;
      return { x: 50 + Math.cos(a) * k, y: 50 + Math.sin(a) * k, t: 2 + r() * 3.5, atraso: r() * 0.6 };
    });
  }, []);
  return (
    <motion.div className="pointer-events-none absolute inset-0" exit={{ opacity: 0 }} aria-hidden>
      {bolhas.map((b, i) => (
        <motion.span
          key={i}
          className="absolute block rounded-full bg-[radial-gradient(circle_at_35%_30%,#fffbea,#f5dc9c_60%,#d9a24f)] shadow-[0_1px_1px_rgb(120_70_20/0.35)]"
          style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.t}%`, height: `${b.t}%`, x: "-50%", y: "-50%" }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1, 1.15, 0], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.75, delay: b.atraso, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}

/** Fiozinhos de vapor subindo. */
function Vapor() {
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} aria-hidden>
      {[18, 34, 50, 66, 80].map((x, i) => (
        <motion.span
          key={x}
          className="absolute top-[30%] h-[28%] w-[9%] rounded-full bg-white/70 blur-md"
          style={{ left: `${x}%` }}
          initial={{ opacity: 0, y: 0, scaleX: 0.6 }}
          animate={{ opacity: [0, 0.8, 0], y: "-120%", scaleX: [0.6, 1.2, 1.6], x: i % 2 ? 8 : -8 }}
          transition={{ duration: 1.3, delay: i * 0.12, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}

/** O cortador passa marcando as fatias (traços do centro à borda). */
function Cortes({ total }: { total: number }) {
  const n = Math.max(4, Math.min(total, 12));
  return (
    <motion.svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full" exit={{ opacity: 0 }} aria-hidden>
      {Array.from({ length: n / 2 }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const [dx, dy] = [Math.cos(a) * 44, Math.sin(a) * 44];
        return (
          <g key={i}>
            <motion.line
              x1={50 - dx}
              y1={50 - dy}
              x2={50 + dx}
              y2={50 + dy}
              stroke="#5a3110"
              strokeOpacity="0.45"
              strokeWidth="1.1"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.28, delay: i * 0.1, ease: "easeInOut" }}
            />
            <motion.line
              x1={50 - dx}
              y1={50 - dy}
              x2={50 + dx}
              y2={50 + dy}
              stroke="#fff6dc"
              strokeOpacity="0.55"
              strokeWidth="0.4"
              strokeLinecap="round"
              transform="translate(0.5 -0.5)"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.28, delay: i * 0.1, ease: "easeInOut" }}
            />
          </g>
        );
      })}
      {/* A rodinha do cortador correndo pela primeira linha. */}
      <motion.circle
        r="3.2"
        fill="#d9dde2"
        stroke="#6b7280"
        strokeWidth="0.8"
        initial={{ cx: 6, cy: 50, opacity: 1 }}
        animate={{ cx: [6, 94], cy: 50, opacity: [1, 1, 0] }}
        transition={{ duration: 0.45, ease: "easeInOut" }}
      />
    </motion.svg>
  );
}

/** Uma fatia sai um pouco da pizza puxando fios de queijo. */
function FatiaPuxada({ total, pizza }: { total: number; pizza: PizzaProps }) {
  const n = Math.max(4, Math.min(total, 12));
  // Fatia de baixo (mais perto do polegar).
  const passo = 360 / n;
  const setor = { inicio: 180 - passo / 2, fim: 180 + passo / 2 };
  const recorte = recorteDoSetor(setor);
  return (
    <motion.div className="pointer-events-none absolute inset-0 z-10" exit={{ opacity: 0, transition: { duration: 0.2 } }} aria-hidden>
      {/* Fios de queijo esticando entre a fatia e a pizza. */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {[-4, 0, 4].map((dx, i) => (
          <motion.path
            key={i}
            d={`M${50 + dx},60 Q${50 + dx * 1.4},70 ${50 + dx * 0.6},78`}
            stroke="#fbeec4"
            strokeWidth={1.4 - i * 0.2}
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, times: [0, 0.6, 1], delay: 0.05 }}
          />
        ))}
      </svg>
      <motion.div
        className="absolute inset-0"
        style={{ clipPath: recorte, WebkitClipPath: recorte, filter: "drop-shadow(0 4px 6px rgb(60 30 10 / 0.35))" }}
        initial={{ y: 0 }}
        animate={{ y: ["0%", "11%", "11%", "0%"] }}
        transition={{ duration: 0.8, times: [0, 0.4, 0.75, 1], ease: "easeInOut" }}
      >
        <Pizza {...pizza} fatiaAtiva={undefined} aoEscolherFatia={undefined} semEntrada />
      </motion.div>
    </motion.div>
  );
}
