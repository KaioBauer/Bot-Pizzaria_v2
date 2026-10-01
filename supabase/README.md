# Supabase

O schema é versionado em `migrations/`. A primeira (`*_baseline.sql`) reproduz o schema
que existia antes das migrations; no projeto remoto ela está marcada como aplicada e não
é executada.

## Fluxo para mudar o schema

```bash
pnpm exec supabase migration new descricao_curta     # cria o arquivo em migrations/
# escrever o SQL e submeter para aprovação
pnpm exec supabase db push --linked --dry-run         # confere o que será aplicado
pnpm exec supabase db push --linked                   # aplica
pnpm db:types                                         # regenera os tipos TypeScript
```

Projeto novo do zero: `supabase link --project-ref <ref>` e `supabase db push` (sem
marcar a baseline como aplicada). Banco local (requer Docker): `supabase start` +
`supabase db reset`.

## Tabelas

| Tabela | Uso |
|---|---|
| `categorias`, `produtos`, `variacoes_produto` | Cardápio. Variação `tipo`: `tamanho`, `borda`, `adicional`, `padrao` |
| `configuracoes` | Linha única: dados da pizzaria, fuso, pedido mínimo, pausa manual, expiração do Pix |
| `horarios_funcionamento` | Turnos por dia da semana (0 = domingo) |
| `bairros_entrega` | Bairros atendidos e taxa de entrega |
| `clientes`, `enderecos` | Cliente por `canal` + `chat_id`; endereço padrão |
| `pedidos` | Pedido com snapshots, número diário (`data_ref` + `numero`) e status |
| `itens_pedido`, `itens_pedido_componentes` | Itens e sua composição (sabores, borda, adicionais) |
| `pedido_status_historico` | Preenchida por trigger a cada mudança de status |
| `pedido_contadores` | Último número de pedido por dia |
| `conversas`, `conversa_mensagens` | Histórico do agente por chat |
| `notificacoes_cliente` | Fila (outbox) de avisos de status ao cliente, enviada pelo bot |
| `pagamentos`, `webhook_eventos` | Cobranças Pix e registro idempotente dos webhooks da OpenPix |
| `relatorio_vendas_diarias`, `relatorio_produtos_vendidos` | Views dos relatórios (security_invoker) |
| Storage `produtos` | Fotos dos produtos (leitura pública, escrita do admin) |

RLS ligado em todas. Papéis em `app_metadata.papel`: `admin` (painel) e `impressora`
(print-agent). Leitura pública: cardápio ativo, configurações, horários e bairros ativos.
O bot usa `service_role`.
