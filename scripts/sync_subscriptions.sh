#!/bin/bash
# Скрипт синхронизации подписок из старой базы (postgres.private_club_users) в новую (club_hranitel.users)
# Обновляет subscription_expires только если в старой базе дата больше
#
# Использование: ./sync_subscriptions.sh
# Можно добавить в cron: */15 * * * * /path/to/sync_subscriptions.sh >> /var/log/sync_subscriptions.log 2>&1

DB_HOST="localhost"
DB_PORT="5423"
DB_USER="postgres"
DB_PASS="kH*kyrS&9z7K"

export PGPASSWORD="$DB_PASS"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting subscription sync..."

# 1. Экспортируем активные подписки из старой базы
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "
COPY (SELECT platform_id, date_end FROM private_club_users WHERE date_end > NOW())
TO '/tmp/old_subscriptions.csv' WITH CSV HEADER;
" 2>/dev/null

# 2. Импортируем и обновляем в новой базе
UPDATED=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d club_hranitel -t -c "
-- Создаём временную таблицу
CREATE TEMP TABLE old_subs (
    platform_id bigint,
    date_end timestamp
);
COPY old_subs FROM '/tmp/old_subscriptions.csv' WITH CSV HEADER;

-- Обновляем subscription_expires где старая дата больше
WITH updated AS (
    UPDATE users u
    SET subscription_expires = o.date_end,
        is_pro = true,
        updated_at = NOW()
    FROM old_subs o
    WHERE o.platform_id = u.telegram_id
    AND (o.date_end > u.subscription_expires OR u.subscription_expires IS NULL)
    RETURNING u.telegram_id
)
SELECT COUNT(*) FROM updated;
" 2>/dev/null | tr -d ' ')

# 3. Чистим временный файл
rm -f /tmp/old_subscriptions.csv

echo "$(date '+%Y-%m-%d %H:%M:%S') - Sync completed. Updated: $UPDATED records"

if [ "$UPDATED" -gt 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Records with extended subscriptions were found and updated"
fi
