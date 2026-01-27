#!/bin/bash

# Morning chat opening script
# Runs at 10:00 Moscow time (07:00 UTC)
# Crontab: 0 7 * * * /var/www/hranitel/backend/scripts/chat_open_morning.sh

BOT_TOKEN="8233570593:AAFUrEuTDQbUvwollurpJhxynMHu54i4_sk"
CHAT_ID="-1003590120817"

# 1. Send morning message
MESSAGE='С новым днем, дорогие! ♥️

Наступило 10:00, и наш круг снова оживает.

Мы верим, что за время тишины вы успели перезагрузиться и наполниться энергией.

Давайте начнем этот день вместе, ведь вместе мы — сила. 🙏

<b>💫 Поделитесь одним словом-настройкой на
сегодня: какое оно у вас?»</b>'

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  -d "text=${MESSAGE}" \
  -d "parse_mode=HTML"

# 2. Enable chat permissions (open chat for messages)
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
  }'

echo "$(date '+%Y-%m-%d %H:%M:%S') - Chat opened (morning)" >> /var/log/chat_schedule.log
