pipeline {
    agent any

    options {
        timestamps()
        ansiColor('xterm')
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '5'))
    }

    parameters {
        choice(
            name: 'ACTION',
            choices: ['Production', 'Development', 'Rollback'],
            description: 'Select the action to perform: deploy Production, deploy Development, or Rollback'
        )
    }

    environment {
        APP_NAME = 'ipms-mob-api'
        APP_IMAGE = 'ipms-mob-api'

        // Docker BuildKit makes builds faster and more cache-efficient.
        DOCKER_BUILDKIT = '1'
        BUILDKIT_PROGRESS = 'plain'
        COMPOSE_DOCKER_CLI_BUILD = '1'

        HEALTH_ENDPOINT = '/api/v1/health'
        MAX_HEALTH_RETRIES = '12'
        HEALTH_RETRY_DELAY = '5'
    }

    stages {
        // ------------------------------------------------------------------
        // Rollback path: skip build/quality stages and go straight to rollback.
        // ------------------------------------------------------------------
        stage('Rollback') {
            when { expression { params.ACTION == 'Rollback' } }
            steps {
                script {
                    env.GIT_BRANCH_NAME = normalizeBranchName(env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'unknown')
                    setDeploymentConfig(env.GIT_BRANCH_NAME)
                    rollbackDeployment()
                }
            }
        }

        // ------------------------------------------------------------------
        // Build & quality path
        // ------------------------------------------------------------------
        stage('Checkout') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    checkout scm

                    env.GIT_COMMIT_SHORT = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
                    env.GIT_BRANCH_NAME = normalizeBranchName(env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'unknown')
                    env.IMAGE_FQN = "${env.APP_IMAGE}:${env.GIT_COMMIT_SHORT}"

                    echo "Branch: ${env.GIT_BRANCH_NAME}"
                    echo "Commit: ${env.GIT_COMMIT_SHORT}"
                    echo "Image: ${env.IMAGE_FQN}"
                }
            }
        }

        stage('Detect Branch & Configure Deployment') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    setDeploymentConfig(env.GIT_BRANCH_NAME)
                }
            }
        }

        stage('Install Dependencies') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    if (fileExists('package-lock.json')) {
                        sh 'npm ci'
                    } else {
                        echo 'WARNING: package-lock.json not found. Falling back to npm install.'
                        sh 'npm install'
                    }
                }
            }
        }

        stage('Format Check') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    runOptionalNpmScript('format')
                }
            }
        }

        stage('ESLint') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    runOptionalNpmScript('lint')
                }
            }
        }

        stage('npm Audit') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    // Audit is currently informational only. It prints vulnerabilities but does not fail or mark the build unstable.
                    // Once dependencies are updated, change this to: sh 'npm audit --audit-level=high'
                    sh 'npm audit --audit-level=high || true'
                }
            }
        }

        stage('Unit Tests') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    runOptionalNpmScript('test', '--passWithNoTests --coverage=false')
                }
            }
        }

        stage('E2E Tests') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    runOptionalNpmScript('test:e2e', '--passWithNoTests')
                }
            }
        }

        stage('Build NestJS Application') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                sh 'npm run build'
            }
        }

        stage('Archive Build Artifacts') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                // Persist the compiled output and deployment manifests for build history/debugging.
                archiveArtifacts artifacts: 'dist/**/*,package.json,package-lock.json,docker-compose*.yml', allowEmptyArchive: true
            }
        }

        stage('Build Docker Image') {
            when { expression { params.ACTION != 'Rollback' } }
            steps {
                script {
                    sh """
                        docker build \
                            -t ${env.IMAGE_FQN} \
                            -f Dockerfile \
                            .
                    """
                }
            }
        }

        stage('Production Approval') {
            when {
                allOf {
                    expression { env.GIT_BRANCH_NAME == 'main' }
                    expression { params.ACTION == 'Production' }
                }
            }
            steps {
                input message: 'Approve deployment to production?', ok: 'Deploy to Production'
            }
        }

        stage('Deploy Development') {
            when {
                allOf {
                    expression { env.GIT_BRANCH_NAME == 'development' }
                    expression { params.ACTION == 'Development' }
                }
            }
            steps {
                script {
                    deployApplication(env.IMAGE_FQN)
                }
            }
        }

        stage('Deploy Production') {
            when {
                allOf {
                    expression { env.GIT_BRANCH_NAME == 'main' }
                    expression { params.ACTION == 'Production' }
                }
            }
            steps {
                script {
                    deployApplication(env.IMAGE_FQN)
                }
            }
        }

        stage('Health Check') {
            when {
                expression {
                    params.ACTION != 'Rollback' && (
                        (env.GIT_BRANCH_NAME == 'development' && params.ACTION == 'Development') ||
                        (env.GIT_BRANCH_NAME == 'main' && params.ACTION == 'Production')
                    )
                }
            }
            steps {
                script {
                    waitForHealthyApplication()
                    env.DEPLOY_SUCCESSFUL = 'true'
                }
            }
        }

        stage('Deployment Summary') {
            when {
                expression {
                    params.ACTION != 'Rollback' && (
                        (env.GIT_BRANCH_NAME == 'development' && params.ACTION == 'Development') ||
                        (env.GIT_BRANCH_NAME == 'main' && params.ACTION == 'Production')
                    ) && env.DEPLOY_HAPPENED == 'true'
                }
            }
            steps {
                script {
                    printDeploymentSummary()
                }
            }
        }
    }

    post {
        always {
            script {
                if (params.ACTION != 'Rollback') {
                    // Remove dangling build layers to prevent disk bloat. Tagged images are never removed.
                    sh 'docker image prune -f'
                }
            }
        }
        success {
            echo "Pipeline completed successfully: ${env.IMAGE_FQN ?: 'Rollback mode'}"
        }
        unstable {
            echo "Pipeline completed with warnings (lint/tests). Deployment: ${env.IMAGE_FQN ?: 'Rollback mode'}"
        }
        failure {
            script {
                echo 'Pipeline failed.'
                if (params.ACTION != 'Rollback' && env.DEPLOY_HAPPENED == 'true' && env.DEPLOY_SUCCESSFUL != 'true') {
                    echo 'Deployment did not reach healthy state. Attempting automatic rollback to previous image...'
                    rollbackDeployment()
                }
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------

def normalizeBranchName(String rawBranch) {
    if (!rawBranch) return 'unknown'
    // Handle both "main" and "origin/main" style branch names.
    def branch = rawBranch.replaceAll(/^origin\//, '')
    return branch.replaceAll(/[^a-zA-Z0-9_-]/, '-')
}

def setDeploymentConfig(String branch) {
    if (branch == 'main') {
        env.APP_IMAGE = 'ipgm-mobapi-prod'
        env.COMPOSE_FILE = 'docker-compose.prod.yml'
        env.NETWORK_NAME = 'ipgm-mobapi-prod-network'
        env.APP_PORT = '3000'
        env.COMPOSE_PROJECT = 'ipgm-mobapi-prod'
        env.CONTAINER_NAME = 'ipgm-mobapi-prod'
        env.BACKEND_HOST = 'ipgm-mobapi-prod'
        env.IMAGE_FQN = "${env.APP_IMAGE}:${env.GIT_COMMIT_SHORT}"
        env.DEPLOYMENT_ENV = 'production'
    } else {
        env.COMPOSE_FILE = 'docker-compose.dev.yml'
        env.NETWORK_NAME = 'ipms_mob_api_dev'
        env.APP_PORT = '3000'
        env.COMPOSE_PROJECT = "${env.APP_NAME}-development"
        env.CONTAINER_NAME = "${env.APP_NAME}-development-backend-1"
        env.BACKEND_HOST = 'backend'
        env.DEPLOYMENT_ENV = 'development'
    }
    echo "Configured ${env.DEPLOYMENT_ENV} deployment using ${env.COMPOSE_FILE}"
}

def composeCommand() {
    // The pipeline requires the Docker Compose V2 plugin (`docker compose`).
    return 'docker compose'
}

def ensureNetworkExists(String networkName) {
    def exists = sh(returnStatus: true, script: "docker network inspect ${networkName} >/dev/null 2>&1")
    if (exists == 0) {
        echo "Network ${networkName} already exists."
    } else {
        sh "docker network create ${networkName}"
        echo "Created network ${networkName}."
    }
}

def cleanupConflictingContainers() {
    // Remove any container that is still bound to the deployment port, regardless of its name.
    // This handles old fixed-name containers or containers from previous project-name changes.
    sh """
        STALE_CONTAINERS=\$(docker ps -q --filter publish=${env.APP_PORT} || true)
        if [ -n "\${STALE_CONTAINERS}" ]; then
            echo "Removing stale containers using port ${env.APP_PORT}: \${STALE_CONTAINERS}"
            docker stop \${STALE_CONTAINERS} 2>/dev/null || true
            docker rm -f \${STALE_CONTAINERS} 2>/dev/null || true
        fi
    """
}

def tagPreviousImage() {
    // Tag the image from the currently running backend container so we can roll back.
    def runningContainer = sh(
        returnStdout: true,
        script: "docker ps -q --filter publish=${env.APP_PORT} --filter ancestor=${env.APP_IMAGE} || true"
    ).trim()

    if (!runningContainer) {
        echo 'No running backend container found; skipping previous-image tag.'
        return
    }

    def currentImage = sh(
        returnStdout: true,
        script: "docker inspect --format='{{.Config.Image}}' ${runningContainer} || true"
    ).trim()

    if (currentImage) {
        sh "docker tag ${currentImage} ${env.APP_IMAGE}:previous"
        echo "Tagged previous image: ${currentImage} -> ${env.APP_IMAGE}:previous"
    } else {
        echo "WARNING: Could not determine image of running container ${runningContainer}."
    }
}

def npmScriptExists(String scriptName) {
    def status = sh(
        returnStatus: true,
        script: "node -e \"if(!require('./package.json').scripts['${scriptName}']){process.exit(1)}\""
    )
    return status == 0
}

def runOptionalNpmScript(String scriptName, String extraArgs = '') {
    if (!npmScriptExists(scriptName)) {
        echo "No \"${scriptName}\" script found in package.json. Skipping."
        return
    }

    def command = extraArgs ? "npm run ${scriptName} -- ${extraArgs}" : "npm run ${scriptName}"
    catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
        sh command
    }
}

def prepareEnvFile() {
    if (fileExists('.env')) {
        echo 'Using existing .env file in workspace.'
        return
    }

    // Optional: pull .env from a Jenkins secret file credential if it exists.
    // If the credential is not configured, continue without it. The deployment
    // may still work if Docker Compose reads an env file from the host instead.
    def envCredentialId = 'ipgm-mobapi-env-file'

    try {
        withCredentials([file(credentialsId: envCredentialId, variable: 'SECRET_ENV_FILE')]) {
            sh 'cp "$SECRET_ENV_FILE" .env'
            sh 'chmod 600 .env'
        }
        echo 'Wrote .env file from Jenkins secret file credential.'
    } catch (Exception e) {
        echo "WARNING: Could not load Jenkins credential '${envCredentialId}' and no .env file present. Continuing anyway."
    }
}

def deployApplication(String imageTag) {
    prepareEnvFile()

    // Ensure the external network exists before Compose tries to use it.
    ensureNetworkExists(env.NETWORK_NAME)

    // Tag the currently running image so we can roll back if the new deployment fails.
    tagPreviousImage()

    // Remove any stale container still bound to this deployment port, regardless of its name.
    cleanupConflictingContainers()

    env.DEPLOY_HAPPENED = 'true'

    sh """
        export APP_IMAGE=${env.APP_IMAGE}
        export APP_TAG=${env.GIT_COMMIT_SHORT}
        ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} down --remove-orphans
        ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} up -d --force-recreate
    """

    if (env.DEPLOYMENT_ENV == 'development') {
        sh """
            ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} up -d --force-recreate nginx
        """
    }

    echo "Deployed ${imageTag} to ${env.DEPLOYMENT_ENV}"
}

def rollbackDeployment() {
    def previousImage = "${env.APP_IMAGE}:previous"
    def imageExists = sh(returnStatus: true, script: "docker image inspect ${previousImage} >/dev/null 2>&1")

    if (imageExists != 0) {
        echo "WARNING: Rollback image ${previousImage} not found. Skipping rollback."
        return
    }

    ensureNetworkExists(env.NETWORK_NAME)
    cleanupConflictingContainers()

    sh """
        export APP_IMAGE=${env.APP_IMAGE}
        export APP_TAG=previous
        ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} down --remove-orphans
        ${composeCommand()} -f ${env.COMPOSE_FILE} -p ${env.COMPOSE_PROJECT} up -d --force-recreate
    """

    echo "Rolled back to ${previousImage}"
}

def waitForHealthyApplication() {
    def healthy = false
    def maxAttempts = env.MAX_HEALTH_RETRIES.toInteger()

    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
        sleep env.HEALTH_RETRY_DELAY.toInteger()

        def exitCode = sh(
            returnStatus: true,
            script: """
                docker run --rm --network ${env.NETWORK_NAME} curlimages/curl:latest \
                    -fsS --max-time 10 http://${env.BACKEND_HOST}:${env.APP_PORT}${env.HEALTH_ENDPOINT}
            """
        )

        if (exitCode == 0) {
            healthy = true
            echo "Health check passed on attempt ${attempt}/${maxAttempts}"
            break
        }

        echo "Health check attempt ${attempt}/${maxAttempts} failed, retrying..."
    }

    if (!healthy) {
        error("Application health check failed after ${maxAttempts} attempts on port ${env.APP_PORT}")
    }
}

def printDeploymentSummary() {
    def timestamp = sh(returnStdout: true, script: 'date "+%Y-%m-%d %H:%M"').trim()
    echo """
==================================
Deployment Successful
==================================

Branch    : ${env.GIT_BRANCH_NAME}
Commit    : ${env.GIT_COMMIT_SHORT}
Image     : ${env.IMAGE_FQN}

Container : ${env.CONTAINER_NAME}

Time      : ${timestamp}

==================================
    """.stripIndent()
}
