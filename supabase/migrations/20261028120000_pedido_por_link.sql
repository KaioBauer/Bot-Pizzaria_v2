-- Pedido direto por link (/pedir): o cliente monta a pizza e finaliza no
-- navegador, sem passar pelo bot. O bot (service_role) recebe o carrinho,
-- reprecifica tudo no core e grava pela mesma criar_pedido.
--
-- - canal 'link' (chat_id = telefone com DDI, para avisos pelo WhatsApp);
-- - idempotência: a mesma chave devolve o pedido já criado (duplo clique);
-- - token de acompanhamento: link único da tela de status (acesso anônimo
--   só pela função acompanhar_pedido, sem SELECT em pedidos);
-- - ingredientes: catálogo único com preço por tamanho, adicionais da pizza
--   inteira e base da montagem livre ("Monte a sua");
-- - imagens de camada (vista de cima, fundo transparente) para a montagem visual.

-- Canal -----------------------------------------------------------------------

alter table public.clientes drop constraint clientes_canal_check;
alter table public.clientes add constraint clientes_canal_check
  check (canal in ('telegram', 'whatsapp', 'link'));

alter table public.pedidos drop constraint pedidos_canal_check;
alter table public.pedidos add constraint pedidos_canal_check
  check (canal in ('telegram', 'whatsapp', 'link'));

alter table public.pedidos
  add column token_acompanhamento text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  add column chave_idempotencia text,
  add constraint pedidos_token_acompanhamento_key unique (token_acompanhamento),
  add constraint pedidos_chave_idempotencia_key unique (chave_idempotencia);

-- Configuração ------------------------------------------------------------------

alter table public.configuracoes
  add column pedido_link_ativo boolean not null default false,
  add column max_ingredientes integer not null default 6 check (max_ingredientes between 1 and 20);

-- Ingredientes ------------------------------------------------------------------

create table public.ingredientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  imagem_camada_url text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ingredientes_nome_key on public.ingredientes (lower(nome));
create trigger trg_ingredientes_updated_at before update on public.ingredientes
  for each row execute function public.set_updated_at();

-- Preço do ingrediente em cada tamanho de pizza. Sem linha = não oferecido nesse tamanho.
create table public.ingrediente_precos (
  ingrediente_id uuid not null references public.ingredientes(id) on delete cascade,
  tamanho_id uuid not null references public.tamanhos_pizza(id) on delete cascade,
  preco numeric(10,2) not null check (preco >= 0),
  primary key (ingrediente_id, tamanho_id)
);

alter table public.ingredientes enable row level security;
alter table public.ingrediente_precos enable row level security;
create policy ingredientes_leitura_publica on public.ingredientes for select using (ativo = true);
create policy admin_tudo on public.ingredientes for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy ingrediente_precos_leitura_publica on public.ingrediente_precos for select using (true);
create policy admin_tudo on public.ingrediente_precos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Componente do item: ingrediente não é variação de produto.
alter table public.itens_pedido_componentes drop constraint itens_pedido_componentes_tipo_check;
alter table public.itens_pedido_componentes
  alter column produto_id drop not null,
  alter column variacao_id drop not null,
  add column ingrediente_id uuid references public.ingredientes(id) on delete restrict,
  add constraint itens_pedido_componentes_tipo_check check (
    (tipo in ('sabor', 'adicional') and produto_id is not null and variacao_id is not null and ingrediente_id is null)
    or (tipo = 'ingrediente' and ingrediente_id is not null and produto_id is null and variacao_id is null)
  );

-- Imagens de camada ----------------------------------------------------------------

alter table public.produtos add column imagem_camada_url text;

-- Bordas se repetem em cada sabor (mesmo nome): a camada é por nome.
create table public.camadas_borda (
  nome text primary key,
  imagem_url text not null,
  updated_at timestamptz not null default now()
);
create trigger trg_camadas_borda_updated_at before update on public.camadas_borda
  for each row execute function public.set_updated_at();
alter table public.camadas_borda enable row level security;
create policy camadas_borda_leitura_publica on public.camadas_borda for select using (true);
create policy admin_tudo on public.camadas_borda for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('camadas', 'camadas', true, 1024 * 1024, array['image/png', 'image/webp']);

create policy camadas_admin_insere on storage.objects for insert to authenticated
  with check (bucket_id = 'camadas' and public.eh_admin());
create policy camadas_admin_altera on storage.objects for update to authenticated
  using (bucket_id = 'camadas' and public.eh_admin());
create policy camadas_admin_remove on storage.objects for delete to authenticated
  using (bucket_id = 'camadas' and public.eh_admin());

