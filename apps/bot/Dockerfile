# syntax=docker/dockerfile:1
# Bot: Fastify + canais + Pix. Build com o contexto na raiz do monorepo:
#   docker build -f apps/bot/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY apps/bot/package.json apps/bot/
RUN pnpm install --frozen-lockfile --filter "@pizzaria/bot..."
COPY packages ./packages
COPY apps/bot ./apps/bot
# tsup empacota o bot e os pacotes do monorepo num único arquivo.
RUN pnpm --filter @pizzaria/bot build \
 && pnpm --filter @pizzaria/bot deploy --prod --legacy /saida

FROM node:22-alpine
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build /saida/package.json ./
COPY --from=build /saida/node_modules ./node_modules
COPY --from=build /repo/apps/bot/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
