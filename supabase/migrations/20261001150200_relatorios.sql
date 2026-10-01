-- Fase 7: relatórios do painel. `security_invoker` faz as views respeitarem
-- o RLS de quem consulta (só admin enxerga pedidos).

-- Pedidos e faturamento por dia (dia do pedido no fuso da loja; cancelados à parte).
create view public.relatorio_vendas_diarias
with (security_invoker = true) as
select
  data_ref as dia,
  count(*) filter (where status <> 'cancelado') as pedidos,
  count(*) filter (where status = 'cancelado') as cancelados,
  coalesce(sum(valor_total) filter (where status <> 'cancelado'), 0) as faturamento,
  coalesce(sum(taxa_entrega) filter (where status <> 'cancelado'), 0) as taxas_entrega,
  count(*) filter (where status <> 'cancelado' and tipo_entrega = 'entrega') as entregas,
  count(*) filter (where status <> 'cancelado' and tipo_entrega = 'retirada') as retiradas
from public.pedidos
where status <> 'aguardando_pagamento'
group by data_ref;

-- Produtos mais vendidos por dia. Meio a meio conta meia pizza para cada sabor.
create view public.relatorio_produtos_vendidos
with (security_invoker = true) as
select
  p.data_ref as dia,
  c.produto_id,
  c.produto_nome,
  sum(i.quantidade::numeric / sabores.total) as quantidade,
  sum(i.subtotal / sabores.total) as faturamento
from public.itens_pedido_componentes c
join public.itens_pedido i on i.id = c.item_id
join public.pedidos p on p.id = i.pedido_id
join lateral (
  select count(*) as total from public.itens_pedido_componentes s
  where s.item_id = i.id and s.tipo = 'sabor'
) sabores on true
where c.tipo = 'sabor'
  and p.status not in ('cancelado', 'aguardando_pagamento')
group by p.data_ref, c.produto_id, c.produto_nome;
