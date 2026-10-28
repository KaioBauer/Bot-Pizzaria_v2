import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acompanharAction } from "../../actions";
import { Acompanhamento } from "./acompanhamento";

export const metadata: Metadata = {
  title: "Acompanhe seu pedido",
  // Link pessoal: não indexar.
  robots: { index: false, follow: false },
};

export default async function AcompanharPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pedido = await acompanharAction(token);
  if (!pedido) notFound();
  return <Acompanhamento token={token} inicial={pedido} />;
}
