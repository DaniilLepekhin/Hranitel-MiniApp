#!/bin/bash

# Manual migration runner for production server
# Run this on server: bash run-migration-manual.sh

set -e

echo "🗄️  Starting manual database migration..."

# Database credentials
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="club_hranitel"
DB_USER="postgres"
DB_PASSWORD="kH*kyrS&9z7K"

export PGPASSWORD="$DB_PASSWORD"

# Run migration 0003
echo "📊 Applying migration 0003_add_onboarding_and_gift_fields.sql..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /var/www/hranitel/backend/drizzle/migrations/0003_add_onboarding_and_gift_fields.sql

echo "✅ Migration completed successfully!"
echo ""
echo "🔍 Verifying new columns..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d users" | grep -E "(first_purchase_date|gifted|gifted_by|onboarding_step)"

echo ""
echo "🔍 Verifying gift_subscriptions table..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d gift_subscriptions"

echo ""
echo "✨ All done! Post-payment funnels are ready to use."
