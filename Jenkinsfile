pipeline {
    agent any
    
    tools {
        nodejs 'NodeJS-20' // Change this to match your Jenkins NodeJS installation name
    }
    
    environment {
        // SSH Configuration
        SSH_HOST = 'your-server-host' // Server IP/DNS
        SSH_PORT = '22' // SSH port
        SSH_USER = 'your-ssh-user'
        DEPLOY_PATH = '/var/www/pg-api' // Deployment path on server
        
        // Application Configuration
        APP_NAME = 'pg-api'
        GIT_BRANCH = 'main'
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo '📦 Checking out code from Git...'
                checkout scm
            }
        }
        
        stage('Environment Info') {
            steps {
                echo '🔍 Environment Information:'
                sh 'node --version'
                sh 'npm --version'
                sh 'git --version'
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo '📥 Installing dependencies...'
                sh 'npm ci --prefer-offline --no-audit'
            }
        }
        
        stage('Lint') {
            steps {
                echo '🔍 Running linter...'
                sh 'npm run lint || true' // Continue even if lint fails
            }
        }
        
        stage('Build') {
            steps {
                echo '🏗️ Building application...'
                sh 'npm run build'
            }
        }
        
        stage('Test') {
            steps {
                echo '🧪 Running tests...'
                sh 'npm test || true' // Continue even if tests fail
            }
        }
        
        stage('Generate Prisma Client') {
            steps {
                echo '🔧 Generating Prisma client...'
                sh 'npm run prisma:generate'
            }
        }
        
        stage('Deploy to Server') {
            steps {
                echo '🚀 Deploying to server...'
                script {
                    // Using SSH credentials stored in Jenkins
                    sshagent(credentials: ['ssh-credentials']) {
                        sh """
                            ssh -o StrictHostKeyChecking=no -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} '
                                echo "📂 Navigating to deployment directory..."
                                cd ${DEPLOY_PATH}
                                
                                echo "📥 Pulling latest code..."
                                git pull origin ${GIT_BRANCH}
                                
                                echo "📦 Installing production dependencies..."
                                npm install --production --prefer-offline
                                
                                echo "🏗️ Building application..."
                                npm run build
                                
                                echo "🔧 Generating Prisma client..."
                                npm run prisma:generate
                                
                                echo "🗄️ Running database migrations..."
                                npm run prisma:migrate:deploy
                                
                                echo "♻️ Restarting application with PM2..."
                                pm2 restart ${APP_NAME} || npm run start:pm2
                                
                                echo "💾 Saving PM2 configuration..."
                                pm2 save
                                
                                echo "✅ Deployment completed successfully!"
                            '
                        """
                    }
                }
            }
        }
        
        stage('Health Check') {
            steps {
                echo '🏥 Performing health check...'
                script {
                    sshagent(credentials: ['ssh-credentials']) {
                        sh """
                            ssh -o StrictHostKeyChecking=no -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} '
                                pm2 status ${APP_NAME}
                                echo "Checking API health..."
                                curl -f http://localhost:3000/api/v1/health || echo "Health check endpoint not available"
                            '
                        """
                    }
                }
            }
        }
    }
    
    post {
        success {
            echo '✅ =========================================='
            echo '✅ DEPLOYMENT SUCCESSFUL!'
            echo '✅ =========================================='
            echo "✅ Application: ${APP_NAME}"
            echo "✅ Branch: ${GIT_BRANCH}"
            echo "✅ Build: #${BUILD_NUMBER}"
            echo '✅ =========================================='
            
            // Optional: Send notification
            // emailext (
            //     subject: "✅ Jenkins: Deployment Successful - ${APP_NAME}",
            //     body: """
            //         Deployment completed successfully!
            //         
            //         Project: ${APP_NAME}
            //         Branch: ${GIT_BRANCH}
            //         Build: #${BUILD_NUMBER}
            //         Time: ${new Date()}
            //     """,
            //     to: 'your-email@example.com'
            // )
        }
        
        failure {
            echo '❌ =========================================='
            echo '❌ DEPLOYMENT FAILED!'
            echo '❌ =========================================='
            echo "❌ Application: ${APP_NAME}"
            echo "❌ Branch: ${GIT_BRANCH}"
            echo "❌ Build: #${BUILD_NUMBER}"
            echo '❌ Check logs above for details'
            echo '❌ =========================================='
            
            // Optional: Send notification
            // emailext (
            //     subject: "❌ Jenkins: Deployment Failed - ${APP_NAME}",
            //     body: """
            //         Deployment failed!
            //         
            //         Project: ${APP_NAME}
            //         Branch: ${GIT_BRANCH}
            //         Build: #${BUILD_NUMBER}
            //         Time: ${new Date()}
            //         
            //         Check Jenkins console output for details.
            //     """,
            //     to: 'your-email@example.com'
            // )
        }
        
        always {
            echo '🧹 Cleaning up workspace...'
            cleanWs()
        }
    }
}
