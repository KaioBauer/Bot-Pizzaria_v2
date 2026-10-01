import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-6xl">🍕</div>
      <h1 className="text-3xl font-black text-marca-700">Vianna Pizzaria</h1>
      <Link href="/cardapio" className="w-full rounded-xl bg-marca-600 py-3 font-semibold text-white">
        Ver cardápio
      </Link>
      <Link href="/admin" className="text-sm text-stone-500 underline">
        Painel da pizzaria
      </Link>
    </main>
  );
}
