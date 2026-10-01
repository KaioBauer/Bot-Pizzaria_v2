import { listarCategoriasComProdutos } from "@pizzaria/db";
import { createServiceClient } from "../../../../lib/db";
import {
  alternarAtivoProdutoAction,
  alternarAtivoVariacaoAction,
  atualizarCategoriaAction,
  atualizarProdutoAction,
  atualizarVariacaoAction,
  criarCategoriaAction,
  criarProdutoAction,
  criarVariacaoAction,
} from "./actions";

export const dynamic = "force-dynamic";

function formatarPreco(preco: number): string {
  return preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function AdminCardapioPage() {
  const categorias = await listarCategoriasComProdutos(createServiceClient());

  return (
    <div className="legado container">
      <h1>Cardápio</h1>

      {categorias.map((categoria) => (
        <section key={categoria.id} className="card">
          <form action={atualizarCategoriaAction} style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <input type="hidden" name="id" value={categoria.id} />
            <div className="field">
              <label>Categoria</label>
              <input name="nome" defaultValue={categoria.nome} required />
            </div>
            <div className="field">
              <label>Ordem</label>
              <input name="ordem" type="number" defaultValue={categoria.ordem} style={{ width: 80 }} />
            </div>
            <button type="submit">Salvar</button>
          </form>

          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Descrição</th>
                <th>Status</th>
                <th>Variações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categoria.produtos.map((produto) => (
                <tr key={produto.id}>
                  <td style={{ minWidth: 160 }}>
                    <form action={atualizarProdutoAction} className="field">
                      <input type="hidden" name="id" value={produto.id} />
                      <input name="nome" defaultValue={produto.nome} required />
                      <input
                        name="descricao"
                        defaultValue={produto.descricao ?? ""}
                        placeholder="descrição"
                      />
                      <button type="submit" className="secondary">
                        Salvar
                      </button>
                    </form>
                  </td>
                  <td>{produto.descricao}</td>
                  <td>
                    <span className="badge">{produto.ativo ? "ativo" : "inativo"}</span>
                    <form action={alternarAtivoProdutoAction} className="inline" style={{ marginLeft: 8 }}>
                      <input type="hidden" name="id" value={produto.id} />
                      <input type="hidden" name="ativo" value={(!produto.ativo).toString()} />
                      <button type="submit" className="secondary">
                        {produto.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </form>
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {produto.variacoes.map((variacao) => (
                        <li key={variacao.id} style={{ marginBottom: 8 }}>
                          <form
                            action={atualizarVariacaoAction}
                            style={{ display: "flex", gap: 4, alignItems: "center" }}
                          >
                            <input type="hidden" name="id" value={variacao.id} />
                            <input name="nome" defaultValue={variacao.nome} style={{ width: 90 }} />
                            <select name="tipo" defaultValue={variacao.tipo}>
                              <option value="tamanho">tamanho</option>
                              <option value="borda">borda</option>
                              <option value="adicional">adicional</option>
                              <option value="padrao">padrao</option>
                            </select>
                            <input
                              name="preco"
                              type="number"
                              step="0.01"
                              defaultValue={variacao.preco}
                              style={{ width: 80 }}
                            />
                            <button type="submit" className="secondary">
                              Salvar
                            </button>
                          </form>
                          <span className="badge">
                            {variacao.ativo ? "ativa" : "inativa"} · {formatarPreco(variacao.preco)}
                          </span>
                          <form action={alternarAtivoVariacaoAction} className="inline" style={{ marginLeft: 8 }}>
                            <input type="hidden" name="id" value={variacao.id} />
                            <input type="hidden" name="ativo" value={(!variacao.ativo).toString()} />
                            <button type="submit" className="secondary">
                              {variacao.ativo ? "Desativar" : "Ativar"}
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                    <form action={criarVariacaoAction} style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      <input type="hidden" name="produto_id" value={produto.id} />
                      <input name="nome" placeholder="nome da variação" required style={{ width: 90 }} />
                      <select name="tipo" defaultValue="tamanho">
                        <option value="tamanho">tamanho</option>
                        <option value="borda">borda</option>
                        <option value="adicional">adicional</option>
                        <option value="padrao">padrao</option>
                      </select>
                      <input name="preco" type="number" step="0.01" placeholder="preço" required style={{ width: 80 }} />
                      <button type="submit">Adicionar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form action={criarProdutoAction} style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input type="hidden" name="categoria_id" value={categoria.id} />
            <input name="nome" placeholder="novo produto" required />
            <input name="descricao" placeholder="descrição" />
            <button type="submit">Adicionar produto</button>
          </form>
        </section>
      ))}

      <section className="card">
        <h2>Nova categoria</h2>
        <form action={criarCategoriaAction} style={{ display: "flex", gap: 8 }}>
          <input name="nome" placeholder="nome da categoria" required />
          <input name="ordem" type="number" placeholder="ordem" defaultValue={categorias.length} style={{ width: 100 }} />
          <button type="submit">Criar</button>
        </form>
      </section>
    </div>
  );
}
