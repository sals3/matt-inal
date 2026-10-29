#!/usr/bin/env bash
# Déploie (ou met à jour) Le Matt'inal sur Azure Container Apps.
#
#   SUBSCRIPTION="Visual Studio Professional - SALS3" ADMIN_PIN=xxxx TEAM_CODE=XXXX ./infra/deploy.sh
#
# Ressources créées dans un seul groupe (facile à tout supprimer) :
#   - Storage Account (sauvegarde continue de la base SQLite via Litestream)   ~0,10 $/mois
#   - Azure Container Registry Basic (l'image Docker)                         ~7 $/mois
#   - Container Apps (consommation, 0 à 1 réplique, s'éteint quand inactif)    ~0 $ (crédit gratuit mensuel)
set -euo pipefail

: "${SUBSCRIPTION:?Indique l'abonnement Azure à utiliser (SUBSCRIPTION=...)}"
: "${ADMIN_PIN:?Choisis le NIP de Matt (ADMIN_PIN=...)}"
: "${TEAM_CODE:?Choisis le code d'équipe (TEAM_CODE=...)}"

RG="${RG:-rg-matt-inal}"
LOCATION="${LOCATION:-canadacentral}"
APP="${APP:-matt-inal}"
ENV_NAME="${ENV_NAME:-cae-matt-inal}"
CONTAINER="litestream"

# Lecture d'une valeur Azure CLI, sans le \r qu'ajoute parfois le CLI sous WSL.
val() { az "$@" -o tsv | tr -d '\r'; }

az account set --subscription "$SUBSCRIPTION"
SUB_ID="$(val account show --query id)"
SUFFIX="$(printf '%s' "$SUB_ID" | sha1sum | cut -c1-6)"
STORAGE="${STORAGE:-mattinal${SUFFIX}}"
ACR="${ACR:-mattinal${SUFFIX}}"
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
IMAGE="${ACR}.azurecr.io/matt-inal:${TAG}"

echo "▶ Abonnement : $(val account show --query name)"
az extension add --name containerapp --upgrade --only-show-errors >/dev/null
az provider register --namespace Microsoft.App --wait >/dev/null
az provider register --namespace Microsoft.ContainerRegistry --wait >/dev/null

echo "▶ Groupe de ressources $RG ($LOCATION)"
az group create -n "$RG" -l "$LOCATION" -o none

echo "▶ Stockage $STORAGE (sauvegarde de la base)"
az storage account create -n "$STORAGE" -g "$RG" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false -o none
STORAGE_KEY="$(val storage account keys list -n "$STORAGE" -g "$RG" --query '[0].value')"
az storage container create -n "$CONTAINER" --account-name "$STORAGE" --account-key "$STORAGE_KEY" -o none

echo "▶ Registre $ACR + construction de l'image dans Azure (pas besoin de Docker local)"
az acr create -n "$ACR" -g "$RG" --sku Basic --admin-enabled true -o none
az acr build -r "$ACR" -t "matt-inal:${TAG}" . -o none
ACR_USER="$(val acr credential show -n "$ACR" --query username)"
ACR_PASS="$(val acr credential show -n "$ACR" --query 'passwords[0].value')"

echo "▶ Environnement Container Apps $ENV_NAME"
if ! az containerapp env show -n "$ENV_NAME" -g "$RG" -o none 2>/dev/null; then
  az containerapp env create -n "$ENV_NAME" -g "$RG" -l "$LOCATION" --logs-destination none -o none
fi

SECRETS=(admin-pin="$ADMIN_PIN" team-code="$TEAM_CODE" storage-key="$STORAGE_KEY")
ENVVARS=(ADMIN_PIN=secretref:admin-pin TEAM_CODE=secretref:team-code AZURE_STORAGE_ACCOUNT="$STORAGE" AZURE_STORAGE_KEY=secretref:storage-key LITESTREAM_CONTAINER="$CONTAINER")

if az containerapp show -n "$APP" -g "$RG" -o none 2>/dev/null; then
  echo "▶ Mise à jour de l'app $APP"
  az containerapp secret set -n "$APP" -g "$RG" --secrets "${SECRETS[@]}" -o none
  az containerapp update -n "$APP" -g "$RG" --image "$IMAGE" --set-env-vars "${ENVVARS[@]}" -o none
else
  echo "▶ Création de l'app $APP"
  # max-replicas 1 : la partie en direct vit en mémoire et la base est un seul fichier SQLite.
  az containerapp create -n "$APP" -g "$RG" --environment "$ENV_NAME" --image "$IMAGE" \
    --registry-server "${ACR}.azurecr.io" --registry-username "$ACR_USER" --registry-password "$ACR_PASS" \
    --target-port 3000 --ingress external --min-replicas 0 --max-replicas 1 --cpu 0.25 --memory 0.5Gi \
    --secrets "${SECRETS[@]}" --env-vars "${ENVVARS[@]}" -o none
fi

URL="https://$(val containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn)"
echo
echo "🌅 Le Matt'inal est en ligne : $URL"
echo "   Équipe : $URL     Matt : $URL/#/matt"
echo "   Tout supprimer : az group delete -n $RG --subscription \"$SUBSCRIPTION\""
