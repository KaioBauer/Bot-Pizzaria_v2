-- Fases 2 e 3: acesso do painel e do print-agent, Realtime e fila de
-- notificações ao cliente.
--
-- Papéis vêm de auth.users.raw_app_meta_data->>'papel', que só a service_role
-- altera. Estar logado NÃO basta: o cadastro público do Supabase criaria
-- usuários "authenticated" com acesso aos pedidos.
--   admin      -> painel (lê e altera dados operacionais e cardápio)
--   impressora -> print-agent (lê pedidos e marca como impresso)

create function public.papel_atual()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'papel', '');
$$;

create function public.eh_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.papel_atual() = 'admin';
$$;

create function public.eh_impressora()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.papel_atual() = 'impressora';
$$;

-- Painel ------------------------------------------------------------------------

create policy admin_tudo on public.categorias for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_tudo on public.produtos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_tudo on public.variacoes_produto for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_tudo on public.configuracoes for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_tudo on public.horarios_funcionamento for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_tudo on public.bairros_entrega for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_tudo on public.pedidos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_tudo on public.itens_pedido for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_tudo on public.itens_pedido_componentes for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy admin_leitura on public.pedido_status_historico for select to authenticated
  using (public.eh_admin());
create policy admin_leitura on public.clientes for select to authenticated
  using (public.eh_admin());
create policy admin_leitura on public.enderecos for select to authenticated
  using (public.eh_admin());

-- Print-agent -------------------------------------------------------------------

create policy impressora_leitura on public.pedidos for select to authenticated
  using (public.eh_impressora());
create policy impressora_leitura on public.itens_pedido for select to authenticated
  using (public.eh_impressora());
create policy impressora_leitura on public.itens_pedido_componentes for select to authenticated
  using (public.eh_impressora());

-- A impressora não tem UPDATE em pedidos: só marca a impressão por esta função.
-- Reimpressão: o painel grava `reimpressao_solicitada_em`; o agente imprime e
-- informa o valor que viu, que só é limpo se não houve novo pedido depois.
create function public.marcar_pedido_impresso(
  p_pedido_id uuid,
  p_reimpressao_atendida timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.eh_impressora() or public.eh_admin()) then
    raise exception 'Sem permissão para marcar impressão' using errcode = '42501';
  end if;

  update public.pedidos
  set impresso_em = coalesce(impresso_em, now()),
      reimpressao_solicitada_em = case
        when p_reimpressao_atendida is not null
          and reimpressao_solicitada_em <= p_reimpressao_atendida then null
        else reimpressao_solicitada_em
      end
  where id = p_pedido_id;
end;
$$;
revoke all on function public.marcar_pedido_impresso(uuid, timestamptz) from public, anon;
grant execute on function public.marcar_pedido_impresso(uuid, timestamptz) to authenticated;

-- Notificações ao cliente (outbox) ------------------------------------------------
-- Toda mudança de status gera uma linha; o bot envia pelo canal de origem e
-- marca `enviada_em`. Se o bot estiver fora do ar, envia quando voltar.

create table public.notificacoes_cliente (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  status text not null,
  tentativas integer not null default 0,
  ultimo_erro text,
  enviada_em timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notificacoes_pendentes on public.notificacoes_cliente (created_at)
  where enviada_em is null;
alter table public.notificacoes_cliente enable row level security;
create policy admin_leitura on public.notificacoes_cliente for select to authenticated
  using (public.eh_admin());

create or replace function public.registrar_historico_status()
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
  -- Na criação o bot já confirma na conversa; só mudanças geram notificação.
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.notificacoes_cliente (pedido_id, status) values (new.id, new.status);
  end if;
  return new;
end;
$$;

-- Realtime ------------------------------------------------------------------------
-- O Realtime aplica o RLS acima: o painel e a impressora só recebem o que podem ler.

alter publication supabase_realtime add table public.pedidos;
alter publication supabase_realtime add table public.notificacoes_cliente;
