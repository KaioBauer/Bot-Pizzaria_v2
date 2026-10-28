-- Montagem visual: ingrediente que cobre a pizza inteira (queijo ralado) ou que
-- cai em pedaços (calabresa, milho...). E ajustes do pedido por link.

alter table public.ingredientes
  add column camada_tipo text not null default 'pedacos' check (camada_tipo in ('pedacos', 'cobertura'));

-- Preço de ingrediente desativado não precisa ficar visível para o público.
drop policy ingrediente_precos_leitura_publica on public.ingrediente_precos;
create policy ingrediente_precos_leitura_publica on public.ingrediente_precos for select
  using (exists (select 1 from public.ingredientes i where i.id = ingrediente_id and i.ativo));

-- Bordas no "Monte a sua": as mesmas das pizzas, com o preço mais comum de cada uma.
insert into public.variacoes_produto (produto_id, nome, tipo, preco, ativo, ordem)
select p.id, b.nome, 'borda', b.preco, true, 100 + row_number() over (order by b.nome)
from public.produtos p
cross join lateral (
  select v.nome, mode() within group (order by v.preco) as preco
  from public.variacoes_produto v
  where v.tipo = 'borda' and v.ativo and v.produto_id <> p.id
  group by v.nome
) b
where p.montagem_livre
  and not exists (
    select 1 from public.variacoes_produto x
    where x.produto_id = p.id and x.tipo = 'borda' and x.nome = b.nome
  );
