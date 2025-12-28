#!/bin/bash

# Server Initial Setup Script
# Run this script on your server via SSH

echo "🚀 Setting up NestJS API on server..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
echo -e "${BLUE}Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found. Installing via NVM...${NC}"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    source ~/.bashrc
    nvm install 20
    nvm use 20
else
    echo -e "${GREEN}✓ Node.js $(node -v) found${NC}"
fi

# Check if PM2 is installed
echo -e "${BLUE}Checking PM2 installation...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}PM2 not found. Installing...${NC}"
    npm install -g pm2
else
    echo -e "${GREEN}✓ PM2 found${NC}"
fi

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
npm install --production

# Generate Prisma client
echo -e "${BLUE}Generating Prisma client...${NC}"
npm run prisma:generate

# Build application
echo -e "${BLUE}Building application...${NC}"
npm run build

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}⚠️  .env file not found!${NC}"
    echo -e "${BLUE}Please create .env file with required variables${NC}"
    echo -e "See .env.example for reference"
    exit 1
fi

# Run database migrations
echo -e "${BLUE}Running database migrations...${NC}"
npm run prisma:migrate:deploy

# Start application with PM2
echo -e "${BLUE}Starting application with PM2...${NC}"
npm run start:pm2

# Save PM2 process list
pm2 save

# Setup PM2 startup
echo -e "${BLUE}Setting up PM2 startup...${NC}"
pm2 startup

echo -e "${GREEN}✅ Setup completed!${NC}"
echo -e "${BLUE}Run the command shown above to enable PM2 on system startup${NC}"
echo -e "${BLUE}Check status with: pm2 status${NC}"
echo -e "${BLUE}View logs with: pm2 logs pg-api${NC}"
