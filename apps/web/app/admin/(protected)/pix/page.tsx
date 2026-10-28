import type { Metadata } from "next";
import { exigirAdmin } from "../../../../lib/auth";
import { extratoAction } from "./actions";
import { BancoSimulado } from "./banco";

export const metadata: Metadata = { title: "Banco simulado" };
export const dynamic = "force-dynamic";

export default async function PixPage() {
  await exigirAdmin();
  const extrato = await extratoAction();
  return <BancoSimulado inicial={extrato} />;
}
