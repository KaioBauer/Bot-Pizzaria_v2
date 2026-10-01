-- Pedidos v2: clientes por canal, número diário, novos status, snapshots
-- (nome/preço/endereço congelados no momento da compra), itens com meio a
-- meio e adicionais, e histórico de status.
--
-- Pré-condição verificada em 2026-09-30: clientes, enderecos, pedidos e
-- itens_pedido estão vazias. Os `set not null` abaixo falham de propósito se
-- não estiverem.

-- Cardápio -------------------------------------------------------------------

alter table public.variacoes_produto
  add constraint variacoes_produto_tipo_check
  check (tipo in ('tamanho', 'borda', 'adicional', 'padrao'));

-- Clientes: identificados por canal + chat_id. Telefone é opcional (o
-- Telegram não expõe) e deixa de ser único (a mesma pessoa pode falar pelos
-- dois canais).

alter table public.clientes
  drop constraint clientes_telefone_key,
  alter column telefone drop not null,
  add column canal text not null check (canal in ('telegram', 'whatsapp')),
  add column chat_id text not null,
  add column updated_at timestamptz not null default now(),
  add constraint clientes_canal_chat_key unique (canal, chat_id);
create index idx_clientes_telefone on public.clientes (telefone);
create trigger trg_clientes_updated_at before update on public.clientes
  for each row execute function public.set_updated_at();

alter table public.enderecos
  add column bairro_id uuid references public.bairros_entrega(id) on delete set null;

-- Pedidos --------------------------------------------------------------------

alter table public.pedidos drop constraint pedidos_status_check;

update public.pedidos set status = case status
  when 'recebido' then 'novo'
  when 'preparando' then 'em_preparo'
  when 'pronto_retirada' then 'pronto_para_retirada'
  when 'finalizado' then 'concluido'
  else status
end;

alter table public.pedidos
  alter column status set default 'novo',
  add constraint pedidos_status_check check (status in (
    'aguardando_pagamento', 'novo', 'em_preparo', 'saiu_para_entrega',
    'pronto_para_retirada', 'concluido', 'cancelado'
  )),
  -- Número curto que reinicia todo dia (fuso da loja): #1, #2...
  add column numero integer not null,
  add column data_ref date not null,
  -- Canal de origem, para notificar o cliente.
  add column canal text not null check (canal in ('telegram', 'whatsapp')),
  add column chat_id text not null,
  -- Snapshots para impressão/painel, imunes a edições posteriores.
  add column cliente_nome text not null,
  add column cliente_telefone text,
  add column endereco_texto text,
  add column subtotal numeric(10,2) not null check (subtotal >= 0),
  add column taxa_entrega numeric(10,2) not null default 0 check (taxa_entrega >= 0),
  add column troco_para numeric(10,2),
  add column motivo_cancelamento text,
  add column impresso_em timestamptz,
  add column reimpressao_solicitada_em timestamptz,
  add constraint pedidos_numero_dia_key unique (data_ref, numero),
  add constraint pedidos_total_check check (valor_total = subtotal + taxa_entrega),
  add constraint pedidos_troco_check check (
    troco_para is null or (forma_pagamento = 'dinheiro' and troco_para >= valor_total)
  );

create index idx_pedidos_chat on public.pedidos (canal, chat_id, created_at desc);
-- Fila do print-agent: pedidos novos ainda não impressos.
create index idx_pedidos_nao_impressos on public.pedidos (created_at)
  where impresso_em is null;

create table public.pedido_contadores (
  data_ref date primary key,
  ultimo integer not null
);
alter table public.pedido_contadores enable row level security;

-- Itens ----------------------------------------------------------------------
-- `produto_id`/`variacao_id` do item apontam para o primeiro sabor (mantidos
-- por compatibilidade e relatórios); a composição completa (sabores do meio a
-- meio, borda, adicionais) fica em `itens_pedido_componentes`.

alter table public.itens_pedido
  add column descricao text not null,
  add column subtotal numeric(10,2) not null check (subtotal >= 0);

create table public.itens_pedido_componentes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.itens_pedido(id) on delete cascade,
  tipo text not null check (tipo in ('sabor', 'adicional')),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  variacao_id uuid not null references public.variacoes_produto(id) on delete restrict,
  produto_nome text not null,
  variacao_nome text not null,
  preco numeric(10,2) not null check (preco >= 0),
  created_at timestamptz not null default now()
);
create index idx_componentes_item on public.itens_pedido_componentes (item_id);
create index idx_componentes_produto on public.itens_pedido_componentes (produto_id);
alter table public.itens_pedido_componentes enable row level security;

-- Histórico de status --------------------------------------------------------

create table public.pedido_status_historico (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  status_anterior text,
  status_novo text not null,
  -- Usuário do painel que fez a mudança; null quando foi o sistema.
  alterado_por uuid,
  created_at timestamptz not null default now()
);
create index idx_status_historico_pedido
  on public.pedido_status_historico (pedido_id, created_at);
alter table public.pedido_status_historico enable row level security;

create function public.registrar_historico_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.pedido_status_historico (pedido_id, status_anterior, status_novo, alterado_por)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.registrar_historico_status() from public, anon, authenticated;

create trigger trg_pedidos_historico_status
  after insert or update of status on public.pedidos
  for each row execute function public.registrar_historico_status();
