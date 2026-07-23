#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Wait for the IPMS Mobile API to become healthy.
# ---------------------------------------------------------------------------
set -euo pipefail

NETWORK_NAME="${NETWORK_NAME:-ipgm-mobapi-prod-network}"
BACKEND_HOST="${BACKEND_HOST:-backend}"
APP_PORT="${APP_PORT:-3000}"
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-/api/v1/health}"
MAX_RETRIES="${MAX_HEALTH_RETRIES:-12}"
RETRY_DELAY="${HEALTH_RETRY_DELAY:-5}"

URL="http://${BACKEND_HOST}:${APP_PORT}${HEALTH_ENDPOINT}"

echo "Checking health at ${URL} (network: ${NETWORK_NAME})"

for attempt in $(seq 1 "${MAX_RETRIES}"); do
  sleep "${RETRY_DELAY}"

  echo "Health check attempt ${attempt}/${MAX_RETRIES}..."
  if docker run --rm --network "${NETWORK_NAME}" curlimages/curl:latest \
       -fsS --max-time 10 "${URL}"; then
    echo "Health check passed."
    exit 0
  fi

  echo "Health check failed or timed out, retrying..."
done

echo "ERROR: Health check failed after ${MAX_RETRIES} attempts."
exit 1
