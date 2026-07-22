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

echo "Rolling back ${APP_NAME} to ${PREVIOUS_IMAGE}..."

export APP_IMAGE
export APP_TAG=previous

# Recreate containers with the rolled-back image
${COMPOSE_CMD} -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" up -d --force-recreate

echo "Rollback complete."
