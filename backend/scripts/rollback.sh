#!/bin/bash
# 🔄 Emergency Rollback Script
# Usage: bash rollback.sh [commit-hash]
# If no commit hash provided, rolls back to previous PM2 save

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "════════════════════════════════════════════════════════════"
echo -e "${RED}🔄 EMERGENCY ROLLBACK${NC}"
echo "════════════════════════════════════════════════════════════"

# Check if we're on the server
if [ ! -d "/var/www/hranitel" ]; then
  echo -e "${RED}❌ Error: Not on production server${NC}"
  exit 1
fi

cd /var/www/hranitel

# Get current commit
CURRENT_COMMIT=$(git rev-parse HEAD)
echo -e "\n${YELLOW}Current commit:${NC} $CURRENT_COMMIT"

# Get target commit
if [ -n "$1" ]; then
  TARGET_COMMIT="$1"
  echo -e "${YELLOW}Target commit:${NC} $TARGET_COMMIT"
else
  # Get previous commit
  TARGET_COMMIT=$(git rev-parse HEAD~1)
  echo -e "${YELLOW}Rolling back to previous commit:${NC} $TARGET_COMMIT"
fi

# Confirm rollback
echo -e "\n${RED}⚠️  This will roll back the application to commit $TARGET_COMMIT${NC}"
echo -e "${YELLOW}Press ENTER to continue, or Ctrl+C to cancel...${NC}"
read

# Backup current state
echo -e "\n${GREEN}1. Creating backup of current state...${NC}"
pm2 save --force
git stash save "Emergency backup before rollback $(date '+%Y-%m-%d %H:%M:%S')"
echo "✅ Backup created"

# Checkout target commit
echo -e "\n${GREEN}2. Checking out target commit...${NC}"
git fetch origin
git checkout "$TARGET_COMMIT"
echo "✅ Checked out $TARGET_COMMIT"

# Restart backend
echo -e "\n${GREEN}3. Restarting backend...${NC}"
cd backend

# Reinstall dependencies
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
rm -rf node_modules
bun install

# Restart with PM2
pm2 delete hranitel-backend 2>/dev/null || true
pm2 start --name hranitel-backend --cwd /var/www/hranitel/backend "$HOME/.bun/bin/bun run src/index.ts"
pm2 save

echo "✅ Backend restarted"

# Wait and check health
echo -e "\n${GREEN}4. Checking backend health...${NC}"
sleep 5

HEALTH_CHECK=$(curl -s http://localhost:3002/health || echo "FAILED")
if echo "$HEALTH_CHECK" | grep -q "ok"; then
  echo "✅ Backend health check PASSED"
else
  echo -e "${RED}❌ Backend health check FAILED${NC}"
  echo "Response: $HEALTH_CHECK"
  exit 1
fi

# Restart frontend
echo -e "\n${GREEN}5. Restarting frontend...${NC}"
cd ../webapp

npm install
npm run build

# Copy static files
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

pm2 delete hranitel-frontend 2>/dev/null || true
cd .next/standalone
PORT=3003 pm2 start --name hranitel-frontend --cwd /var/www/hranitel/webapp/.next/standalone node -- server.js
pm2 save

echo "✅ Frontend restarted"

# Final status
echo ""
echo "════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ ROLLBACK COMPLETED${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Rolled back from: $CURRENT_COMMIT"
echo "Rolled back to:   $TARGET_COMMIT"
echo ""
echo "🏥 Check health: curl http://localhost:3002/health"
echo "📊 PM2 status:"
pm2 status
echo ""
echo "════════════════════════════════════════════════════════════"

exit 0