-- Montagem livre ---------------------------------------------------------------------
-- "Monte a sua" é um sabor do sistema com o preço base de cada tamanho (o trigger
-- de tamanhos_pizza reajusta junto). Assim o item continua tendo um sabor e
-- relatórios, cupom e motoboy funcionam sem mudança. Fica fora do cardápio do
-- bot e do /cardapio (o repositório filtra por montagem_livre).

alter table public.produtos add column montagem_livre boolean not null default false;
create unique index produtos_montagem_livre_key on public.produtos (montagem_livre) where montagem_livre;

do $$
declare
  v_categoria uuid;
  v_produto uuid;
begin
  -- Categoria com mais pizzas (produtos com variação de tamanho).
  select p.categoria_id into v_categoria
  from public.produtos p
  join public.variacoes_produto v on v.produto_id = p.id and v.tipo = 'tamanho'
  group by p.categoria_id
  order by count(distinct p.id) desc
  limit 1;

  if v_categoria is null then
    return; -- banco sem cardápio (ex.: db reset local): o admin cria depois
  end if;

  insert into public.produtos (categoria_id, nome, descricao, ativo, montagem_livre, ordem)
  values (v_categoria, 'Monte a sua', 'Escolha os ingredientes da sua pizza.', true, true, 9999)
  returning id into v_produto;

  insert into public.variacoes_produto (produto_id, nome, tipo, preco, ativo, ordem)
  select v_produto, t.nome, 'tamanho', t.preco_base, true, t.ordem
  from public.tamanhos_pizza t;
end;
$$;

-- criar_pedido v3 -------------------------------------------------------------------
-- Igual à v2 + ingrediente nos componentes + idempotência + token no retorno.

drop function public.criar_pedido(jsonb);

