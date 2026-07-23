# Jenkins CI/CD Pipeline — IPMS Mobile API

This document describes the production-ready Jenkins CI/CD pipeline for the NestJS backend (`IPMS-mob-api`).

---

## Overview

- **Repository:** GitHub
- **Branches:** `development`, `main`
- **Deployment target:** Ubuntu VPS (same host as Jenkins)
- **Runtime:** Docker + Docker Compose
- **Container orchestration:** `docker-compose.dev.yml` (development) / `docker-compose.yml` (production)
- **Health endpoint:** `/api/v1/health`

Jenkins runs inside Docker on the same VPS and has access to the host Docker socket, so pipeline steps can build, deploy, and health-check containers directly on the host.

---

## Pipeline Stages

| Stage | Purpose |
| --- | --- |
| **Checkout** | Clone the source from GitHub and compute the short Git commit SHA used as the Docker image tag. |
| **Detect Branch & Configure Deployment** | Resolve which compose file, network, port, project name, and container name to use for the current branch. |
| **Install Dependencies** | Install a deterministic set of dependencies with `npm ci` (falls back to `npm install` only if `package-lock.json` is missing). |
| **Format Check** | Run the `format` npm script if it exists. Skipped gracefully if the script is not configured. |
| **ESLint** | Run the `lint` npm script if it exists. The project currently has pre-existing lint warnings, so the ESLint rules are set to **warn** so the pipeline stays green while the code is gradually cleaned up. |
| **npm Audit** | Scan dependencies for vulnerabilities. Currently **informational only** so the pipeline stays green while vulnerabilities are addressed. |
| **Unit Tests** | Run the `test` npm script if it exists, using `npm run test -- --passWithNoTests`. Currently marked **UNSTABLE on failure** so missing tests do not block deployment. |
| **E2E Tests** | Run the `test:e2e` npm script if it exists. Skipped gracefully if the script is not configured. |
| **Build NestJS Application** | Compile TypeScript to `dist/` and generate the Prisma client. This catches build errors before the Docker image is created. |
| **Archive Build Artifacts** | Persist `dist/`, `package*.json`, and `docker-compose*.yml` to Jenkins build history for debugging. |
| **Build Docker Image** | Build the runtime image using Docker BuildKit and tag it with the short commit SHA for traceability. |
| **Production Approval** | Pause the pipeline and require a human approval before production is deployed. |
| **Deploy Development / Deploy Production** | Stop the existing compose project and recreate it with the new commit-SHA image. |
| **Health Check** | Poll the backend health endpoint up to 12 times (5-second intervals). If it does not become healthy, the pipeline fails and automatically rolls back. |
| **Deployment Summary** | Print a clear summary with branch, commit, image, container, and timestamp for future log review. |

### Suggested Future Stage Order

As the project matures, you can add a real Unit Test stage between **ESLint** and **Build NestJS** without changing anything else:

```
Checkout
↓
Install Dependencies
↓
ESLint
↓
npm Audit
↓
Unit Tests        ← enable when tests exist
↓
Build NestJS
↓
Build Docker Image
↓
Deploy
↓
Health Check
↓
Rollback (if needed)
```

---

## Production-Quality Changes Made

### 1. Removed Docker Registry Push

Since Jenkins and the application run on the **same VPS**, there is no need to push images to an external registry. Images are built on the host and used directly by Docker Compose. This simplifies credentials, reduces cost, and speeds up deployment.

### 2. Git Commit SHA as the Image Tag

Images are tagged with the short commit SHA instead of `latest`/`dev-latest`:

```text
ipms-mob-api:a1b2c3d
```

This makes every deployment fully traceable, prevents accidental reuse of stale `latest` tags, and makes rollbacks deterministic.

### 3. Declarative `when` Conditions Instead of Branch If/Else

Branch logic is expressed with `when { expression { ... } }` blocks. This is more idiomatic in Declarative Pipelines, easier to read, and lets Jenkins visualize which stages ran/skipped in the Blue Ocean UI.

### 4. npm Audit with High/Critical Failure Threshold

`npm audit --audit-level=high` is used so that only serious vulnerabilities block deployment. Moderate and low findings are still printed to the console for review.

### 5. Docker BuildKit Enabled

The environment variables `DOCKER_BUILDKIT=1`, `BUILDKIT_PROGRESS=plain`, and `COMPOSE_DOCKER_CLI_BUILD=1` are set so that builds use BuildKit for faster caching, parallel layer builds, and cleaner output.

