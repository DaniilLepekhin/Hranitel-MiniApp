#!/bin/bash

# Evening chat closing script
# Runs at 22:00 Moscow time (19:00 UTC)
# Crontab: 0 19 * * * /var/www/hranitel/backend/scripts/chat_close_evening.sh

BOT_TOKEN="8233570593:AAFUrEuTDQbUvwollurpJhxynMHu54i4_sk"
CHAT_ID="-1003590120817"

# 1. Send evening message
MESSAGE='Вечер — время для тишины и перезагрузки. ✨

Дорогие, в 22:00 мы бережно закрываем наш чат до утра.

Пусть ваша ночь будет спокойной и восстанавливающей.

Чат снова откроется в 10:00 — будем ждать вас отдохнувшими, чтобы встретить новый день всем вместе🙌🏻

Начинать день в кругу единомышленниц — бесценно ♥️

До завтра!'

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  -d "text=${MESSAGE}" \
  -d "parse_mode=HTML"

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
  }'

echo "$(date '+%Y-%m-%d %H:%M:%S') - Chat closed (evening)" >> /var/log/chat_schedule.log
