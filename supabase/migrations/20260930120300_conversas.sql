-- Histórico de conversa do agente, persistido por canal + chat_id. Uma
-- conversa fica ativa até o pedido ser finalizado ou expirar por
-- inatividade; depois disso o próximo contato abre uma nova.

create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('telegram', 'whatsapp')),
  chat_id text not null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  encerrada_em timestamptz,
  created_at timestamptz not null default now(),
  -- Última atividade; usado para expirar conversas paradas.
  updated_at timestamptz not null default now()
);
create unique index conversas_ativa_key on public.conversas (canal, chat_id)
  where encerrada_em is null;
create trigger trg_conversas_updated_at before update on public.conversas
  for each row execute function public.set_updated_at();

-- Formato neutro de mensagem (independe do provedor de LLM).
create table public.conversa_mensagens (
  id bigint generated always as identity primary key,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  papel text not null check (papel in ('user', 'assistant', 'tool')),
  conteudo text,
  tool_calls jsonb,
  tool_call_id text,
  created_at timestamptz not null default now()
);
create index idx_conversa_mensagens on public.conversa_mensagens (conversa_id, id desc);

alter table public.conversas enable row level security;
alter table public.conversa_mensagens enable row level security;
