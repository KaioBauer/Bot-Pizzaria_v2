# Vianna Pizzaria — sistema de pedidos com IA

Chatbot que atende e fecha pedidos no **WhatsApp**, painel da pizzaria em
tempo real, **impressão automática** em impressora térmica, **cardápio web** e **Pix** integrado.
Decisões de arquitetura e convenções: [`CLAUDE.md`](CLAUDE.md). Deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md).

| Fase | Escopo | Situação |
|---|---|---|
| 1 | Monorepo, `db`, `core`, agente no Telegram gravando pedido | ✅ |
| 2 | Painel com pedidos em tempo real + notificação do cliente | ✅ |
| 3 | `print-agent` (impressora térmica) | ✅ |
| 4 | Cardápio público, CRUD de cardápio e configurações | ✅ |
| 5 | Pix simulado (BR Code real, Banco simulado no painel) | ✅ (liga com `PIX_SIMULADO`) |
| 6 | WhatsApp (Evolution API) | ✅ (liga com `WHATSAPP_ENABLED`) |
| 7 | Relatórios, Docker e deploy | ✅ |

## Como funciona

```
Cliente ── WhatsApp ──► apps/bot ──► packages/core (agente LLM + regras) ──► Supabase
                                     │   ▲                                               │  │
                 Pix simulado ───┘   └── notificações de status (outbox) ◄───────────┘  │ Realtime
                                                                                            ▼
                                       apps/web (painel /admin + cardápio /cardapio)   apps/print-agent (PC da loja)
```

## Requisitos

- Node.js 22+ e pnpm 11 (`corepack enable`)
- Projeto Supabase com as migrations de `supabase/migrations` aplicadas
- Chave da OpenAI e a Evolution API (WhatsApp); o painel conecta o número em *Configurações → WhatsApp*

## Setup

```bash
pnpm install
cp apps/bot/.env.example apps/bot/.env                  # preencher
cp apps/web/.env.example apps/web/.env.local            # preencher
cp apps/print-agent/.env.example apps/print-agent/.env  # no PC da pizzaria
pnpm check                                              # typecheck + testes
```

Banco: ver [`supabase/README.md`](supabase/README.md).

### Usuários (papéis)

Acesso é por papel em `app_metadata.papel` — estar logado não basta.

```bash
pnpm usuario admin seu@email.com   # login do painel (pede a senha no terminal)
pnpm usuario impressora            # usuário do print-agent; grava as credenciais em apps/print-agent/.env
```

Recomendado: Supabase → Authentication → Sign In / Providers → desligar "Allow new users to sign up".

### Cardápio real

```bash
pnpm cardapio:importar   # tamanhos, sabores, bordas, fotos, bairros e telefone (supabase/seed/cardapio-vianna.ts)
```

Idempotente: rodar de novo atualiza preços e descrições pelo nome, sem duplicar. Depois, os
ajustes do dia a dia ficam no painel: preço base, fatias e sabores de cada tamanho em
*Configurações → Tamanhos de pizza* e o adicional por sabor de cada categoria em
*Cardápio → Editar*.

No cardápio público o cliente monta o pedido (tamanho, sabores, borda, bebidas) e toca em
*Pedir no WhatsApp*: o bot recebe o carrinho, confere os preços e segue com entrega ou
retirada e pagamento. Precisa do número do bot em *Configurações → Loja*.

## Rodando em desenvolvimento

```bash
pnpm dev       # bot (WhatsApp) + painel/cardápio, juntos, num terminal só
```

