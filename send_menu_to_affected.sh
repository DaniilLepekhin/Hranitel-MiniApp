#!/bin/bash

# Скрипт для отправки меню всем пострадавшим пользователям
# ВАЖНО: Запускать ТОЛЬКО после исправления бага в коде!

API_URL="https://hranitel.daniillepekhin.com/api/admin/manual-payment"
SECRET="local-dev-secret"

echo "=== Поиск пострадавших пользователей ==="

# Получить список telegram_id пострадавших пользователей
AFFECTED_USERS=$(sshpass -p 'U3S%fZ(D2cru' ssh -o StrictHostKeyChecking=no root@31.128.36.81 << 'ENDSSH'
PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -t -c "
SELECT telegram_id
FROM users
WHERE
  is_pro = true
  AND onboarding_step = 'onboarding_complete'
  AND subscription_expires > NOW()
  AND created_at >= '2024-01-01'
ORDER BY created_at DESC;
"
ENDSSH
)

# Подсчитать количество
COUNT=$(echo "$AFFECTED_USERS" | grep -v '^$' | wc -l)
echo "Найдено пострадавших пользователей: $COUNT"

if [ $COUNT -eq 0 ]; then
  echo "Нет пострадавших пользователей. Завершение."
  exit 0
fi

echo ""
echo "=== Список пострадавших пользователей ==="
echo "$AFFECTED_USERS" | grep -v '^$'

echo ""
read -p "Отправить меню всем этим пользователям? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Отменено."
  exit 0
fi

echo ""
echo "=== Отправка меню ==="

SUCCESS_COUNT=0
FAILED_COUNT=0

while IFS= read -r telegram_id; do
  # Пропускаем пустые строки
  if [ -z "$(echo $telegram_id | tr -d '[:space:]')" ]; then
    continue
  fi

  # Убираем пробелы
  telegram_id=$(echo $telegram_id | tr -d '[:space:]')

  echo -n "Отправка меню пользователю $telegram_id... "

  # Отправляем запрос к API (duration_days: 0 = не менять подписку, только отправить меню)
  RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "x-admin-secret: $SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"telegram_id\": \"$telegram_id\", \"duration_days\": 0}")

  # Проверяем успешность
  if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ OK"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo "❌ FAILED"
    echo "   Response: $RESPONSE"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi

  # Пауза между запросами (чтобы не перегрузить бота)
  sleep 1
done <<< "$AFFECTED_USERS"

echo ""
echo "=== ИТОГО ==="
echo "Успешно: $SUCCESS_COUNT"
echo "Ошибок: $FAILED_COUNT"
echo "Всего: $COUNT"
