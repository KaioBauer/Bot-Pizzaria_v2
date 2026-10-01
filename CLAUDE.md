# Vianna Pizzaria — sistema de pedidos com IA

Chatbot de pedidos (Telegram e WhatsApp), painel da pizzaria, impressão térmica,
cardápio web e Pix. Monorepo pnpm, TypeScript strict, Supabase.

## Comandos

```bash
pnpm install
pnpm check            # typecheck de todos os pacotes + testes (rodar antes de entregar)
pnpm test             # vitest
pnpm dev              # bot + web juntos (Iniciar.cmd faz o mesmo com dois cliques)
pnpm dev:bot          # bot (Telegram em polling), lê apps/bot/.env
pnpm dev:web          # painel + cardápio, lê apps/web/.env.local
pnpm db:types         # regenera packages/db/src/database.types.ts do banco linkado
```

Supabase CLI (já linkada ao projeto `sbgoulnxewybjeielvua`):
`pnpm exec supabase migration new <nome>`, `pnpm exec supabase db push --linked --dry-run`.
Consultas de leitura: `pnpm exec supabase db query --linked "<sql>"`.

## Estrutura e dependências

```
packages/shared  tipos de domínio, schemas Zod das tools, máquina de status, dinheiro, portas (interfaces de repositório)
packages/db      cliente Supabase tipado + repositórios que implementam as portas do shared
packages/core    agente (LLM + tools), precificação, horário, montagem do pedido — NÃO conhece canal nem Supabase
apps/bot         Fastify + adaptadores de canal (ChannelAdapter), webhooks; compõe core + db
apps/web         Next.js: painel (/admin) e cardápio público (/cardapio)
apps/print-agent roda no PC da pizzaria: Realtime + varredura -> cupom ESC/POS -> impressora
supabase/        config da CLI + migrations
```

Direção das dependências: `shared` ← `db`, `shared` ← `core`, apps ← todos.
`core` recebe `Repositorios` (interfaces em `shared/src/portas.ts`) e um `LlmProvider`
por injeção — por isso é testado com implementações em memória (`core/src/testes/`).

## Decisões de arquitetura

- **Preço é sempre do servidor.** O LLM só informa IDs (produto/variação) e quantidades.
  `core/src/precificacao.ts` relê as variações do banco, recalcula tudo e rejeita item
  inexistente/inativo devolvendo o erro ao modelo. Nenhum valor monetário do LLM é usado.
- **Dinheiro em centavos inteiros** em todo o domínio (sufixo `Centavos`). Conversão
  `numeric` ↔ centavos só nos repositórios (`paraCentavos`/`paraReais`).
- **Item do pedido = sabores (1 a 6) + adicionais.** Vários sabores: diferentes, mesmo
  tamanho, até `tamanhos_pizza.max_sabores` (Média/Grande 2, Big 3, Gigante/Família 4).
  Preço = `preco_base` do tamanho + Σ(preço do sabor − base), ou seja, cada sabor especial
  soma o seu adicional; tamanho fora de `tamanhos_pizza` cai no "mais caro", até 2 sabores.
  O preço de cada tamanho do sabor fica gravado na variação (base + adicional); mudar o
  `preco_base` reajusta todos via trigger. Borda/adicional soma; no máximo 1 borda. Detalhe em
  `itens_pedido_componentes`; `itens_pedido.produto_id/variacao_id` = primeiro sabor.
- **Snapshots no pedido:** nome do cliente, telefone, endereço formatado, descrição e preço
  de cada item ficam congelados — editar cardápio/cliente não altera pedido antigo.
- **Gravação atômica** via RPC `criar_pedido(p_pedido jsonb)` (cliente + endereço +
  pedido + itens + número diário). Executável só por `service_role`.
- **Número do pedido reinicia por dia** (fuso da loja), via `pedido_contadores`.
- **Taxa de entrega por bairro** (`bairros_entrega`). Sem bairros cadastrados = só retirada.
- **Horário/loja** em `configuracoes` (linha única) + `horarios_funcionamento` (turnos;
  `fecha <= abre` atravessa a meia-noite). Fechada: o prompt avisa e as tools
  `calcular_pedido`/`finalizar_pedido` recusam no servidor.
- **Agente:** tools `consultar_cardapio`, `calcular_pedido` (cotação oficial para o resumo),
  `finalizar_pedido`, `consultar_status_pedido`. A confirmação do pedido é montada pelo
  código (`mensagemPedidoConfirmado`), não pelo LLM. `processarMensagem` nunca lança.
- **Histórico** em `conversas`/`conversa_mensagens` (formato neutro). Janela de
  `HISTORICO_LIMITE` mensagens, recortada para começar numa mensagem do cliente.
  Conversa encerra ao finalizar pedido ou após `CONVERSA_EXPIRACAO_MINUTOS` parada.
- **LLM atrás de `LlmProvider`** (`core/src/llm`). OpenAI Chat Completions; modelos gpt-5.x
  com tools exigem `reasoning_effort: "none"` nessa API.
- **Formatação para chat:** só `*negrito*`/`_itálico_`. `normalizarFormatacao` corrige o
  que o modelo gerar (`**`, `#`).
