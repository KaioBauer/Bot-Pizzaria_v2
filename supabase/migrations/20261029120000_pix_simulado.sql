-- Pix simulado: o "lado do banco" das cobranças, no lugar do PSP real (OpenPix).
-- Só o bot (service_role) lê e escreve: RLS ligado e nenhuma política.
-- `referencia` = id do pedido (texto, como o correlationID de um PSP real:
-- o banco não conhece as tabelas da pizzaria, por isso não há chave estrangeira).

create table public.pix_simulado_cobrancas (
  referencia text primary key,
  txid text not null unique check (txid ~ '^[A-Za-z0-9]{1,25}$'),
  valor numeric(10, 2) not null check (valor > 0),
  descricao text not null default '',
  br_code text not null,
  status text not null default 'ativa'
    check (status in ('ativa', 'paga', 'expirada', 'cancelada', 'estornada')),
  expira_em timestamptz not null,
  paga_em timestamptz,
  pagador_nome text,
  end_to_end_id text unique,
  estornada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pix_simulado_cobrancas_created_at_idx on public.pix_simulado_cobrancas (created_at desc);

create trigger pix_simulado_cobrancas_updated_at
  before update on public.pix_simulado_cobrancas
  for each row execute function public.set_updated_at();

alter table public.pix_simulado_cobrancas enable row level security;
