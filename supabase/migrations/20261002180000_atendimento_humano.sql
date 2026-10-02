-- Atendimento humano: o painel vê as conversas, responde e pausa a IA por chat.
--
-- `atendimentos` é por chat (canal + chat_id), não por conversa: a pausa da IA
-- precisa sobreviver ao fim/expiração da conversa ("só volta pelo botão").

create table public.atendimentos (
  canal text not null check (canal in ('telegram', 'whatsapp')),
  chat_id text not null,
  cliente_nome text,
  -- IA não responde este chat enquanto true; só o atendente devolve.
  ia_pausada boolean not null default false,
  pausada_em timestamptz,
  pausada_por text check (pausada_por in ('ia', 'atendente')),
  motivo text,
  -- Aviso no painel: a IA pediu ajuda ou o cliente escreveu num chat pausado.
  precisa_atencao boolean not null default false,
  ultima_mensagem text,
  ultima_mensagem_autor text check (ultima_mensagem_autor in ('cliente', 'ia', 'atendente', 'sistema')),
  ultima_mensagem_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (canal, chat_id)
);
create index atendimentos_recentes_idx on public.atendimentos (ultima_mensagem_em desc);
create index atendimentos_atencao_idx on public.atendimentos (precisa_atencao) where precisa_atencao;
create trigger trg_atendimentos_updated_at before update on public.atendimentos
  for each row execute function public.set_updated_at();

-- Quem escreveu cada mensagem (antigas ficam null = cliente/IA pelo papel).
alter table public.conversa_mensagens
  add column autor text check (autor in ('cliente', 'ia', 'atendente', 'sistema')),
  add column autor_id uuid references auth.users(id) on delete set null;

-- Saída do atendente: o painel insere, o bot envia pelo canal (Realtime + varredura)
-- e grava a mensagem no histórico da conversa.
create table public.mensagens_atendente (
  id bigint generated always as identity primary key,
  canal text not null check (canal in ('telegram', 'whatsapp')),
  chat_id text not null,
  texto text not null check (char_length(btrim(texto)) between 1 and 4000),
  autor_id uuid not null default auth.uid() references auth.users(id),
  tentativas integer not null default 0,
  ultimo_erro text,
  enviada_em timestamptz,
  created_at timestamptz not null default now()
);
create index mensagens_atendente_pendentes_idx on public.mensagens_atendente (created_at)
  where enviada_em is null;

-- Responder = assumir: a IA para e o aviso some.
create function public.assumir_ao_responder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.atendimentos (canal, chat_id, ia_pausada, pausada_em, pausada_por, precisa_atencao)
  values (new.canal, new.chat_id, true, now(), 'atendente', false)
  on conflict (canal, chat_id) do update
    set ia_pausada = true,
        pausada_em = coalesce(public.atendimentos.pausada_em, now()),
        pausada_por = coalesce(public.atendimentos.pausada_por, 'atendente'),
        precisa_atencao = false;
  return new;
end;
$$;
revoke all on function public.assumir_ao_responder() from public, anon, authenticated;
create trigger trg_mensagens_atendente_assumir after insert on public.mensagens_atendente
  for each row execute function public.assumir_ao_responder();

-- RLS: só admin (o bot usa service_role).
alter table public.atendimentos enable row level security;
alter table public.mensagens_atendente enable row level security;

create policy admin_tudo on public.atendimentos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_leitura on public.mensagens_atendente for select to authenticated
  using (public.eh_admin());
create policy admin_insere on public.mensagens_atendente for insert to authenticated
  with check (public.eh_admin() and autor_id = auth.uid());
create policy admin_leitura on public.conversas for select to authenticated
  using (public.eh_admin());
create policy admin_leitura on public.conversa_mensagens for select to authenticated
  using (public.eh_admin());

alter publication supabase_realtime add table public.atendimentos;
alter publication supabase_realtime add table public.conversa_mensagens;
alter publication supabase_realtime add table public.mensagens_atendente;
