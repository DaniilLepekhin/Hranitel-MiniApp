#!/bin/bash

# Academy MiniApp 2.0 - Deployment Script
# Usage: ./deploy.sh

set -e

SERVER="root@2.58.98.41"
SERVER_DIR="/opt/academy-miniapp"
PASSWORD="6gNJOtZexhZG2nQwiamOYxUx"

echo "🚀 Starting deployment to $SERVER..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create .env file from .env.example"
    exit 1
fi

# Create deployment package
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
mkdir -p deploy
cp docker-compose.prod.yml deploy/docker-compose.yml
cp -r nginx deploy/
cp .env deploy/

# Copy files to server
echo -e "${YELLOW}📤 Copying files to server...${NC}"
sshpass -p "$PASSWORD" rsync -avz --delete \
    deploy/ \
    $SERVER:$SERVER_DIR/

# Deploy on server
echo -e "${YELLOW}🐳 Deploying on server...${NC}"
sshpass -p "$PASSWORD" ssh $SERVER << 'EOF'
cd /opt/academy-miniapp

echo "Pulling latest images..."
docker compose pull

echo "Stopping old containers..."
docker compose down

echo "Starting new containers..."
docker compose up -d

echo "Waiting for database..."
sleep 10

echo "Running migrations..."
docker compose exec -T backend bun run db:push

echo "Seeding database..."
docker compose exec -T backend bun run db:seed || true

echo "Cleaning up..."
docker system prune -f

echo "Deployment status:"
docker compose ps

echo "✅ Deployment completed!"
EOF

# Clean up
rm -rf deploy

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Your app is now running on the server${NC}"
