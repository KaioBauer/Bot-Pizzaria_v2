-- Tamanhos de pizza do cardápio real: fatias, limite de sabores e preço base.
--
-- Regra de preço (núcleo): pizza = preço base do tamanho + adicional de cada
-- sabor + borda. O adicional de um sabor é (preço da variação do produto -
-- preço base do tamanho): Salgadas/Doces custam o próprio base (adicional 0),
-- Nobres/Premium/Gourmet custam base + adicional.
--
-- Trocar o preço base de um tamanho reajusta automaticamente esse tamanho em
-- todos os produtos, preservando o adicional de cada um.

create table public.tamanhos_pizza (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  fatias integer not null check (fatias > 0),
  max_sabores integer not null check (max_sabores between 1 and 6),
  preco_base numeric(10,2) not null check (preco_base > 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index tamanhos_pizza_nome_key on public.tamanhos_pizza (lower(nome));

alter table public.tamanhos_pizza enable row level security;
create policy tamanhos_leitura_publica on public.tamanhos_pizza for select using (true);
create policy admin_tudo on public.tamanhos_pizza for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create function public.reajustar_tamanho_nos_produtos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.preco_base is distinct from old.preco_base then
    update public.variacoes_produto
    set preco = preco + (new.preco_base - old.preco_base)
    where tipo = 'tamanho' and lower(nome) = lower(old.nome);
  end if;
  if lower(new.nome) is distinct from lower(old.nome) then
    update public.variacoes_produto
    set nome = new.nome
    where tipo = 'tamanho' and lower(nome) = lower(old.nome);
  end if;
  return new;
end;
$$;

create trigger trg_tamanhos_pizza_reajuste
  after update on public.tamanhos_pizza
  for each row execute function public.reajustar_tamanho_nos_produtos();