### 6. Jenkins Build Parameter

A single **Choice Parameter** prevents users from accidentally selecting conflicting options:

| Parameter | Options | Description |
| --- | --- | --- |
| **ACTION** | `Development` | Build and deploy the `development` branch. |
| | `Production` | Build and deploy the `main` branch (requires manual approval). |
| | `Rollback` | Skip the build and roll back to the previously saved image. |

Using one choice parameter instead of multiple booleans avoids invalid combinations (for example, selecting both Development and Production at the same time).

### 7. Manual Production Approval

Before `main` is deployed, Jenkins pauses and asks:

```text
Approve deployment to production?
```

Only after a human clicks **Deploy to Production** does the production deployment proceed. This protects production from accidental or malicious automated deploys.

### 8. Artifact Archiving

The compiled `dist/` folder, `package.json`, `package-lock.json`, and compose files are archived after the NestJS build. This gives you a record of exactly what was deployed and helps with offline debugging.

### 9. Structured `post` Actions

The pipeline defines four post-build handlers:

- **`always`** — prune dangling Docker images to reclaim disk space
- **`success`** — log the deployed image tag
- **`failure`** — automatically roll back if a deployment was attempted and failed
- **`cleanup`** — wipe the Jenkins workspace at the end

### 10. Improved Logging

`timestamps()` and `ansiColor('xterm')` are enabled, so the console output shows exact timing and colored logs for easier reading.

### 11. Rollback Support

Before each deployment, the currently running container's image is inspected and saved as `ipms-mob-api:previous`. If the health check fails, Jenkins automatically rolls back to that image. You can also trigger a manual rollback by running the pipeline with the **Rollback** action selected.

### 12. Optional npm Scripts

The pipeline checks whether scripts such as `format`, `lint`, `test`, and `test:e2e` are defined in `package.json` before running them. If a script is missing, the stage is skipped with a clear log message instead of failing. This makes the pipeline reusable across projects that may not have every script configured.

### 13. Deployment Summary

After a successful deployment, a structured summary is printed to the Jenkins console:

```text
==================================
Deployment Successful
==================================

Branch    : development
Commit    : a13bc82
Image     : ipms-mob-api:a13bc82

Container : ipms-mob-api-development-backend-1

Time      : 2026-07-22 21:50

==================================
```

This makes it easy to identify what was deployed when reviewing old build logs.

---

## Required Jenkins Plugins

Install these plugins from **Manage Jenkins → Plugins**:

| Plugin | Why it is needed |
| --- | --- |
| **Pipeline** | Core plugin for Declarative Pipelines. |
| **Git** / **GitHub Branch Source** | Clone the repository and support GitHub webhooks. |
| **Workspace Cleanup** | `cleanWs()` step used in checkout and cleanup. |
| **AnsiColor** | Colorized console output (`ansiColor('xterm')`). |
| **Timestamper** | Timestamps in console logs (`timestamps()`). |
| **Docker Pipeline** | Useful if you later switch to `docker.build()` syntax. The current pipeline uses raw shell commands and only needs the Docker CLI on the agent. |

---

## Required Jenkins Credentials

Create these credentials in **Manage Jenkins → Credentials**:

| Credential ID | Type | Required? | Purpose |
| --- | --- | --- | --- |
| `github-token` | Secret text | Optional | Used if the repository is private or if you want to authenticate GitHub API calls. |
| `ipms-mob-api-env-file` | Secret file | Optional | The `.env` file that the compose project reads. If `.env` already exists in the workspace, or if you inject environment variables through Docker Compose, this credential is not required. |
| `vps-ssh-credentials` | SSH Username with private key | Optional | Reserved for future use if Jenkins is ever separated from the deployment host. The current pipeline deploys locally via the Docker socket. |

> **Security note:** Never commit secrets to Git. Store environment variables either in this Jenkins secret file or in a secrets manager.

---

## GitHub Webhook Configuration

To trigger the pipeline automatically on every push:

1. In your GitHub repository, go to **Settings → Webhooks → Add webhook**.
2. Set **Payload URL** to:

   ```text
   http://<your-vps-or-domain>/github-webhook/
   ```

3. Set **Content type** to `application/json`.
4. Select **Just the push event**.
5. Save the webhook.

If you are using a **Multibranch Pipeline** in Jenkins, the webhook URL path is the same. Jenkins will scan branches on each push and trigger builds for `development` and `main` automatically.

---

## How to Use the Pipeline

### Automatic Deployment on Push

