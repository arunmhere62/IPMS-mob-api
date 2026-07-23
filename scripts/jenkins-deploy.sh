#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy IPMS Mobile API using docker compose.
# The deployed image is tagged with the short Git commit SHA.
# The previous running image is saved as <APP_IMAGE>:previous for rollback.
# Intended for Jenkins CI/CD, but can be run manually.
# ---------------------------------------------------------------------------
set -euo pipefail

APP_NAME="${APP_NAME:-ipms-mob-api}"
APP_IMAGE="${APP_IMAGE:-ipms-mob-api}"
BRANCH="${GIT_BRANCH_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
BRANCH_SAFE="${BRANCH//[^a-zA-Z0-9_-]/-}"
COMMIT_SHORT="${GIT_COMMIT_SHORT:-$(git rev-parse --short HEAD)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-${APP_NAME}-${BRANCH_SAFE}}"
IMAGE_FQN="${APP_IMAGE}:${COMMIT_SHORT}"

if ! [ -f ".env" ]; then
  echo "ERROR: .env file not found in the current directory."
  echo "Create it or set ENV_FILE_CREDENTIAL_ID in Jenkins."
  exit 1
fi

# Use Docker Compose V2 plugin
COMPOSE_CMD="docker compose"

# Determine network name from the compose file or use a sensible default
if [ "${COMPOSE_FILE}" = "docker-compose.prod.yml" ]; then
  NETWORK_NAME="${NETWORK_NAME:-ipgm-mobapi-prod-network}"
else
  NETWORK_NAME="${NETWORK_NAME:-ipms_mob_api_dev}"
fi

# Ensure the external network exists
if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  docker network create "${NETWORK_NAME}"
  echo "Created network ${NETWORK_NAME}"
fi

echo "Deploying ${APP_NAME} from ${COMPOSE_FILE} (project: ${COMPOSE_PROJECT})"
echo "Image: ${IMAGE_FQN}"

# Preserve previous image for rollback by inspecting the running backend container
RUNNING_CONTAINER=$(docker ps -q --filter ancestor="${APP_IMAGE}" --filter name="^/${COMPOSE_PROJECT}.*" || true)
if [ -n "${RUNNING_CONTAINER}" ]; then
  CURRENT_IMAGE=$(docker inspect --format='{{.Config.Image}}' "${RUNNING_CONTAINER}" || true)
  if [ -n "${CURRENT_IMAGE}" ]; then
    docker tag "${CURRENT_IMAGE}" "${APP_IMAGE}:previous" || true
    echo "Saved previous image: ${CURRENT_IMAGE} -> ${APP_IMAGE}:previous"
  fi
fi

# Stop and recreate containers using the commit-SHA image
export APP_IMAGE
export APP_TAG="${COMMIT_SHORT}"

echo "Restarting containers..."
${COMPOSE_CMD} -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" down --remove-orphans
${COMPOSE_CMD} -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" up -d --force-recreate

echo "Deployment complete."
