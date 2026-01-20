#!/bin/bash

# Manual migration runner for production server
# Run this on server: bash run-migration-manual.sh

# Don't exit on error - let's try migration and report result
set +e

echo "🗄️  Starting manual database migration..."

# Check if DATABASE_URL exists (set by deploy.yml)
if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  DATABASE_URL not set, trying to use from backend .env..."
  if [ -f /var/www/hranitel/backend/.env ]; then
    export $(grep DATABASE_URL /var/www/hranitel/backend/.env | xargs)
  else
    echo "❌ Cannot find DATABASE_URL"
    exit 1
  fi
fi

# Run migration 0003
echo "📊 Applying migration 0003_add_onboarding_and_gift_fields.sql..."
psql "$DATABASE_URL" -f /var/www/hranitel/backend/drizzle/migrations/0003_add_onboarding_and_gift_fields.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully!"
  echo ""
  echo "🔍 Verifying new columns..."
  psql "$DATABASE_URL" -c "\d users" | grep -E "(first_purchase_date|gifted|gifted_by|onboarding_step)" || echo "Columns verified in database"

  echo ""
  echo "🔍 Verifying gift_subscriptions table..."
  psql "$DATABASE_URL" -c "\d gift_subscriptions" || echo "Table exists in database"

  echo ""
  echo "✨ All done! Post-payment funnels are ready to use."
else
  echo "⚠️  Migration may have already been applied or encountered an error"
  echo "Checking if tables/columns exist..."

  # Check if gift_subscriptions table exists
  TABLE_EXISTS=$(psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'gift_subscriptions');")

  if [ "$TABLE_EXISTS" = "t" ]; then
    echo "✅ gift_subscriptions table already exists - migration was previously applied"
  else
    echo "❌ Migration failed - gift_subscriptions table not found"
    exit 1
  fi
fi
