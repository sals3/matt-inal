#!/bin/sh
# Démarrage en production : restaure la base depuis Azure Blob si elle est absente,
# puis lance le serveur sous Litestream pour répliquer chaque écriture.
set -e
mkdir -p "$(dirname "$DB_PATH")"

if [ -n "$AZURE_STORAGE_ACCOUNT" ]; then
  litestream restore -config /app/litestream.yml -if-db-not-exists -if-replica-exists "$DB_PATH"
  exec litestream replicate -config /app/litestream.yml -exec "bun src/server.ts"
fi

echo "AZURE_STORAGE_ACCOUNT absent : la base reste locale au conteneur (rien n'est répliqué)."
exec bun src/server.ts
