-- Trava de impressão: com mais de um print-agent ligado (ex.: serviço do
-- Windows + um rodando no terminal, ou dois PCs), só um imprime cada pedido.
-- O agente reivindica o pedido antes de imprimir; a reivindicação vence em
-- 2 minutos (agente travou no meio) e é liberada ao marcar como impresso.

alter table public.pedidos
  add column impressao_reivindicada_em timestamptz,
  add column impressao_reivindicada_por text;

create function public.reivindicar_impressao(p_pedido_id uuid, p_agente text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if not (public.eh_impressora() or public.eh_admin()) then
    raise exception 'Sem permissão para imprimir' using errcode = '42501';
  end if;

  update public.pedidos
  set impressao_reivindicada_em = now(),
      impressao_reivindicada_por = p_agente
  where id = p_pedido_id
    -- ainda há o que imprimir: primeira via ou reimpressão pedida
    and (impresso_em is null or reimpressao_solicitada_em is not null)
    -- ninguém está imprimindo agora (ou quem estava travou)
    and (
      impressao_reivindicada_em is null
      or impressao_reivindicada_em < now() - interval '2 minutes'
      or impressao_reivindicada_por = p_agente
    )
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;
revoke all on function public.reivindicar_impressao(uuid, text) from public, anon;
grant execute on function public.reivindicar_impressao(uuid, text) to authenticated;

-- Marcar como impresso também libera a trava.
create or replace function public.marcar_pedido_impresso(
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
      impressao_reivindicada_em = null,
      impressao_reivindicada_por = null,
      reimpressao_solicitada_em = case
        when p_reimpressao_atendida is not null
          and reimpressao_solicitada_em <= p_reimpressao_atendida then null
        else reimpressao_solicitada_em
      end
  where id = p_pedido_id;
end;
$$;
