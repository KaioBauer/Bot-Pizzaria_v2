"use client";

import {
  ArrowRight,
  ChartColumn,
  ClipboardList,
  CornerDownLeft,
  ExternalLink,
  Landmark,
  Layers,
  MessagesSquare,
  Pause,
  Pizza,
  Play,
  Plus,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { cn } from "../ui";

/**
 * Paleta de comandos (⌘K / Ctrl+K): navegar e executar ações pelo teclado,
 * como nas ferramentas de produto. Setas escolhem, Enter executa, Esc fecha.
 */

interface Comando {
  id: string;
  grupo: "Ir para" | "Ações" | "Links";
  rotulo: string;
  Icone: LucideIcon;
  atalho?: string;
  palavras?: string;
  executar: () => void | Promise<void>;
}

const Contexto = createContext({ abrir: () => {} });
export const usePaletaComandos = () => use(Contexto);

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function ProvedorComandos({
  aceitandoPedidos,
  alternarLoja,
  children,
}: {
  aceitandoPedidos: boolean;
  alternarLoja: (formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [indice, setIndice] = useState(0);
  const [, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  const fechar = useCallback(() => {
    setAberta(false);
    setBusca("");
    setIndice(0);
  }, []);

  const comandos = useMemo<Comando[]>(
    () => [
      { id: "pedidos", grupo: "Ir para", rotulo: "Pedidos", Icone: ClipboardList, atalho: "G P", executar: () => router.push("/admin/pedidos") },
      { id: "conversas", grupo: "Ir para", rotulo: "Conversas", Icone: MessagesSquare, atalho: "G C", executar: () => router.push("/admin/conversas") },
      { id: "cardapio", grupo: "Ir para", rotulo: "Cardápio", Icone: Pizza, atalho: "G M", executar: () => router.push("/admin/cardapio") },
      { id: "ingredientes", grupo: "Ir para", rotulo: "Ingredientes e camadas", Icone: Layers, palavras: "camada imagem", executar: () => router.push("/admin/cardapio/ingredientes") },
      { id: "relatorios", grupo: "Ir para", rotulo: "Relatórios", Icone: ChartColumn, atalho: "G R", palavras: "vendas faturamento", executar: () => router.push("/admin/relatorios") },
      { id: "pix", grupo: "Ir para", rotulo: "Banco simulado (pagar Pix)", Icone: Landmark, palavras: "pix pagamento banco teste", executar: () => router.push("/admin/pix") },
      { id: "config", grupo: "Ir para", rotulo: "Configurações", Icone: Settings, atalho: "G S", palavras: "horario whatsapp bairro", executar: () => router.push("/admin/configuracoes") },
      { id: "novo-produto", grupo: "Ações", rotulo: "Novo produto", Icone: Plus, palavras: "criar sabor pizza", executar: () => router.push("/admin/cardapio/produto/novo") },
      {
        id: "loja",
        grupo: "Ações",
        rotulo: aceitandoPedidos ? "Pausar pedidos" : "Retomar pedidos",
        Icone: aceitandoPedidos ? Pause : Play,
        palavras: "loja fechar abrir",
        executar: () =>
          iniciar(async () => {
            const dados = new FormData();
            dados.set("aceitando", String(!aceitandoPedidos));
            await alternarLoja(dados);
            router.refresh();
          }),
      },
      { id: "cardapio-publico", grupo: "Links", rotulo: "Abrir cardápio público", Icone: ExternalLink, executar: () => void window.open("/cardapio", "_blank") },
      { id: "pedir", grupo: "Links", rotulo: "Abrir pedido pelo link (/pedir)", Icone: ExternalLink, palavras: "monte pizza", executar: () => void window.open("/pedir", "_blank") },
    ],
    [router, aceitandoPedidos, alternarLoja]
  );

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return comandos;
    return comandos.filter((c) => normalizar(`${c.rotulo} ${c.palavras ?? ""} ${c.grupo}`).includes(termo));
  }, [busca, comandos]);

  // Atalhos: ⌘K/Ctrl+K abre; "g" seguido de uma letra navega (como no Linear).
  useEffect(() => {
    let prefixoG = 0;
    const tecla = (e: KeyboardEvent) => {
      const digitando = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((a) => !a);
        return;
      }
      if (digitando || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "g") {
        prefixoG = Date.now();
        return;
      }
      if (Date.now() - prefixoG < 800) {
        const destino = { p: "/admin/pedidos", c: "/admin/conversas", m: "/admin/cardapio", r: "/admin/relatorios", s: "/admin/configuracoes" }[e.key];
        if (destino) router.push(destino);
        prefixoG = 0;
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [router]);

  useEffect(() => {
    if (aberta) requestAnimationFrame(() => entrada.current?.focus());
  }, [aberta]);

  const executar = (c: Comando | undefined) => {
    if (!c) return;
    fechar();
    void c.executar();
  };

  const grupos = (["Ir para", "Ações", "Links"] as const).map((g) => ({ g, itens: filtrados.filter((c) => c.grupo === g) })).filter((x) => x.itens.length);
  let posicao = -1;

  return (
    <Contexto value={{ abrir: () => setAberta(true) }}>
      {children}
      <AnimatePresence>
        {aberta && (
          <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
            <motion.div className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fechar} />
            <motion.div
              className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-12px_rgb(0_0_0/0.35),0_0_0_1px_rgb(0_0_0/0.06)]"
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
            >
              <div className="flex items-center gap-3 border-b border-zinc-100 px-4">
                <Search className="size-4 text-zinc-400" />
                <input
                  ref={entrada}
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setIndice(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setIndice((i) => Math.min(filtrados.length - 1, i + 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setIndice((i) => Math.max(0, i - 1));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      executar(grupos.flatMap((x) => x.itens)[indice]);
                    } else if (e.key === "Escape") {
                      fechar();
                    }
                  }}
                  placeholder="Buscar páginas e ações..."
                  className="h-13 flex-1 bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400"
                />
                <kbd className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">Esc</kbd>
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-2">
                {grupos.length === 0 && <p className="px-3 py-8 text-center text-sm text-zinc-500">Nada encontrado para “{busca}”.</p>}
                {grupos.map(({ g, itens }) => (
                  <div key={g} className="mb-1">
                    <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">{g}</p>
                    {itens.map((c) => {
                      posicao++;
                      const meu = posicao;
                      const ativo = meu === indice;
                      return (
                        <button
                          key={c.id}
                          onMouseMove={() => setIndice(meu)}
                          onClick={() => executar(c)}
                          className={cn("relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", ativo ? "text-zinc-900" : "text-zinc-600")}
                        >
                          {ativo && <motion.span layoutId="comando-ativo" className="absolute inset-0 rounded-lg bg-zinc-100" transition={{ type: "spring", stiffness: 600, damping: 40 }} />}
                          <c.Icone className="relative size-4 text-zinc-500" />
                          <span className="relative flex-1">{c.rotulo}</span>
                          {c.atalho && <span className="relative text-[11px] text-zinc-400">{c.atalho}</span>}
                          {ativo && <CornerDownLeft className="relative size-3.5 text-zinc-400" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 border-t border-zinc-100 bg-zinc-50/70 px-4 py-2 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-white px-1 ring-1 ring-zinc-200">↑</kbd>
                  <kbd className="rounded bg-white px-1 ring-1 ring-zinc-200">↓</kbd> navegar
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-white px-1 ring-1 ring-zinc-200">↵</kbd> abrir
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <ArrowRight className="size-3" /> <kbd className="rounded bg-white px-1 ring-1 ring-zinc-200">G</kbd> + letra para ir direto
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Contexto>
  );
}
