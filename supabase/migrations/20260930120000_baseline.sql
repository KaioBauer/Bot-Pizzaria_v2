-- Baseline: schema que já existia no projeto antes das migrations (criado à
-- mão pelo dashboard). Reconstruído a partir do catálogo do banco em
-- 2026-09-30. No projeto remoto esta migration é marcada como aplicada via
-- `supabase migration repair --status applied` e NUNCA é executada lá; ela
-- existe para que `supabase db reset` monte um banco local idêntico.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  nome text not null,
  descricao text,
  imagem_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_produtos_ativo on public.produtos (ativo);
create index idx_produtos_categoria on public.produtos (categoria_id);
create trigger trg_produtos_updated_at before update on public.produtos
  for each row execute function public.set_updated_at();

create table public.variacoes_produto (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  nome text not null,
  tipo text not null,
  preco numeric(10,2) not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_variacoes_produto on public.variacoes_produto (produto_id);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique,
  nome text,
  created_at timestamptz not null default now()
);

create table public.enderecos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  rua text not null,
  numero text,
  bairro text,
  complemento text,
  referencia text,
  padrao boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_enderecos_cliente on public.enderecos (cliente_id);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  tipo_entrega text not null check (tipo_entrega = any (array['entrega', 'retirada'])),
  endereco_id uuid references public.enderecos(id) on delete restrict,
  forma_pagamento text not null check (forma_pagamento = any (array['dinheiro', 'pix', 'cartao'])),
  status text not null default 'recebido' check (status = any (array[
    'recebido', 'preparando', 'saiu_para_entrega', 'pronto_retirada', 'finalizado', 'cancelado'
  ])),
  valor_total numeric(10,2) not null default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_endereco_entrega check (
    (tipo_entrega = 'entrega' and endereco_id is not null) or tipo_entrega = 'retirada'
  )
);
create index idx_pedidos_cliente on public.pedidos (cliente_id);
create index idx_pedidos_status on public.pedidos (status);
create index idx_pedidos_created_at on public.pedidos (created_at desc);
create trigger trg_pedidos_updated_at before update on public.pedidos
  for each row execute function public.set_updated_at();

create table public.itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  variacao_id uuid not null references public.variacoes_produto(id) on delete restrict,
  quantidade integer not null default 1 check (quantidade > 0),
  preco_unitario numeric(10,2) not null,
  observacoes text,
  created_at timestamptz not null default now()
);
create index idx_itens_pedido_pedido on public.itens_pedido (pedido_id);
create index idx_itens_pedido_produto on public.itens_pedido (produto_id);

alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.variacoes_produto enable row level security;
alter table public.clientes enable row level security;
alter table public.enderecos enable row level security;
alter table public.pedidos enable row level security;
alter table public.itens_pedido enable row level security;

create policy cardapio_publico_categorias on public.categorias
  for select using (true);
create policy cardapio_publico_produtos on public.produtos
  for select using (ativo = true);
create policy cardapio_publico_variacoes on public.variacoes_produto
  for select using (ativo = true);

create or replace function public.criar_pedido(
  p_cliente_id uuid,
  p_tipo_entrega text,
  p_endereco_id uuid,
  p_forma_pagamento text,
  p_valor_total numeric,
  p_observacoes text,
  p_itens jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_pedido_id uuid;
  v_item jsonb;
begin
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido precisa ter ao menos um item';
  end if;

  insert into public.pedidos (
    cliente_id, tipo_entrega, endereco_id, forma_pagamento,
    status, valor_total, observacoes, created_at, updated_at
  ) values (
    p_cliente_id, p_tipo_entrega, p_endereco_id, p_forma_pagamento,
    'recebido', p_valor_total, p_observacoes, now(), now()
  )
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.itens_pedido (
      pedido_id, produto_id, variacao_id, quantidade, preco_unitario, observacoes
    ) values (
      v_pedido_id,
      (v_item->>'produto_id')::uuid,
      (v_item->>'variacao_id')::uuid,
      (v_item->>'quantidade')::int,
      (v_item->>'preco_unitario')::numeric,
      v_item->>'observacoes'
    );
  end loop;

  return v_pedido_id;
end;
$$;
