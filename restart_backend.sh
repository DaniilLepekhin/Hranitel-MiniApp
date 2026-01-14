#!/bin/bash

echo "🔄 Restarting backend..."

cd backend
pm2 restart hranitel-backend || pm2 start "bun run src/index.ts" --name hranitel-backend
pm2 save

echo "✅ Backend restarted!"
pm2 status