No Windows, dá para ligar com dois cliques em **`Iniciar.cmd`** (abre o painel no navegador).
Separado: `pnpm dev:bot` (http://localhost:3001/health) e `pnpm dev:web` (http://localhost:3000/admin).
A impressão roda à parte, como serviço do Windows (ver abaixo).

### Print-agent (PC da pizzaria)

```bash
pnpm --filter @pizzaria/print-agent dev               # testar no terminal
# Serviço do Windows (terminal "Executar como administrador"):
pnpm --filter @pizzaria/print-agent servico:instalar
pnpm --filter @pizzaria/print-agent servico:remover
```

O serviço aparece como "Vianna Print Agent" em `services.msc`; logs em `apps/print-agent/logs/`.
Impressora USB: `PRINTER_INTERFACE=windows:NOME` (nome de `Get-Printer`), impressão RAW pelo
spooler — não precisa compartilhar. Rede: `tcp://IP:9100`.

## Painel (`/admin`)

- **Pedidos**: quadro em tempo real por status, alerta sonoro, detalhes, avançar/cancelar/reimprimir.
  Cada mudança avisa o cliente no canal de origem.
- **Cardápio**: categorias, produtos, tamanhos/bordas/adicionais, preços, fotos, disponível/esgotado.
- **Configurações**: dados da loja, horários (turnos, inclusive após meia-noite), bairros e taxas,
  pedido mínimo, prazo do Pix. "Pausar pedidos" no topo do painel.
- **Relatórios**: faturamento e pedidos por dia, ticket médio, cancelados, mais vendidos.

## Variáveis de ambiente

### `apps/bot/.env`

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `NODE_ENV` | | `development` | `development` liga logs legíveis (pino-pretty) |
| `PORT` | | `3001` | Porta HTTP (health + webhooks) |
| `LOG_LEVEL` | | `info` | `fatal`…`trace` |
| `PUBLIC_URL` | webhooks | | URL pública HTTPS do bot |
| `SUPABASE_URL` | ✅ | | URL do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | | Chave service_role (só servidor) |
| `OPENAI_API_KEY` | ✅ | | |
| `OPENAI_MODEL` | | `gpt-5.4` | Modelo do agente (o mini erra mais o fluxo do pedido) |
| `OPENAI_REASONING_EFFORT` | | `none` | Só modelos gpt-5*; com tools no Chat Completions use `none` |
| `CARDAPIO_URL` | | | Link do cardápio público que o bot envia |
| `CONVERSA_EXPIRACAO_MINUTOS` | | `180` | Conversa parada por mais tempo recomeça |
| `HISTORICO_LIMITE` | | `40` | Mensagens do histórico enviadas ao modelo |
| `PIX_SIMULADO` | | `false` | Liga o Pix simulado (sem dinheiro de verdade) |
| `PIX_SIMULADO_CIDADE` | | `SAO PAULO` | Cidade do recebedor no BR Code |
| `PIX_SIMULADO_CHAVE` | | chave fictícia | Chave aleatória (EVP) dentro do BR Code |
| `PIX_SIMULADO_SEGREDO` | | aleatório | Segredo do HMAC dos webhooks |
| `PIX_SIMULADO_PERDA_WEBHOOK` | | `0` | Fração de webhooks descartados (teste da conferência) |
| `PIX_CONFERENCIA_SEGUNDOS` | | `60` | Conferência periódica dos Pix pendentes |
| `WHATSAPP_ENABLED` | | `true` | Canal de conversa (desligar só para rodar sem a Evolution) |
| `EVOLUTION_URL` | c/ WhatsApp | | URL da Evolution API (`http://evolution:8080` no compose) |
| `EVOLUTION_API_KEY` | c/ WhatsApp | | Chave da Evolution |
| `EVOLUTION_INSTANCIA` | | `vianna` | Nome da instância |
| `WHATSAPP_WEBHOOK_TOKEN` | c/ WhatsApp | | Segredo na URL do webhook (≥ 16 caracteres) |

### `apps/web/.env.local`

Só a chave **anon** — o painel acessa tudo pelo login do admin e pelo RLS.

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon |

### `apps/print-agent/.env`

| Variável | Padrão | Descrição |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | | Projeto e chave **anon** (nunca a service_role neste PC) |
| `IMPRESSORA_EMAIL` / `IMPRESSORA_SENHA` | | Gerados por `pnpm usuario impressora` |
| `PRINTER_INTERFACE` | | `windows:POS-58` ou `tcp://192.168.0.50:9100` |
| `PRINTER_LARGURA_MM` | `58` | `58` (32 colunas) ou `80` (48); `PRINTER_COLUNAS` sobrescreve |
| `PRINTER_MODELO` | `generico` | `epson`, `elgin`, `bematech`, `star`, `generico` |
| `PRINTER_PAGINA_CODIGO` | `PC860_PORTUGUESE` | Acentos; `nenhuma` remove acentos |
| `PRINTER_AVANCO_CORTE` | `3` | Linhas em branco antes do corte |
| `PRINTER_VIAS` | `1` | Cópias por pedido |
| `VARREDURA_SEGUNDOS` | `30` | Conferência periódica da fila, além do tempo real |

### `.env` da raiz (docker-compose)

Ver [`deploy/.env.example`](deploy/.env.example): variáveis públicas do build do web e segredos da Evolution.

## Testes

`pnpm test` cobre: revalidação de preço (vários sabores por tamanho, borda, itens inativos, bairro, pedido
mínimo), validação do payload de `finalizar_pedido`, máquina de status, horário de
funcionamento e próxima abertura, fluxo do agente com LLM roteirizado, Pix (confirmação
idempotente, valor divergente, expiração, estorno, assinatura do webhook), adaptador
WhatsApp, fila de mensagens por chat, layout do cupom, notificações e regras do quadro.
