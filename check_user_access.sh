#!/bin/bash

# Check user access via API
TELEGRAM_ID=$1
API_URL="https://app.successkod.com"

if [ -z "$TELEGRAM_ID" ]; then
  echo "Usage: $0 <telegram_id>"
  exit 1
fi

echo "🔍 Checking access for telegram_id: $TELEGRAM_ID"
echo ""

# Check profile endpoint
echo "1️⃣ Checking profile..."
curl -s -X GET "$API_URL/api/profile?telegram_id=$TELEGRAM_ID" | jq '.'
echo ""

# Check user subscription
echo "2️⃣ Checking subscription from database..."
sshpass -p '6gNJOtZexhZG2nQwiamOYxUx' ssh -o StrictHostKeyChecking=no root@2.58.98.41 "PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -c \"
SELECT 
  telegram_id,
  username,
  is_pro,
  subscription_expires,
  onboarding_step,
  city
FROM users 
WHERE telegram_id = $TELEGRAM_ID;
\""

