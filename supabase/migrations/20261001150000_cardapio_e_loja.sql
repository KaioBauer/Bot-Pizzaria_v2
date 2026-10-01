-- Fase 4: cardápio público, CRUD do cardápio e configurações da loja.

-- Ordem manual de produtos dentro da categoria e de variações dentro do produto.
alter table public.produtos add column ordem integer not null default 0;
alter table public.variacoes_produto add column ordem integer not null default 0;
alter table public.categorias add column ativo boolean not null default true;

-- Links "Pedir pelo WhatsApp/Telegram" do cardápio público.
alter table public.configuracoes
  add column whatsapp_numero text,      -- só dígitos, com DDI: 5511987654321
  add column telegram_usuario text,     -- usuário do bot, sem @
  add column instagram text;

-- Categoria inativa some do cardápio público (os produtos continuam salvos).
drop policy cardapio_publico_categorias on public.categorias;
create policy cardapio_publico_categorias on public.categorias
  for select using (ativo = true);

-- Fotos dos produtos: leitura pública, escrita só do painel (admin).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']);

create policy produtos_fotos_admin_insere on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.eh_admin());
create policy produtos_fotos_admin_altera on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.eh_admin());
create policy produtos_fotos_admin_remove on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.eh_admin());
