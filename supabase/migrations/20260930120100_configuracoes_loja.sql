-- Configurações da loja editáveis no painel: dados da pizzaria, horário de
-- funcionamento e bairros atendidos com a respectiva taxa de entrega.

alter function public.set_updated_at() set search_path = '';

-- Linha única (singleton): `id` é sempre true.
create table public.configuracoes (
  id boolean primary key default true check (id),
  nome_pizzaria text not null default 'Vianna Pizzaria',
  telefone text,
  endereco text,
  fuso_horario text not null default 'America/Sao_Paulo',
  pedido_minimo numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  -- Chave manual "fechar agora", independente do horário.
  aceitando_pedidos boolean not null default true,
  pix_expiracao_minutos integer not null default 30
    check (pix_expiracao_minutos between 5 and 1440),
  updated_at timestamptz not null default now()
);
create trigger trg_configuracoes_updated_at before update on public.configuracoes
  for each row execute function public.set_updated_at();
insert into public.configuracoes default values;

-- Turnos de funcionamento. Um dia pode ter mais de um turno. Se `fecha` <=
-- `abre`, o turno termina no dia seguinte (ex.: 18:00 -> 00:30).
create table public.horarios_funcionamento (
  id uuid primary key default gen_random_uuid(),
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0 = domingo
  abre time not null,
  fecha time not null,
  check (abre <> fecha)
);
create index idx_horarios_dia on public.horarios_funcionamento (dia_semana);

-- PROVISÓRIO: aberto o dia todo, para permitir testes. Ajustar no painel
-- (Fase 4) antes de ir para produção.
insert into public.horarios_funcionamento (dia_semana, abre, fecha)
select d, '00:00', '23:59' from generate_series(0, 6) as d;

create table public.bairros_entrega (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  taxa numeric(10,2) not null check (taxa >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index bairros_entrega_nome_key on public.bairros_entrega (lower(nome));

-- Leitura pública: o cardápio web mostra horário e bairros atendidos. Escrita
-- só pelo backend (service_role) até as policies do painel (Fase 2).
alter table public.configuracoes enable row level security;
alter table public.horarios_funcionamento enable row level security;
alter table public.bairros_entrega enable row level security;

create policy configuracoes_leitura_publica on public.configuracoes
  for select using (true);
create policy horarios_leitura_publica on public.horarios_funcionamento
  for select using (true);
create policy bairros_leitura_publica on public.bairros_entrega
  for select using (ativo = true);
