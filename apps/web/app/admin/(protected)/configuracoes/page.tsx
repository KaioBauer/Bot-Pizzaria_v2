import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { listarEntregadores, listarTamanhos, obterConfiguracaoAdmin } from "@pizzaria/db";
import { CabecalhoPagina } from "../../../../components/ui";
import { exigirAdmin } from "../../../../lib/auth";
import { SecaoEntregadores } from "./entregadores";
import { SecaoWhatsapp } from "./whatsapp";
import { FormBairros, FormHorarios, FormLoja, FormPedidoLink, FormTamanhos } from "./formularios";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

/** Origem pública do site: NEXT_PUBLIC_SITE_URL ou o host da requisição (atrás do Nginx, x-forwarded-*). */
async function origemPublica(): Promise<string> {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configurada) return configurada;
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost:3000";
  const protocolo =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${protocolo}://${host}`;
}

export default async function ConfiguracoesPage() {
  const { supabase } = await exigirAdmin();
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const linkPedido = `${await origemPublica()}/pedir`;
  const [{ config, horarios, bairros, pedidoLink }, tamanhos, entregadores, qrPedido] = await Promise.all([
    obterConfiguracaoAdmin(supabase),
    listarTamanhos(supabase),
    listarEntregadores(supabase, inicioDoDia),
    QRCode.toDataURL(linkPedido, { width: 1024, margin: 2, errorCorrectionLevel: "M" }),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-10 p-4 sm:p-8">
      <CabecalhoPagina titulo="Configurações" descricao="Como a pizzaria funciona: WhatsApp, dados, pedido pelo link, horários, tamanhos, entrega e motoboys." />
      <SecaoWhatsapp />
      <FormLoja inicial={config} />
      <FormPedidoLink inicial={pedidoLink} link={linkPedido} qrDataUrl={qrPedido} />
      <FormHorarios inicial={horarios} />
      <FormTamanhos inicial={tamanhos} />
      <FormBairros inicial={bairros} />
      <SecaoEntregadores entregadores={entregadores} />
    </main>
  );
}
