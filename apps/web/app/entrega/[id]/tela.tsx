"use client";

import { Banknote, Camera, CheckCircle2, CreditCard, LocateFixed, MapPin, Navigation, Phone, QrCode, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { centavosParaCampo, formatarReais, formatarTelefone, lerReais, paraCentavos } from "@pizzaria/shared";
import { Aviso, Botao, cn, estiloEntrada } from "../../../components/ui";
import { clienteNavegador } from "../../../lib/supabase/navegador";
import { concluirEntregaAction, iniciarEntregaAction } from "../actions";

/** Resposta de `entrega_detalhe` (valores em reais, como no banco). */
export interface DetalheEntrega {
  id: string;
  numero: number;
  status: string;
  tipo_entrega: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  endereco_texto: string | null;
  forma_pagamento: "pix" | "dinheiro" | "cartao";
  troco_para: number | null;
  valor_total: number;
  observacoes: string | null;
  entregador_id: string | null;
  entregador_nome: string | null;
  entrega_iniciada_em: string | null;
  entregue_em: string | null;
  itens: { quantidade: number; descricao: string; observacao: string | null }[];
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Reduz a foto (câmera do celular manda 4–12 MB) para JPEG de até 1600 px. */
async function comprimir(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  canvas.getContext("2d")!.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Falha ao processar a foto"))), "image/jpeg", 0.8));
}

type Local = { estado: "buscando" } | { estado: "ok"; lat: number; lng: number; precisao: number } | { estado: "erro"; motivo: string };

export function TelaEntrega({ detalhe: d, usuarioId, admin }: { detalhe: DetalheEntrega; usuarioId: string; admin: boolean }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [local, setLocal] = useState<Local>({ estado: "buscando" });
  const [recebido, setRecebido] = useState(centavosParaCampo(paraCentavos(d.troco_para ?? d.valor_total)));
  const [cartaoOk, setCartaoOk] = useState(false);

  const total = paraCentavos(d.valor_total);
  const minha = d.status === "saiu_para_entrega" && (d.entregador_id === usuarioId || admin);
  const podeIniciar = d.tipo_entrega === "entrega" && (d.status === "novo" || d.status === "em_preparo");
  const mapa = d.endereco_texto ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.endereco_texto)}` : null;
  const recebidoCentavos = lerReais(recebido);
  const troco = recebidoCentavos !== null ? recebidoCentavos - total : null;

  function buscarLocal() {
    if (!("geolocation" in navigator)) return setLocal({ estado: "erro", motivo: "Celular sem GPS disponível" });
    setLocal({ estado: "buscando" });
    navigator.geolocation.getCurrentPosition(
      (p) => setLocal({ estado: "ok", lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy) }),
      (e) => setLocal({ estado: "erro", motivo: e.code === e.PERMISSION_DENIED ? "Permita o acesso à localização" : "Não consegui achar a localização" }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 }
    );
  }
  useEffect(() => {
    if (minha) buscarLocal();
  }, [minha]);

  function executar(fn: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await fn();
        if (!r.ok) return setErro(r.erro);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha de conexão. Tente de novo.");
      }
    });
  }

  function confirmar() {
    if (!foto) return setErro("Tire a foto da casa para confirmar.");
    let valorRecebidoCentavos: number | null = null;
    if (d.forma_pagamento === "dinheiro") {
      if (recebidoCentavos === null || recebidoCentavos < total) return setErro(`Informe quanto recebeu (no mínimo ${formatarReais(total)}).`);
      valorRecebidoCentavos = recebidoCentavos;
    } else if (d.forma_pagamento === "cartao") {
      if (!cartaoOk) return setErro("Confirme que passou o cartão.");
      valorRecebidoCentavos = total;
    }
    executar(async () => {
      const caminho = `${d.id}/${Date.now()}.jpg`;
      const envio = await clienteNavegador().storage.from("entregas").upload(caminho, foto.blob, { contentType: "image/jpeg" });
      if (envio.error) return { ok: false, erro: `Não consegui enviar a foto: ${envio.error.message}` };
      return concluirEntregaAction({
        pedidoId: d.id,
        foto: caminho,
        lat: local.estado === "ok" ? local.lat : null,
        lng: local.estado === "ok" ? local.lng : null,
        precisaoM: local.estado === "ok" ? local.precisao : null,
        valorRecebidoCentavos,
      });
    });
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 pb-10">
      {/* Cabeçalho do pedido */}
      <section className="rounded-3xl bg-white p-5 shadow-suave ring-1 ring-stone-900/5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl font-semibold text-marca-700">#{d.numero}</span>
          <span className="ml-auto text-sm text-stone-500">{d.tipo_entrega === "entrega" ? "Entrega" : "Retirada"}</span>
        </div>
        <p className="mt-2 text-lg font-semibold">{d.cliente_nome}</p>
        {d.endereco_texto && (
          <p className="mt-1 flex items-start gap-1.5 text-stone-700">
            <MapPin className="mt-0.5 size-4 shrink-0 text-marca-600" /> {d.endereco_texto}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {mapa && (
            <a href={mapa} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-stone-950 font-semibold text-white">
              <Navigation className="size-4" /> Abrir no mapa
            </a>
          )}
          {d.cliente_telefone && (
            <a href={`tel:${d.cliente_telefone.replace(/\D/g, "")}`} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-semibold ring-1 ring-stone-900/15">
              <Phone className="size-4" /> {formatarTelefone(d.cliente_telefone)}
            </a>
          )}
        </div>
      </section>

      {/* Pagamento */}
      <section className={cn("flex items-center gap-3 rounded-3xl p-5", d.forma_pagamento === "pix" ? "bg-manjericao-50 text-manjericao-900 ring-1 ring-manjericao-100" : "bg-amber-50 text-amber-950 ring-1 ring-amber-200")}>
        {d.forma_pagamento === "pix" ? <QrCode className="size-7 shrink-0" /> : d.forma_pagamento === "cartao" ? <CreditCard className="size-7 shrink-0" /> : <Banknote className="size-7 shrink-0" />}
        <div>
          {d.forma_pagamento === "pix" ? (
            <p className="font-semibold">Já pago no Pix — não cobrar</p>
          ) : (
            <>
              <p className="font-semibold">
                Cobrar {formatarReais(total)} {d.forma_pagamento === "cartao" ? "no cartão (leve a maquininha)" : "em dinheiro"}
              </p>
              {d.forma_pagamento === "dinheiro" && d.troco_para !== null && (
                <p className="text-sm">
                  Troco para {formatarReais(paraCentavos(d.troco_para))} → levar <b>{formatarReais(paraCentavos(d.troco_para) - total)}</b>
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Itens */}
      <section className="rounded-3xl bg-white p-5 shadow-suave ring-1 ring-stone-900/5">
        <h2 className="mb-2 font-semibold">Itens</h2>
        <ul className="space-y-1 text-sm">
          {d.itens.map((i, n) => (
            <li key={n}>
              <b>{i.quantidade}x</b> {i.descricao}
              {i.observacao && <span className="block pl-6 text-stone-500 italic">{i.observacao}</span>}
            </li>
          ))}
        </ul>
        {d.observacoes && <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">Obs.: {d.observacoes}</p>}
      </section>

      {erro && <Aviso>{erro}</Aviso>}

      {/* Ação conforme o status */}
      {podeIniciar && (
        <Botao tamanho="lg" disabled={ocupado} onClick={() => executar(() => iniciarEntregaAction(d.id))} className="h-14 w-full text-lg">
          <Navigation className="size-5" /> {ocupado ? "Iniciando..." : "Iniciar entrega"}
        </Botao>
      )}

      {d.status === "saiu_para_entrega" && !minha && (
        <Aviso tom="aviso">Esta entrega saiu com {d.entregador_nome ?? "outro entregador"}{d.entrega_iniciada_em ? ` às ${hora(d.entrega_iniciada_em)}` : ""}.</Aviso>
      )}

      {minha && (
        <section className="space-y-4 rounded-3xl bg-white p-5 shadow-suave ring-1 ring-stone-900/5">
          <h2 className="font-display text-xl font-semibold">Confirmar entrega</h2>

          <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-center", foto ? "border-transparent" : "border-stone-300 p-6")}>
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.url} alt="Foto da entrega" className="max-h-72 w-full rounded-2xl object-cover" />
            ) : (
              <>
                <Camera className="size-9 text-marca-600" />
                <span className="font-semibold">Tirar foto da casa</span>
                <span className="text-sm text-stone-500">Mostre a fachada ou o portão com o número</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const arquivo = e.target.files?.[0];
                if (!arquivo) return;
                try {
                  const blob = await comprimir(arquivo);
                  setFoto((anterior) => {
                    if (anterior) URL.revokeObjectURL(anterior.url);
                    return { blob, url: URL.createObjectURL(blob) };
                  });
                } catch {
                  setErro("Não consegui ler a foto. Tente de novo.");
                }
              }}
            />
          </label>
          {foto && (
            <p className="-mt-2 text-center text-sm text-stone-500">
              <RotateCcw className="inline size-3.5" /> Toque na foto para tirar outra
            </p>
          )}

          <div className="flex items-center gap-2 text-sm">
            <LocateFixed className={cn("size-4", local.estado === "ok" ? "text-manjericao-600" : "text-stone-400")} />
            {local.estado === "buscando" && <span className="text-stone-500">Buscando localização...</span>}
            {local.estado === "ok" && <span className="text-manjericao-700">Localização registrada (±{local.precisao} m)</span>}
            {local.estado === "erro" && (
              <>
                <span className="text-amber-800">{local.motivo}</span>
                <button type="button" onClick={buscarLocal} className="ml-auto font-semibold text-marca-700 underline">
                  Tentar de novo
                </button>
              </>
            )}
          </div>

          {d.forma_pagamento === "dinheiro" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Quanto o cliente te deu (R$)</span>
              <input value={recebido} onChange={(e) => setRecebido(e.target.value)} inputMode="decimal" className={cn(estiloEntrada, "h-12 text-lg tabular")} />
              {troco !== null && troco >= 0 && <span className="mt-1 block text-sm text-stone-600">Troco: <b>{formatarReais(troco)}</b></span>}
            </label>
          )}
          {d.forma_pagamento === "cartao" && (
            <label className="flex items-center gap-3 rounded-2xl bg-stone-50 p-4">
              <input type="checkbox" checked={cartaoOk} onChange={(e) => setCartaoOk(e.target.checked)} className="size-5 accent-marca-600" />
              <span className="font-medium">Passei {formatarReais(total)} no cartão</span>
            </label>
          )}

          <Botao tamanho="lg" disabled={ocupado} onClick={confirmar} className="h-14 w-full bg-manjericao-600 text-lg hover:bg-manjericao-700">
            <CheckCircle2 className="size-5" /> {ocupado ? "Enviando..." : "Confirmar entrega"}
          </Botao>
        </section>
      )}

      {d.status === "concluido" && (
        <div className="flex items-center gap-3 rounded-3xl bg-manjericao-50 p-5 text-manjericao-900 ring-1 ring-manjericao-100">
          <CheckCircle2 className="size-8" />
          <p className="font-semibold">
            Entregue{d.entregue_em ? ` às ${hora(d.entregue_em)}` : ""}
            {d.entregador_nome ? ` por ${d.entregador_nome}` : ""} ✅
          </p>
        </div>
      )}
      {(d.status === "aguardando_pagamento" || d.status === "cancelado" || d.tipo_entrega !== "entrega") && (
        <Aviso tom="aviso">
          {d.status === "cancelado" ? "Pedido cancelado — não entregar." : d.status === "aguardando_pagamento" ? "Pedido ainda aguardando o pagamento do Pix." : "Este pedido é para retirada no balcão."}
        </Aviso>
      )}
    </main>
  );
}