create function public.criar_pedido(p_pedido jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_endereco_id uuid;
  v_pedido_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_fuso text;
  v_data_ref date;
  v_numero integer;
  v_token text;
  v_chave text := nullif(p_pedido->>'chave_idempotencia', '');
begin
  if jsonb_array_length(coalesce(p_pedido->'itens', '[]'::jsonb)) = 0 then
    raise exception 'Pedido precisa ter ao menos um item';
  end if;

  -- Repetição (duplo clique, reenvio após timeout): devolve o pedido já criado.
  -- A disputa simultânea é resolvida pela unique: a segunda transação espera
  -- a primeira e cai no exception abaixo.
  if v_chave is not null then
    select id, numero, token_acompanhamento into v_pedido_id, v_numero, v_token
    from public.pedidos where chave_idempotencia = v_chave;
    if found then
      return jsonb_build_object('id', v_pedido_id, 'numero', v_numero, 'token', v_token, 'existente', true);
    end if;
  end if;

  begin
    insert into public.clientes (canal, chat_id, nome, telefone)
    values (
      p_pedido->>'canal',
      p_pedido->>'chat_id',
      p_pedido->>'cliente_nome',
      p_pedido->>'cliente_telefone'
    )
    on conflict (canal, chat_id) do update
      set nome = excluded.nome,
          telefone = coalesce(excluded.telefone, public.clientes.telefone)
    returning id into v_cliente_id;

    if p_pedido->>'tipo_entrega' = 'entrega' then
      insert into public.enderecos (
        cliente_id, rua, numero, bairro, bairro_id, complemento, referencia, padrao
      ) values (
        v_cliente_id,
        p_pedido->'endereco'->>'rua',
        p_pedido->'endereco'->>'numero',
        p_pedido->'endereco'->>'bairro',
        (p_pedido->'endereco'->>'bairro_id')::uuid,
        p_pedido->'endereco'->>'complemento',
        p_pedido->'endereco'->>'referencia',
        true
      )
      returning id into v_endereco_id;

      update public.enderecos set padrao = false
      where cliente_id = v_cliente_id and id <> v_endereco_id and padrao;
    end if;

    select fuso_horario into v_fuso from public.configuracoes;
    v_data_ref := (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;

    -- O upsert trava a linha do dia: pedidos simultâneos recebem números distintos.
    insert into public.pedido_contadores as c (data_ref, ultimo)
    values (v_data_ref, 1)
    on conflict (data_ref) do update set ultimo = c.ultimo + 1
    returning c.ultimo into v_numero;

    insert into public.pedidos (
      cliente_id, numero, data_ref, canal, chat_id, cliente_nome, cliente_telefone,
      tipo_entrega, endereco_id, endereco_texto, forma_pagamento, troco_para,
      status, subtotal, taxa_entrega, valor_total, observacoes, chave_idempotencia
    ) values (
      v_cliente_id, v_numero, v_data_ref,
      p_pedido->>'canal',
      p_pedido->>'chat_id',
      p_pedido->>'cliente_nome',
      p_pedido->>'cliente_telefone',
      p_pedido->>'tipo_entrega',
      v_endereco_id,
      p_pedido->>'endereco_texto',
      p_pedido->>'forma_pagamento',
      (p_pedido->>'troco_para')::numeric,
      p_pedido->>'status',
      (p_pedido->>'subtotal')::numeric,
      (p_pedido->>'taxa_entrega')::numeric,
      (p_pedido->>'valor_total')::numeric,
      p_pedido->>'observacoes',
      v_chave
    )
    returning id, token_acompanhamento into v_pedido_id, v_token;

    for v_item in select * from jsonb_array_elements(p_pedido->'itens')
    loop
      insert into public.itens_pedido (
        pedido_id, produto_id, variacao_id, quantidade, preco_unitario, subtotal,
        descricao, observacoes
      ) values (
        v_pedido_id,
        (v_item->>'produto_id')::uuid,
        (v_item->>'variacao_id')::uuid,
        (v_item->>'quantidade')::integer,
        (v_item->>'preco_unitario')::numeric,
        (v_item->>'subtotal')::numeric,
        v_item->>'descricao',
        v_item->>'observacoes'
      )
      returning id into v_item_id;

      insert into public.itens_pedido_componentes (
        item_id, tipo, produto_id, variacao_id, ingrediente_id, produto_nome, variacao_nome, preco
      )
      select
        v_item_id,
        c->>'tipo',
        (c->>'produto_id')::uuid,
        (c->>'variacao_id')::uuid,
        (c->>'ingrediente_id')::uuid,
        c->>'produto_nome',
        c->>'variacao_nome',
        (c->>'preco')::numeric
      from jsonb_array_elements(v_item->'componentes') as c;
    end loop;
  exception when unique_violation then
    -- Outra transação gravou a mesma chave primeiro: tudo acima foi desfeito.
    if v_chave is null then raise; end if;
    select id, numero, token_acompanhamento into v_pedido_id, v_numero, v_token
    from public.pedidos where chave_idempotencia = v_chave;
    if not found then raise; end if;
    return jsonb_build_object('id', v_pedido_id, 'numero', v_numero, 'token', v_token, 'existente', true);
  end;

  return jsonb_build_object('id', v_pedido_id, 'numero', v_numero, 'token', v_token, 'existente', false);
end;
$$;

revoke all on function public.criar_pedido(jsonb) from public, anon, authenticated;
grant execute on function public.criar_pedido(jsonb) to service_role;

-- Acompanhamento anônimo ---------------------------------------------------------------
-- Só quem tem o token (link entregue ao cliente) vê o pedido; sem telefone nem endereço.

create function public.acompanhar_pedido(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero', p.numero,
    'status', p.status,
    'tipo_entrega', p.tipo_entrega,
    'forma_pagamento', p.forma_pagamento,
    'subtotal', p.subtotal,
    'taxa_entrega', p.taxa_entrega,
    'valor_total', p.valor_total,
    'motivo_cancelamento', p.motivo_cancelamento,
    'criado_em', p.created_at,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('quantidade', i.quantidade, 'descricao', i.descricao, 'subtotal', i.subtotal) order by i.created_at)
      from public.itens_pedido i where i.pedido_id = p.id
    ), '[]'::jsonb),
    'pix', (
      select jsonb_build_object('copia_e_cola', g.qr_code, 'qr_base64', g.qr_code_base64, 'expira_em', g.expira_em, 'status', g.status)
      from public.pagamentos g where g.pedido_id = p.id
      order by g.created_at desc limit 1
    )
  )
  from public.pedidos p
  where length(p_token) >= 32 and p.token_acompanhamento = p_token;
$$;

revoke all on function public.acompanhar_pedido(text) from public;
grant execute on function public.acompanhar_pedido(text) to anon, authenticated, service_role;

-- Relatórios por canal -------------------------------------------------------------------

drop view public.relatorio_vendas_diarias;
create view public.relatorio_vendas_diarias
with (security_invoker = true) as
select
  data_ref as dia,
  canal,
  count(*) filter (where status <> 'cancelado') as pedidos,
  count(*) filter (where status = 'cancelado') as cancelados,
  coalesce(sum(valor_total) filter (where status <> 'cancelado'), 0) as faturamento,
  coalesce(sum(taxa_entrega) filter (where status <> 'cancelado'), 0) as taxas_entrega,
  count(*) filter (where status <> 'cancelado' and tipo_entrega = 'entrega') as entregas,
  count(*) filter (where status <> 'cancelado' and tipo_entrega = 'retirada') as retiradas
from public.pedidos
where status <> 'aguardando_pagamento'
group by data_ref, canal;

-- Meio a meio conta meia pizza para cada sabor (1/N).
drop view public.relatorio_produtos_vendidos;
create view public.relatorio_produtos_vendidos
with (security_invoker = true) as
select
  p.data_ref as dia,
  p.canal,
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
group by p.data_ref, p.canal, c.produto_id, c.produto_nome;
