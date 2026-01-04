#!/bin/sh
set -e

echo "🚀 Starting Academy MiniApp Backend..."

# Run migrations
echo "📦 Running database migrations..."
bun run src/db/migrate.ts

# Start the application
echo "✨ Starting application..."
exec bun run src/index.ts
