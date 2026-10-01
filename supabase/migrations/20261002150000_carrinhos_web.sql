-- Carrinho montado no cardápio do site e enviado ao bot.
-- O link do Telegram (t.me/<bot>?start=<payload>) só leva 64 caracteres, então o
-- carrinho fica aqui e o link leva só o código curto (start=c_<codigo>).
-- Itens no mesmo formato das tools do agente (sabores/adicionais por ID); o bot
-- reprecifica tudo no servidor, então o conteúdo aqui nunca define preço.

create table public.carrinhos_web (
  codigo text primary key,
  itens jsonb not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '24 hours',
  usado_em timestamptz
);

create index carrinhos_web_expira_em_idx on public.carrinhos_web (expira_em);

-- RLS ligado e sem políticas: anon/authenticated não leem nem escrevem direto.
-- O cardápio só cria via função abaixo; o bot (service_role) consome.
alter table public.carrinhos_web enable row level security;

create or replace function public.criar_carrinho_web(p_itens jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_item jsonb;
begin
  if jsonb_typeof(p_itens) is distinct from 'array'
     or jsonb_array_length(p_itens) = 0
     or jsonb_array_length(p_itens) > 30
     or octet_length(p_itens::text) > 16000 then
    raise exception 'Carrinho inválido' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item->'sabores') is distinct from 'array'
       or jsonb_array_length(v_item->'sabores') not between 1 and 6 then
      raise exception 'Item do carrinho inválido' using errcode = '22023';
    end if;
  end loop;

  -- Faxina: carrinhos vencidos há mais de 7 dias.
  delete from public.carrinhos_web where expira_em < now() - interval '7 days';

  v_codigo := encode(extensions.gen_random_bytes(8), 'hex');
  insert into public.carrinhos_web (codigo, itens) values (v_codigo, p_itens);
  return v_codigo;
end;
$$;

revoke all on function public.criar_carrinho_web(jsonb) from public;
grant execute on function public.criar_carrinho_web(jsonb) to anon, authenticated, service_role;
