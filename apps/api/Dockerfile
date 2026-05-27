FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @tastebook/db generate
RUN pnpm --filter @tastebook/api build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api /app/apps/api
COPY --from=builder /app/packages /app/packages
RUN pnpm install --prod --frozen-lockfile

EXPOSE 3001
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
