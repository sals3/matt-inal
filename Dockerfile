FROM oven/bun:1.4-slim

# Litestream réplique la base SQLite vers Azure Blob Storage en continu,
# et la restaure au démarrage (le conteneur peut s'éteindre quand personne ne joue).
ARG LITESTREAM_VERSION=0.3.13
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz /tmp/litestream.tgz
RUN tar -xzf /tmp/litestream.tgz -C /usr/local/bin litestream && rm /tmp/litestream.tgz

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .

ENV NODE_ENV=production PORT=3000 DB_PATH=/data/matt-inal.db
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
