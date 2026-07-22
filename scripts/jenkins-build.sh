#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Build the IPMS Mobile API Docker image.
# The image is tagged with the short Git commit SHA for traceability.
# Intended for Jenkins CI/CD, but can be run manually.
# ---------------------------------------------------------------------------
set -euo pipefail

APP_NAME="${APP_NAME:-ipms-mob-api}"
APP_IMAGE="${APP_IMAGE:-ipms-mob-api}"
BRANCH="${GIT_BRANCH_NAME:-$(git rev-parse --abbrev-ref HEAD)}"
BUILD_NUMBER="${BUILD_NUMBER:-local}"
COMMIT_SHORT="${GIT_COMMIT_SHORT:-$(git rev-parse --short HEAD)}"

BRANCH_SAFE="${BRANCH//[^a-zA-Z0-9_-]/-}"
IMAGE_FQN="${APP_IMAGE}:${COMMIT_SHORT}"

echo "Building Docker image: ${IMAGE_FQN}"
echo "Branch: ${BRANCH_SAFE}"
echo "Build number: ${BUILD_NUMBER}"
echo "Commit: ${COMMIT_SHORT}"

export DOCKER_BUILDKIT=1
export BUILDKIT_PROGRESS=plain

docker build \
  -t "${IMAGE_FQN}" \
  -f Dockerfile \
  .

echo "Docker image built successfully: ${IMAGE_FQN}"
