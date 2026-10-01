-- Fase 5: Pix online (Mercado Pago).
--
-- Fluxo: pedido Pix nasce `aguardando_pagamento` + cobrança aqui. O webhook
-- confirma -> pedido vai para `novo` (e só então imprime). Cobrança vencida
-- -> pedido cancelado e cliente avisado (via notificacoes_cliente).

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  provedor text not null default 'mercadopago',
  provedor_id text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'expirado', 'cancelado', 'recusado', 'estornado')),
  valor numeric(10,2) not null check (valor > 0),
  qr_code text,
  qr_code_base64 text,
  expira_em timestamptz not null,
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pagamentos_provedor_id_key unique (provedor, provedor_id)
);
create index idx_pagamentos_pedido on public.pagamentos (pedido_id);
create index idx_pagamentos_pendentes on public.pagamentos (expira_em) where status = 'pendente';
create trigger trg_pagamentos_updated_at before update on public.pagamentos
  for each row execute function public.set_updated_at();

-- Registro de cada notificação recebida (auditoria + idempotência).
create table public.webhook_eventos (
  id bigint generated always as identity primary key,
  provedor text not null,
  chave text not null,
  payload jsonb not null,
  resultado text,
  created_at timestamptz not null default now(),
  constraint webhook_eventos_chave_key unique (provedor, chave)
);

alter table public.pagamentos enable row level security;
alter table public.webhook_eventos enable row level security;
create policy admin_leitura on public.pagamentos for select to authenticated
  using (public.eh_admin());

-- Painel mostra o Pix pendente em tempo real.
alter publication supabase_realtime add table public.pagamentos;
