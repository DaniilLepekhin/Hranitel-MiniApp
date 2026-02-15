#!/bin/bash

# Sunday city chats closing script
# Runs at 10:00 Moscow time on Sunday (07:00 UTC Sunday)
# Crontab: 0 7 * * 0 /var/www/hranitel/backend/scripts/city_chats_close_sunday.sh

BOT_TOKEN="8233570593:AAFUrEuTDQbUvwollurpJhxynMHu54i4_sk"
DB_CONNECTION="postgresql://postgres:kH*kyrS&9z7K@31.128.36.81:5423/club_hranitel"

# Get all city chat IDs from database
CHAT_IDS=$(PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -t -c "SELECT platform_id FROM city_chats_ik;")

# Message to send before closing
MESSAGE='Дорогие участники!


Неделя в нашем клубе, позади. Настало время немного выдохнуть❤️


Сейчас важно восстановить силы, чтобы с лёгкостью войти в новую неделю.


Это возможность побыть наедине с собой, в кругу семьи или друзей, порефлексировать, наполниться, порадовать своего внутреннего ребенка и просто выспаться - каждый выберет что-то свое❤️


В понедельник мы начнем работу в обычном режиме


Обязательно отдохните, чтобы следующая неделя прошла максимально продуктивно'

# Image URL
PHOTO_URL="https://t.me/mate_bot_open/9857"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Sunday closure for city chats..." >> /var/log/city_chats_schedule.log

# Loop through all chat IDs
for CHAT_ID in $CHAT_IDS; do
  # Remove whitespace
  CHAT_ID=$(echo "$CHAT_ID" | tr -d '[:space:]')
  
  if [ -z "$CHAT_ID" ]; then
    continue
  fi
  
  echo "Processing chat: $CHAT_ID" >> /var/log/city_chats_schedule.log
  
  # 1. Send image with message
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto" \
    -d "chat_id=${CHAT_ID}" \
    -d "photo=${PHOTO_URL}" \
    -d "caption=${MESSAGE}" \
    >> /var/log/city_chats_schedule.log 2>&1
  
  # Small delay to avoid hitting rate limits
  sleep 0.1
  
  # 2. Disable ALL chat permissions (close chat completely)
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatPermissions" \
    -H "Content-Type: application/json" \
    -d '{
      "chat_id": '"${CHAT_ID}"',
      "permissions": {
        "can_send_messages": false,
        "can_send_audios": false,
        "can_send_documents": false,
        "can_send_photos": false,
        "can_send_videos": false,
        "can_send_video_notes": false,
        "can_send_voice_notes": false,
        "can_send_polls": false,
        "can_send_other_messages": false,
        "can_add_web_page_previews": false,
        "can_change_info": false,
        "can_invite_users": false,
        "can_pin_messages": false,
        "can_manage_topics": false
      }
    }' >> /var/log/city_chats_schedule.log 2>&1
  
  # Small delay between chats
  sleep 0.1
done

echo "$(date '+%Y-%m-%d %H:%M:%S') - City chats closed for Sunday" >> /var/log/city_chats_schedule.log
