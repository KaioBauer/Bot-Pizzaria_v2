# Deploy na VPS (Docker + Nginx)

O que roda onde:

| Onde | O quê |
|---|---|
| VPS (Docker) | `bot` (WhatsApp, Pix simulado, notificações) e `web` (painel + cardápio). Opcional: `evolution` (WhatsApp) com Postgres e Redis próprios |
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
CARDAPIO_URL=https://painel.SEU-DOMINIO/cardapio
OPENAI_MODEL=gpt-5.4-mini
# + SUPABASE_*, OPENAI_API_KEY
# Pix simulado (sem dinheiro de verdade): PIX_SIMULADO=true, PIX_SIMULADO_CIDADE
# WhatsApp: EVOLUTION_API_KEY, WHATSAPP_WEBHOOK_TOKEN
#           (os mesmos valores do .env da raiz)
```

## 3. Subir

```bash
docker compose --profile whatsapp up -d --build    # bot + painel + Evolution (WhatsApp)
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

## 5. Pix (simulado)

O Pix é **simulado**: nenhum dinheiro de verdade se move. Com `PIX_SIMULADO=true` o bot faz o papel do
banco: o cliente recebe QR Code e copia e cola no padrão do Banco Central, a cobrança vence no prazo
configurado e o pagamento é confirmado por webhook assinado (HMAC), como num banco real.

- Para pagar: painel → **Configurações → Banco simulado (Pix)** (ou Ctrl+K → "Banco simulado"), cole o
  copia e cola ou toque em **Pagar** na cobrança. Em alguns segundos o pedido vai para a cozinha.
- A chave Pix é fictícia: um app de banco real lê o QR, mas não acha a chave e não deixa pagar.
- O log de início mostra `pix: "simulado"`; em `NODE_ENV=production` aparece um aviso lembrando que é simulado.
- `PIX_SIMULADO_PERDA_WEBHOOK=0.5` descarta metade dos webhooks para testar a conferência periódica
  (`PIX_CONFERENCIA_SEGUNDOS`), que confirma os pagamentos mesmo sem aviso.

## 6. WhatsApp (Evolution API)

1. `docker compose --profile whatsapp up -d`
2. No painel → **Configurações → WhatsApp**, toque em **Conectar WhatsApp** e leia o QR Code com o celular do número da pizzaria (WhatsApp → Aparelhos conectados). Se o painel estiver aberto no próprio celular, use **Conectar com código**. O bot cria a instância `EVOLUTION_INSTANCIA` sozinho; o painel mostra o status e verifica a conexão periodicamente (e permite desconectar/trocar o número).
3. O webhook já vem configurado para o bot pela rede interna do Docker. Mande um "oi" (ou um áudio) para o número.
4. Ainda em Configurações, preencha o **WhatsApp do bot** para o botão do cardápio público.

O painel fala com o bot por `BOT_URL` (no compose: `http://bot:3001`); o bot confere o token do admin logado e só ele conhece a chave da Evolution. O gerenciador da Evolution (`/manager`, só por túnel SSH: `ssh -L 8080:127.0.0.1:8080 usuario@vps`) fica para diagnóstico.

**Pedido por áudio:** mensagens de voz (WhatsApp) são transcritas com a mesma chave da OpenAI (`TRANSCRICAO_AUDIO`, `OPENAI_TRANSCRICAO_MODELO=whisper-1`, limite `AUDIO_DURACAO_MAXIMA_SEGUNDOS`).

> Use um número dedicado à pizzaria. A Evolution usa o WhatsApp Web (Baileys), não a API oficial da Meta.

## 6.1 Pedido pelo link (/pedir)

O cliente monta a pizza em `https://painel.SEU-DOMINIO/pedir` e finaliza no navegador. O painel repassa o pedido ao bot por `BOT_URL` (rede interna); o bot reprecifica, grava, gera o Pix e avisa no WhatsApp.

1. Painel → **Configurações → Pedido pelo link**: ligue, ajuste o máximo de ingredientes e baixe o QR Code para divulgar.
2. Painel → **Cardápio → Ingredientes e camadas**: cadastre ingredientes (preço por tamanho) e envie as imagens de camada (PNG/WebP com fundo transparente, até 1 MB). Troque também `apps/web/public/pedir/massa-crua.svg`, `molho.svg` e `massa-assada.svg` pelas fotos reais (mesmo nome ou ajuste `BASE_PADRAO` em `components/pizza-builder/pizza.tsx`).
3. Variáveis novas (opcionais):
   - bot: `PEDIR_URL=https://painel.SEU-DOMINIO/pedir` — vai no link de acompanhamento enviado no WhatsApp (sem ela, é derivada de `CARDAPIO_URL`);
   - web: `NEXT_PUBLIC_SITE_URL=https://painel.SEU-DOMINIO` — origem do link/QR em Configurações (sem ela, vem dos cabeçalhos da requisição).

> **Não exponha `/pedido-link` do bot no Nginx.** O bot confia no IP do cliente que o painel repassa (`x-cliente-ip`) para o limite por IP; a rota só deve ser alcançável pela rede interna. O `vianna.conf` atual já só libera os webhooks e `/health`.

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
