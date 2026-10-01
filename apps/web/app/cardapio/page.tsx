import { criarRepositorios } from "@pizzaria/db";
import { formatarReais } from "@pizzaria/shared";
import { createAnonClient } from "../../lib/db";

// Página provisória: refeita na Fase 4 (cardápio público).

export const dynamic = "force-dynamic";

export default async function CardapioPage() {
  const categorias = await criarRepositorios(createAnonClient()).cardapio.ativo();

  return (
    <div className="legado"><div className="container">
      <h1>Cardápio</h1>

      {categorias.length === 0 && <p>Nenhum produto disponível no momento.</p>}

      {categorias.map((categoria) => (
        <section key={categoria.id} className="card">
          <h2>{categoria.nome}</h2>
          {categoria.produtos.map((produto) => (
            <div key={produto.id} style={{ marginBottom: 16 }}>
              <strong>{produto.nome}</strong>
              {produto.descricao && <p style={{ margin: "4px 0", color: "#666" }}>{produto.descricao}</p>}
              <ul>
                {produto.variacoes.map((variacao) => (
                  <li key={variacao.id}>
                    {variacao.nome} — {formatarReais(variacao.precoCentavos)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div></div>
  );
}
