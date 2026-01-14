#!/bin/bash

echo "🔄 Restarting backend..."

cd /var/www/hranitel/backend || {
  echo "❌ Backend directory not found!"
  exit 1
}

pm2 restart hranitel-backend || pm2 start --name hranitel-backend --cwd /var/www/hranitel/backend "$HOME/.bun/bin/bun run src/index.ts"
pm2 save

echo "✅ Backend restarted!"
pm2 status
