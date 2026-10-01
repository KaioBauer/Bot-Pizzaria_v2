import { redirect } from "next/navigation";

/** A vitrine da pizzaria é o cardápio; o painel fica em /admin. */
export default function Inicio() {
  redirect("/cardapio");
}