- **Bot:** mensagens do mesmo chat são processadas em série e as que chegam durante o
  processamento são agrupadas (`apps/bot/src/processador.ts`). O adaptador nunca aguarda
  o agente dentro do webhook (evita reentrega do Telegram por timeout).
- **Status:** `aguardando_pagamento → novo → em_preparo → saiu_para_entrega | pronto_para_retirada → concluido`,
  e `cancelado` a partir de qualquer não final. Regras em `shared/src/status.ts`;
  histórico gravado por trigger em `pedido_status_historico`.
- **Pix** só é oferecido quando o gateway estiver configurado (`pixDisponivel`); pedido
  Pix nasce `aguardando_pagamento`, os demais `novo`.

- **Papéis** em `auth.users.app_metadata.papel` (`admin`, `impressora`), checados no RLS por
  `eh_admin()`/`eh_impressora()` e no painel por `exigirAdmin()`. Logado sem papel = sem acesso.
  Criar com `pnpm usuario admin <email>` / `pnpm usuario impressora`.
- **Painel** usa a sessão do usuário (RLS) — assim o histórico de status registra quem mudou.
  service_role no web só em `lib/db.ts` (telas antigas de cardápio). Mudança de status valida a
  máquina de status e faz update condicional (`.eq("status", de)`) contra edição concorrente.
- **Realtime no navegador:** chamar `realtime.setAuth(token)` antes de assinar o canal; senão
  conecta como anônimo e o RLS não entrega eventos (`pedidos/quadro.tsx`).
- **Notificação ao cliente** é outbox: trigger grava `notificacoes_cliente` a cada mudança de
  status; o bot (`apps/bot/src/notificador.ts`) envia via Realtime + varredura e só o status
  mais recente de cada pedido.
- **Impressão:** print-agent com usuário `impressora` (nunca service_role). Imprime pedidos não
  impressos fora de `aguardando_pagamento`/`cancelado` e reimpressões; marca via RPC
  `marcar_pedido_impresso` só depois que a impressora aceitou (duplicar > perder). USB no Windows
  = RAW pelo spooler (`transporte/windows.ts`). Sem os VT do `cut()` da biblioteca (gastam papel).
- **Varreduras** (impressão, notificação) usam `execucaoUnica` do shared: nunca em paralelo,
  chamadas durante a execução geram uma repetição.
- **Next 16:** `proxy.ts` (não middleware), `cookies()`/`params` assíncronos, Tailwind 4.
  Docs da versão em `apps/web/node_modules/next/dist/docs/`.

- **Pix:** `packages/core/src/pagamentos` — `GatewayPix` (OpenPix/Woovi em `openpix.ts`, via
  fetch, sem SDK; `correlationID` = id do pedido; QR gerado localmente do brCode; webhook
  RSA-SHA256 sobre o corpo cru, chaves de `/api/v1/webhook/public-keys`) + `criarServicoPix`. Pedido Pix nasce `aguardando_pagamento`; status
  real sempre relido na API (webhook não é confiável); conferência periódica cobre webhook
  perdido e expira vencidos; pago em pedido cancelado -> estorno. Falha ao gerar a cobrança
  descarta o pedido (`descartarAguardandoPagamento`, sem notificar). Copia-e-cola enviado
  com `{ literal: true }` (contém "*", que o Markdown do Telegram comeria).
- **WhatsApp:** `apps/bot/src/canais/whatsapp.ts` (Evolution API v2). Webhook com token na URL;
  ignora grupos, status, canais, próprio número, reentregas e mensagens antigas. No compose a
  Evolution chama o bot pela rede interna.
- **Web sem service_role:** todo acesso do painel usa a sessão do admin (RLS); cardápio público
  usa anon (`lib/supabase/publico.ts`). Fotos no bucket `produtos` (escrita só admin).
- **Relatórios:** views `relatorio_vendas_diarias` e `relatorio_produtos_vendidos` com
  `security_invoker` (respeitam RLS); pizza de N sabores conta 1/N para cada sabor.
- **Deploy:** Dockerfiles em `apps/bot` e `apps/web` (contexto = raiz), `docker-compose.yml`
  com perfil `whatsapp`, Nginx em `deploy/nginx`. Passo a passo: `docs/DEPLOY.md`.

## Convenções

- Código, nomes e mensagens em português; termos técnicos consagrados podem ficar em
  inglês (`ChannelAdapter`, `sendMessage`).
- Repositórios usam `exigir(resultado, contexto)` para transformar erro do Supabase em `ErroBanco`.
- Configuração de app validada com Zod no boot (`apps/bot/src/config.ts`); cada app tem
  seu `.env` + `.env.example`. Nunca commitar `.env`.
- Logs com pino (`logger.child({ modulo })`); o core usa a interface mínima `Logger`.
- Testes ao lado do código (`*.test.ts`), Vitest na raiz. Regra de negócio nova = teste novo.
- Schema só muda por migration em `supabase/migrations/`, aprovada pelo dono antes do
  `db push`. Depois de aplicar: `pnpm db:types`.
- Na dúvida sobre regra de negócio, perguntar em vez de inventar.

## Pendências conhecidas

- `horarios_funcionamento` está provisoriamente 24h e `bairros_entrega` vazia — ajustar em
  /admin/configuracoes antes de produção.
- Pix e WhatsApp testados com gateway/payloads simulados; validar com credenciais reais.
