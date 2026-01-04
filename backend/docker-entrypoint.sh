#!/bin/sh
set -e

echo "🚀 Starting Academy MiniApp Backend..."

# Run migrations
echo "📦 Running database migrations..."
bun run src/db/migrate.ts

# Setup webhook (run in background after app starts)
(sleep 5 && echo "🔗 Setting up Telegram webhook..." && bun run webhook:setup) &

# Start the application
echo "✨ Starting application..."
exec bun run src/index.ts
