#!/bin/bash

# VPS Deployment Script for NestJS API
# For Ubuntu 24.04 LTS on Hostinger VPS
# Run this script after uploading your code to the VPS

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  NestJS API VPS Deployment Script     ║${NC}"
echo -e "${BLUE}║  Ubuntu 24.04 LTS - Hostinger VPS     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Update system packages
echo -e "${BLUE}📦 Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y

# Install essential build tools
echo -e "${BLUE}🔧 Installing build essentials...${NC}"
sudo apt install -y build-essential curl wget git ufw

# Install Node.js 20.x LTS
echo -e "${BLUE}📦 Installing Node.js 20.x LTS...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
else
    echo -e "${GREEN}✓ Node.js $(node -v) already installed${NC}"
fi

# Install PM2 globally
echo -e "${BLUE}🔧 Installing PM2 process manager...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    echo -e "${GREEN}✓ PM2 installed${NC}"
else
    echo -e "${GREEN}✓ PM2 already installed${NC}"
fi

# Install Nginx
echo -e "${BLUE}🌐 Installing Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    echo -e "${GREEN}✓ Nginx installed and started${NC}"
else
    echo -e "${GREEN}✓ Nginx already installed${NC}"
fi

# Configure firewall
echo -e "${BLUE}🔥 Configuring UFW firewall...${NC}"
sudo ufw --force enable
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5000/tcp
echo -e "${GREEN}✓ Firewall configured${NC}"

# Create application directory
APP_DIR="/var/www/pg-api"
echo -e "${BLUE}📁 Setting up application directory: ${APP_DIR}${NC}"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# Check if we're already in the app directory
CURRENT_DIR=$(pwd)
if [ "$CURRENT_DIR" != "$APP_DIR" ]; then
    echo -e "${YELLOW}⚠️  Please copy your application files to ${APP_DIR}${NC}"
    echo -e "${YELLOW}   You can use: scp -r ./IPMS-mob-api/* root@72.62.194.189:${APP_DIR}/${NC}"
    echo -e "${YELLOW}   Then run this script from ${APP_DIR}${NC}"
    
    # Ask if user wants to continue
    read -p "Do you want to continue setup anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Navigate to app directory
cd $APP_DIR

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found in ${APP_DIR}${NC}"
    echo -e "${YELLOW}Please upload your application files first${NC}"
    exit 1
fi

# Install dependencies
echo -e "${BLUE}📦 Installing Node.js dependencies...${NC}"
npm install --legacy-peer-deps --production=false

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found!${NC}"
    if [ -f ".env.example" ]; then
        echo -e "${BLUE}Copying .env.example to .env${NC}"
        cp .env.example .env
        echo -e "${RED}⚠️  IMPORTANT: Edit .env file with your production values!${NC}"
        echo -e "${YELLOW}Press Enter after you've updated the .env file...${NC}"
        read
    else
        echo -e "${RED}❌ No .env.example found. Please create .env manually${NC}"
        exit 1
    fi
fi

# Generate Prisma client
echo -e "${BLUE}🔧 Generating Prisma client...${NC}"
npx prisma generate

# Run database migrations
echo -e "${BLUE}🗄️  Running database migrations...${NC}"
npx prisma migrate deploy

# Build the application
echo -e "${BLUE}🏗️  Building application...${NC}"
npm run build

# Create logs directory
mkdir -p logs

# Stop existing PM2 processes
echo -e "${BLUE}🛑 Stopping existing PM2 processes...${NC}"
pm2 stop all || true
pm2 delete all || true

# Start application with PM2
echo -e "${BLUE}🚀 Starting application with PM2...${NC}"
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot
echo -e "${BLUE}⚙️  Setting up PM2 startup script...${NC}"
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
pm2 save

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Deployment Completed Successfully! ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Application Status:${NC}"
pm2 status
echo ""
echo -e "${BLUE}📝 Useful Commands:${NC}"
echo -e "  ${YELLOW}pm2 status${NC}        - Check application status"
echo -e "  ${YELLOW}pm2 logs pg-api${NC}   - View application logs"
echo -e "  ${YELLOW}pm2 restart pg-api${NC} - Restart application"
echo -e "  ${YELLOW}pm2 stop pg-api${NC}   - Stop application"
echo -e "  ${YELLOW}pm2 monit${NC}         - Monitor application"
echo ""
echo -e "${BLUE}🌐 Next Steps:${NC}"
echo -e "  1. Configure Nginx reverse proxy (see nginx config file)"
echo -e "  2. Setup SSL certificate with Let's Encrypt"
echo -e "  3. Configure your domain DNS to point to: ${YELLOW}72.62.194.189${NC}"
echo ""
