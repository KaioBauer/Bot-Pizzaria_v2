-- criar_pedido v2: grava cliente, endereço, pedido, itens e componentes numa
-- única transação e atribui o número diário do pedido.
--
-- Recebe valores JÁ revalidados pelo núcleo (@pizzaria/core): esta função não
-- calcula preço. Por isso só o backend (service_role) pode executá-la — a v1
-- estava executável por anon/authenticated.

drop function public.criar_pedido(uuid, text, uuid, text, numeric, text, jsonb);

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
begin
  if jsonb_array_length(coalesce(p_pedido->'itens', '[]'::jsonb)) = 0 then
    raise exception 'Pedido precisa ter ao menos um item';
  end if;

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
    status, subtotal, taxa_entrega, valor_total, observacoes
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
    p_pedido->>'observacoes'
  )
  returning id into v_pedido_id;

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
      item_id, tipo, produto_id, variacao_id, produto_nome, variacao_nome, preco
    )
    select
      v_item_id,
      c->>'tipo',
      (c->>'produto_id')::uuid,
      (c->>'variacao_id')::uuid,
      c->>'produto_nome',
      c->>'variacao_nome',
      (c->>'preco')::numeric
    from jsonb_array_elements(v_item->'componentes') as c;
  end loop;

  return jsonb_build_object('id', v_pedido_id, 'numero', v_numero);
end;
$$;

revoke all on function public.criar_pedido(jsonb) from public, anon, authenticated;
grant execute on function public.criar_pedido(jsonb) to service_role;
