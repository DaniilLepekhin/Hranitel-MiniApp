#!/bin/bash

# Monday city chats opening script
# Runs at 10:00 Moscow time on Monday (07:00 UTC Monday)
# Crontab: 0 7 * * 1 /var/www/hranitel/backend/scripts/city_chats_open_monday.sh

BOT_TOKEN="8233570593:AAFUrEuTDQbUvwollurpJhxynMHu54i4_sk"
DB_CONNECTION="postgresql://postgres:kH*kyrS&9z7K@31.128.36.81:5423/club_hranitel"

# Get all city chat IDs from database
CHAT_IDS=$(PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -t -c "SELECT platform_id FROM city_chats_ik;")

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Monday opening for city chats..." >> /var/log/city_chats_schedule.log

# Loop through all chat IDs
for CHAT_ID in $CHAT_IDS; do
  # Remove whitespace
  CHAT_ID=$(echo "$CHAT_ID" | tr -d '[:space:]')
  
  if [ -z "$CHAT_ID" ]; then
    continue
  fi
  
  echo "Processing chat: $CHAT_ID" >> /var/log/city_chats_schedule.log
  
  # Enable chat permissions (open chat for messages)
  # NO message is sent on Monday opening - just silently open the chat
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatPermissions" \
    -H "Content-Type: application/json" \
    -d '{
      "chat_id": '"${CHAT_ID}"',
      "permissions": {
        "can_send_messages": true,
        "can_send_audios": true,
        "can_send_documents": true,
        "can_send_photos": true,
        "can_send_videos": true,
        "can_send_video_notes": true,
        "can_send_voice_notes": false,
        "can_send_polls": false,
        "can_send_other_messages": true,
        "can_add_web_page_previews": false,
        "can_change_info": false,
        "can_invite_users": false,
        "can_pin_messages": false,
        "can_manage_topics": false
      }
    }' >> /var/log/city_chats_schedule.log 2>&1
  
  # Small delay between chats to avoid rate limits
  sleep 0.1
done

echo "$(date '+%Y-%m-%d %H:%M:%S') - City chats opened for Monday" >> /var/log/city_chats_schedule.log
