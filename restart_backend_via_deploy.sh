#!/bin/bash

# Create a temporary file to trigger deployment
echo "Triggering backend restart via deployment..."

# Just push restart script
git add restart_backend.sh .github/workflows/restart-backend.yml 2>/dev/null || true
git commit -m "🔄 trigger: перезапуск бэкенда" --allow-empty
git push origin main

echo "Deployment triggered! Backend will restart automatically."
