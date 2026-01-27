#!/bin/bash

# Set chat permissions for "КОД УСПЕХА | ЧАТ КЛУБА"
# Run once to configure permissions

BOT_TOKEN="8233570593:AAFUrEuTDQbUvwollurpJhxynMHu54i4_sk"
CHAT_ID="-1003590120817"

# Permissions based on screenshot:
# - can_send_messages: true (отправка сообщений)
# - can_send_audios: true (аудио)
# - can_send_documents: true (файлы)
# - can_send_photos: true (фото)
# - can_send_videos: true (видео)
# - can_send_video_notes: true (видеосообщения кружочки)
# - can_send_voice_notes: false (голосовые сообщения - ВЫКЛ)
# - can_send_polls: false (опросы - ВЫКЛ)
# - can_send_other_messages: true (стикеры/GIF)
# - can_add_web_page_previews: false (превью ссылок - ВЫКЛ)
# - can_change_info: false (изменение профиля чата - ВЫКЛ)
# - can_invite_users: false (добавление участников - ВЫКЛ)
# - can_pin_messages: false (закрепление сообщений - ВЫКЛ)
# - can_manage_topics: false (управление темами - ВЫКЛ)

PERMISSIONS='{
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
}'

echo "Setting chat permissions for chat ${CHAT_ID}..."

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatPermissions" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": ${CHAT_ID}, \"permissions\": ${PERMISSIONS}}"

echo ""
echo "Done!"
