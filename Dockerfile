FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/sim/package.json apps/sim/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/content/package.json packages/content/package.json
RUN npm ci

COPY . .
RUN npm -w @donjon/web run build

FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=caddy:2-alpine /usr/bin/caddy /usr/local/bin/caddy
COPY --from=build /app /app
COPY ops/fly/Caddyfile /etc/caddy/Caddyfile
COPY ops/fly/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

ENV NODE_ENV=production
EXPOSE 8080
CMD ["/usr/local/bin/start.sh"]
