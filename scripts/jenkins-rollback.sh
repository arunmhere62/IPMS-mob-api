#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Roll back IPMS Mobile API to the previous Docker image.
# The previous image is expected to be tagged as <APP_IMAGE>:previous.
# ---------------------------------------------------------------------------
set -euo pipefail

APP_NAME="${APP_NAME:-ipms-mob-api}"
APP_IMAGE="${APP_IMAGE:-ipms-mob-api}"
BRANCH="${GIT_BRANCH_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
BRANCH_SAFE="${BRANCH//[^a-zA-Z0-9_-]/-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-${APP_NAME}-${BRANCH_SAFE}}"
PREVIOUS_IMAGE="${APP_IMAGE}:previous"

if ! docker image inspect "${PREVIOUS_IMAGE}" >/dev/null 2>&1; then
  echo "ERROR: Previous image ${PREVIOUS_IMAGE} not found. Rollback not possible."
  exit 1
fi

# Use Docker Compose V2 plugin
COMPOSE_CMD="docker compose"

# Determine network name from the compose file or use a sensible default
if [ "${COMPOSE_FILE}" = "docker-compose.yml" ]; then
  NETWORK_NAME="${NETWORK_NAME:-ipms_mob_api}"
else
  NETWORK_NAME="${NETWORK_NAME:-ipms_mob_api_dev}"
fi

# Ensure the external network exists
if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  docker network create "${NETWORK_NAME}"
  echo "Created network ${NETWORK_NAME}"
fi

echo "Rolling back ${APP_NAME} to ${PREVIOUS_IMAGE}..."

export APP_IMAGE
export APP_TAG=previous

# Recreate containers with the rolled-back image
${COMPOSE_CMD} -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" down --remove-orphans
${COMPOSE_CMD} -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" up -d --force-recreate

echo "Rollback complete."
