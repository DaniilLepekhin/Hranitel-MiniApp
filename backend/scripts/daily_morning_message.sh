#!/bin/bash

# Daily morning message to chat "КОД УСПЕХА | ЧАТ КЛУБА"
# Scheduled at 10:00 Moscow time (07:00 UTC)
# Crontab entry: 0 7 * * * /var/www/hranitel/backend/scripts/daily_morning_message.sh

BOT_TOKEN="8233570593:AAFUrEuTDQbUvwollurpJhxynMHu54i4_sk"
CHAT_ID="-1003590120817"

MESSAGE='С новым днем, дорогие! ♥️

Наступило 10:00, и наш круг снова оживает.

Мы верим, что за время тишины вы успели перезагрузиться и наполниться энергией.

Давайте начнем этот день вместе, ведь вместе мы — сила. 🙏

<b>💫 Поделитесь одним словом-настройкой на
сегодня: какое оно у вас?»</b>'

# Send message with HTML parsing
curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  -d "text=${MESSAGE}" \
  -d "parse_mode=HTML"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Daily morning message sent to chat ${CHAT_ID}"
