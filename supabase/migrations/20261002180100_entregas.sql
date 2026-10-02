-- Entregas por motoboy: o cupom impresso traz um QR que abre /entrega/<pedido>.
-- O motoboy (papel 'entregador', com login) inicia a entrega e, na casa do
-- cliente, confirma com foto, GPS e (dinheiro/cartão) o valor recebido.

create function public.eh_entregador()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.papel_atual() = 'entregador';
$$;

create table public.entregadores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.entregadores enable row level security;
create policy admin_tudo on public.entregadores for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy entregador_proprio on public.entregadores for select to authenticated
  using (user_id = auth.uid());

alter table public.pedidos
  add column entregador_id uuid references public.entregadores(user_id) on delete set null,
  add column entrega_iniciada_em timestamptz,
  add column entregue_em timestamptz,
  -- Caminho no bucket privado `entregas` (<pedido_id>/<arquivo>).
  add column entrega_foto text,
  add column entrega_lat double precision,
  add column entrega_lng double precision,
  add column entrega_precisao_m real,
  -- Dinheiro: quanto o cliente entregou; cartão: valor passado na maquininha.
  add column valor_recebido numeric(10,2) check (valor_recebido is null or valor_recebido >= 0);
create index pedidos_entregador_idx on public.pedidos (entregador_id, entregue_em desc);

-- Garante que o usuário é um motoboy ativo (ou admin, que pode tudo).
create function public.exigir_entregador()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.eh_admin() then return; end if;
  if not public.eh_entregador()
     or not exists (select 1 from public.entregadores e where e.user_id = auth.uid() and e.ativo) then
    raise exception 'Acesso só para entregadores' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.exigir_entregador() from public, anon;

-- Dados que o motoboy precisa ver (sem dar SELECT em pedidos para o papel).
create function public.entrega_detalhe(p_pedido uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.exigir_entregador();
  select jsonb_build_object(
    'id', p.id,
    'numero', p.numero,
    'status', p.status,
    'tipo_entrega', p.tipo_entrega,
    'cliente_nome', p.cliente_nome,
    'cliente_telefone', p.cliente_telefone,
    'endereco_texto', p.endereco_texto,
    'forma_pagamento', p.forma_pagamento,
    'troco_para', p.troco_para,
    'valor_total', p.valor_total,
    'observacoes', p.observacoes,
    'criado_em', p.created_at,
    'entregador_id', p.entregador_id,
    'entregador_nome', e.nome,
    'entrega_iniciada_em', p.entrega_iniciada_em,
    'entregue_em', p.entregue_em,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('quantidade', i.quantidade, 'descricao', i.descricao, 'observacao', i.observacoes) order by i.created_at)
      from public.itens_pedido i where i.pedido_id = p.id
    ), '[]'::jsonb)
  )
  into v
  from public.pedidos p
  left join public.entregadores e on e.user_id = p.entregador_id
  where p.id = p_pedido;

  if v is null then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

create function public.iniciar_entrega(p_pedido uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pedidos%rowtype;
begin
  perform public.exigir_entregador();
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if p.tipo_entrega <> 'entrega' then raise exception 'Este pedido é para retirada no balcão'; end if;

  if p.status = 'saiu_para_entrega' then
    if p.entregador_id is not distinct from auth.uid() then return; end if; -- QR lido de novo
    raise exception 'Este pedido já saiu com outro entregador';
  end if;
  if p.status not in ('novo', 'em_preparo') then
    raise exception 'Pedido não pode sair para entrega (status: %)', p.status;
  end if;

  -- Mantém a sequência da máquina de status (o histórico registra cada passo).
  if p.status = 'novo' then
    update public.pedidos set status = 'em_preparo' where id = p_pedido;
  end if;
  update public.pedidos
     set status = 'saiu_para_entrega',
         entregador_id = case when public.eh_entregador() then auth.uid() else entregador_id end,
         entrega_iniciada_em = now()
   where id = p_pedido;
end;
$$;

create function public.concluir_entrega(
  p_pedido uuid,
  p_foto text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_precisao_m real default null,
  p_valor_recebido numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pedidos%rowtype;
begin
  perform public.exigir_entregador();
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if p.status <> 'saiu_para_entrega' then
    raise exception 'A entrega precisa ser iniciada antes (status: %)', p.status;
  end if;
  if public.eh_entregador() and p.entregador_id is distinct from auth.uid() then
    raise exception 'Esta entrega é de outro entregador';
  end if;
  if p_foto is null or p_foto not like p_pedido::text || '/%' then
    raise exception 'Foto da entrega obrigatória';
  end if;
  if p.forma_pagamento in ('dinheiro', 'cartao') then
    if p_valor_recebido is null then
      raise exception 'Informe o valor recebido';
    end if;
    if p_valor_recebido < p.valor_total then
      raise exception 'Valor recebido menor que o total do pedido';
    end if;
  end if;

  update public.pedidos
     set status = 'concluido',
         entregue_em = now(),
         entrega_foto = p_foto,
         entrega_lat = p_lat,
         entrega_lng = p_lng,
         entrega_precisao_m = p_precisao_m,
         valor_recebido = case when p.forma_pagamento in ('dinheiro', 'cartao') then p_valor_recebido end
   where id = p_pedido;
end;
$$;

-- Entregas em andamento do motoboy logado (tela inicial do celular).
create function public.minhas_entregas()
returns table (id uuid, numero integer, cliente_nome text, endereco_texto text, entrega_iniciada_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_entregador();
  return query
    select p.id, p.numero, p.cliente_nome, p.endereco_texto, p.entrega_iniciada_em
      from public.pedidos p
     where p.status = 'saiu_para_entrega' and p.entregador_id = auth.uid()
     order by p.entrega_iniciada_em;
end;
$$;

revoke all on function public.entrega_detalhe(uuid) from public, anon;
revoke all on function public.iniciar_entrega(uuid) from public, anon;
revoke all on function public.concluir_entrega(uuid, text, double precision, double precision, real, numeric) from public, anon;
revoke all on function public.minhas_entregas() from public, anon;
grant execute on function public.entrega_detalhe(uuid) to authenticated;
grant execute on function public.iniciar_entrega(uuid) to authenticated;
grant execute on function public.concluir_entrega(uuid, text, double precision, double precision, real, numeric) to authenticated;
grant execute on function public.minhas_entregas() to authenticated;

-- Fotos de entrega: bucket privado. Motoboy envia; só admin vê (URL assinada).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas', 'entregas', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy entregas_fotos_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas' and (public.eh_entregador() or public.eh_admin()));
create policy entregas_fotos_admin_le on storage.objects for select to authenticated
  using (bucket_id = 'entregas' and public.eh_admin());