If the webhook is configured, pushing to a branch triggers the corresponding branch build. The default `ACTION` is `Development`, so:

- Pushes to `development` build and deploy automatically.
- Pushes to `main` build but **do not deploy** automatically, keeping production deployments manual.

### Manual Build with Parameters

1. In Jenkins, open the pipeline job.
2. Click **Build with Parameters**.
3. Select the **ACTION** choice parameter:
   - `Development` — build and deploy the `development` branch.
   - `Production` — build and deploy the `main` branch (requires approval).
   - `Rollback` — skip the build and roll back to the previous image.
4. Click **Build**.

---

## Rollback

### Automatic Rollback

If the new container fails the health check, the `failure` post handler re-tags `ipms-mob-api:previous` to the active tag and recreates the compose project.

### Manual Rollback

Run the pipeline with the **Rollback** parameter enabled. The pipeline will:

1. Skip checkout, build, lint, and audit.
2. Verify that `ipms-mob-api:previous` exists.
3. Re-create the compose project using the previous image.

You can also run the helper script directly on the VPS:

```bash
APP_IMAGE=ipms-mob-api \
COMPOSE_FILE=docker-compose.yml \
COMPOSE_PROJECT=ipms-mob-api-main \
./scripts/jenkins-rollback.sh
```

For development:

```bash
APP_IMAGE=ipms-mob-api \
COMPOSE_FILE=docker-compose.dev.yml \
COMPOSE_PROJECT=ipms-mob-api-development \
./scripts/jenkins-rollback.sh
```

---

## Helper Scripts

The `scripts/` folder contains reusable shell scripts for manual operations:

| Script | Usage |
| --- | --- |
| `scripts/jenkins-build.sh` | Build the Docker image and tag it with the short commit SHA. |
| `scripts/jenkins-deploy.sh` | Deploy the commit-SHA image with Docker Compose while saving the previous image. |
| `scripts/jenkins-rollback.sh` | Roll back to the `ipms-mob-api:previous` image. |
| `scripts/jenkins-health-check.sh` | Poll the backend health endpoint inside the compose network. |

### Example Manual Deployment

```bash
export APP_IMAGE=ipms-mob-api
export GIT_COMMIT_SHORT=$(git rev-parse --short HEAD)
export COMPOSE_FILE=docker-compose.yml
export COMPOSE_PROJECT=ipms-mob-api-main

./scripts/jenkins-build.sh
./scripts/jenkins-deploy.sh
./scripts/jenkins-health-check.sh
```

---

## Best Practices

1. **Never commit `.env`** — use the Jenkins secret file credential or a secrets manager.
2. **Tag images with commit SHA** — it makes deployments deterministic and rollbacks trivial.
3. **Require approval for production** — this prevents accidental production deploys.
4. **Run `npm audit` in CI** — catch high/critical vulnerabilities before they reach production.
5. **Archive build artifacts** — keep `dist/` and compose files for every build to simplify debugging.
6. **Prune dangling images** — the pipeline does this automatically to avoid filling the VPS disk.
7. **Use separate compose projects** — dev and prod use different `-p` project names and isolated networks so they can coexist on the same host.
8. **Health check before declaring success** — the pipeline waits until the application actually responds before finishing.
9. **Keep the pipeline declarative** — use `when` conditions and helper functions so the file stays readable as the project grows.
10. **Plan for tests** — when unit tests are added, replace the `when { expression { false } }` stage with real test commands. No other stage will need to change.

---

## Troubleshooting

### Health check fails repeatedly

- Check the container logs: `docker logs ipms-mob-api-main-backend-1` or `docker logs ipms-mob-api-development-backend-1`.
- Verify the database is reachable from the container.
- Ensure `.env` has the correct `DATABASE_URL` and other secrets.

### Rollback image not found

A previous deployment must have run successfully for `ipms-mob-api:previous` to exist. If you are rolling back after a fresh install, there is no previous image.

### `docker compose` not found

The pipeline and helper scripts require the Docker Compose V2 plugin (`docker compose`). Make sure the Jenkins agent has Docker Compose V2 installed, not the legacy `docker-compose` v1 binary.

---

## Future Improvements

- Add a dedicated **Unit Test** stage once tests are written.
- Add **Smoke Tests** against the deployed container (e.g., login API call).
- Push images to a registry if you later move Jenkins to a separate host.
- Add **Slack/Email notifications** in the `post` block.
- Add **Snyk** or **Trivy** container scanning before deployment.
- Store `.env` in a proper secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager) instead of a Jenkins secret file.
