# Deploy na VPS (Docker + Nginx)

O que roda onde:

| Onde | O quê |
|---|---|
| VPS (Docker) | `bot` (Telegram, WhatsApp, Pix OpenPix, notificações) e `web` (painel + cardápio). Opcional: `evolution` (WhatsApp) com Postgres e Redis próprios |
| VPS (Nginx) | HTTPS e proxy para os containers |
| Supabase | banco, login, Realtime, fotos |
| PC da pizzaria | `print-agent` como serviço do Windows (ver README) |

Domínios sugeridos: `painel.SEU-DOMINIO` (painel e cardápio em `/cardapio`) e `bot.SEU-DOMINIO` (webhooks).

## 1. Preparar o servidor (uma vez)

```bash
# Docker + plugin compose (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER    # sair e entrar de novo no SSH

# DNS: aponte painel.SEU-DOMINIO e bot.SEU-DOMINIO para o IP da VPS.
git clone https://github.com/KaioBauer/Bot-Pizzaria_v2.git vianna && cd vianna
```

## 2. Variáveis

```bash
cp deploy/.env.example .env              # build do web (+ Evolution, se usar WhatsApp)
cp apps/bot/.env.example apps/bot/.env   # bot
nano .env apps/bot/.env
```

No `apps/bot/.env` de produção:

```ini
NODE_ENV=production
PUBLIC_URL=https://bot.SEU-DOMINIO
TELEGRAM_MODE=webhook
CARDAPIO_URL=https://painel.SEU-DOMINIO/cardapio
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
OPENAI_MODEL=gpt-5.4-mini
# + SUPABASE_*, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN
# Pix: OPENPIX_APP_ID, OPENPIX_AMBIENTE=producao
# WhatsApp: WHATSAPP_ENABLED=true, EVOLUTION_API_KEY, WHATSAPP_WEBHOOK_TOKEN
#           (os mesmos valores do .env da raiz)
```

## 3. Subir

```bash
docker compose up -d --build                       # bot + painel
# ou, com WhatsApp:
docker compose --profile whatsapp up -d --build
docker compose ps                                  # tudo "healthy"
curl -s localhost:3001/health                      # {"ok":true}
```

## 4. Nginx + HTTPS

```bash
sudo cp deploy/nginx/vianna.conf /etc/nginx/sites-available/vianna.conf
sudo sed -i 's/SEU-DOMINIO/seudominio.com.br/g' /etc/nginx/sites-available/vianna.conf
sudo ln -s /etc/nginx/sites-available/vianna.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d painel.seudominio.com.br -d bot.seudominio.com.br
```

O bot registra o webhook do Telegram sozinho ao iniciar (com `TELEGRAM_MODE=webhook`).

## 5. Pix (OpenPix / Woovi)

1. No painel da Woovi (produção: https://app.woovi.com) → **API/Plugins** → **Nova API** → copie o **AppID** para `OPENPIX_APP_ID` e use `OPENPIX_AMBIENTE=producao`.
2. **Webhooks** → novo webhook com URL `https://bot.SEU-DOMINIO/webhooks/openpix` para os eventos **Cobrança paga** (`OPENPIX:CHARGE_COMPLETED`) e **Cobrança expirada** (`OPENPIX:CHARGE_EXPIRED`). Opcional: preencha "Authorization" com um valor aleatório e repita em `OPENPIX_WEBHOOK_AUTORIZACAO`.
3. `docker compose up -d bot` — o log mostra `pix: "openpix (producao)"`. Teste com um pedido de valor baixo.

A assinatura `x-webhook-signature` (RSA-SHA256) é validada com as chaves públicas da Woovi. Mesmo sem webhook, o bot confere os Pix pendentes a cada minuto (`PIX_CONFERENCIA_SEGUNDOS`).

## 6. WhatsApp (Evolution API)

1. `docker compose --profile whatsapp up -d`
2. No painel → **Configurações → WhatsApp**, toque em **Conectar WhatsApp** e leia o QR Code com o celular do número da pizzaria (WhatsApp → Aparelhos conectados). Se o painel estiver aberto no próprio celular, use **Conectar com código**. O bot cria a instância `EVOLUTION_INSTANCIA` sozinho; o painel mostra o status e verifica a conexão periodicamente (e permite desconectar/trocar o número).
3. O webhook já vem configurado para o bot pela rede interna do Docker. Mande um "oi" (ou um áudio) para o número.
4. Ainda em Configurações, preencha o **WhatsApp do bot** para o botão do cardápio público.

O painel fala com o bot por `BOT_URL` (no compose: `http://bot:3001`); o bot confere o token do admin logado e só ele conhece a chave da Evolution. O gerenciador da Evolution (`/manager`, só por túnel SSH: `ssh -L 8080:127.0.0.1:8080 usuario@vps`) fica para diagnóstico.

**Pedido por áudio:** mensagens de voz (WhatsApp e Telegram) são transcritas com a mesma chave da OpenAI (`TRANSCRICAO_AUDIO`, `OPENAI_TRANSCRICAO_MODELO=whisper-1`, limite `AUDIO_DURACAO_MAXIMA_SEGUNDOS`).

> Use um número dedicado à pizzaria. A Evolution usa o WhatsApp Web (Baileys), não a API oficial da Meta.

## 7. Supabase

- Authentication → URL Configuration → **Site URL** = `https://painel.SEU-DOMINIO`.
- Authentication → Sign In / Providers → **desligar "Allow new users to sign up"**.
- Criar o admin: `pnpm usuario admin seu@email.com` (no seu computador, com `apps/bot/.env`).

## Atualizar

```bash
git pull
docker compose --profile whatsapp up -d --build   # (sem --profile se não usa WhatsApp)
docker image prune -f
```

Mudanças de banco: `pnpm exec supabase db push --linked` (do seu computador), antes de subir o código novo.

## Logs e diagnóstico

```bash
docker compose logs -f bot          # JSON (pino); erros com "level":50
docker compose logs -f web
docker compose restart bot
```

Logs rotacionados automaticamente (10 MB × 5 por serviço).
