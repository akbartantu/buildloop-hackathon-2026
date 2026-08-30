# Cloud Run orchestrator service (preparation only — do not deploy without approval)
FROM oven/bun:1.3 AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
