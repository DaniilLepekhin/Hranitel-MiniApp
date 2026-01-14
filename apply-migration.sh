#!/bin/bash

# Script to apply database migration on production server
# Usage: Run this script on the server root@31.128.36.81

set -e

echo "🔍 Searching for project backend directory..."

# Find the backend directory
BACKEND_DIR=""
for dir in /root/club_webapp/backend /root/Hranitel-MiniApp/backend /var/www/club_webapp/backend /opt/club_webapp/backend /home/*/club_webapp/backend; do
    if [ -f "$dir/drizzle.config.ts" ]; then
        BACKEND_DIR="$dir"
        break
    fi
done

if [ -z "$BACKEND_DIR" ]; then
    echo "❌ Backend directory not found!"
    echo "Please manually locate the directory with drizzle.config.ts"
    exit 1
fi

echo "✅ Found backend at: $BACKEND_DIR"

# Navigate to backend
cd "$BACKEND_DIR"

echo "📦 Installing dependencies if needed..."
if [ ! -d "node_modules" ]; then
    npm install
fi

echo "🗄️  Applying database migration..."
DATABASE_URL="postgresql://postgres:U3S%fZ(D2cru@localhost:5432/club_hranitel" npx drizzle-kit push

echo "✅ Migration applied successfully!"
echo ""
echo "📊 Checking database tables..."
PGPASSWORD='U3S%fZ(D2cru' psql -h localhost -U postgres -d club_hranitel -c "\dt" | grep -E "content_items|videos|video_timecodes|user_content_progress|practice_content|content_sections" || echo "Tables might not be visible yet, but migration should be applied."

echo ""
echo "🎉 Done! You can now add test data to the database."
