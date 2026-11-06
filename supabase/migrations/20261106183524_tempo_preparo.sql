-- Tempo médio até o pedido ficar pronto/chegar, editável em Configurações → Pizzaria.
-- Vai na mensagem do WhatsApp quando o pedido entra em preparo (tempo médio + horário previsto).
alter table public.configuracoes
  add column tempo_entrega_minutos integer not null default 45
    check (tempo_entrega_minutos between 5 and 240),
  add column tempo_retirada_minutos integer not null default 30
    check (tempo_retirada_minutos between 5 and 240);

comment on column public.configuracoes.tempo_entrega_minutos is 'Tempo médio (min) do início do preparo até a entrega';
comment on column public.configuracoes.tempo_retirada_minutos is 'Tempo médio (min) do início do preparo até ficar pronto para retirar';
