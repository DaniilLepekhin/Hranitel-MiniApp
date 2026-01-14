#!/bin/bash

# Script to add test content data to production database
# Usage: bash apply-test-content.sh

set -e

echo "🧪 Добавление тестовых данных в базу club_hranitel..."
echo ""

# Apply test content
PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -f add-test-content.sql

echo ""
echo "✅ Тестовые данные успешно добавлены!"
echo ""
echo "📊 Проверка содержимого:"
echo ""

# Count content items
echo "Контент:"
PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -c "SELECT type, COUNT(*) as count FROM content_items GROUP BY type;"

echo ""
echo "Секции:"
PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -c "SELECT COUNT(*) as count FROM content_sections;"

echo ""
echo "Видео:"
PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -c "SELECT COUNT(*) as count FROM videos;"

echo ""
echo "Таймкоды:"
PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -c "SELECT COUNT(*) as count FROM video_timecodes;"

echo ""
echo "🎉 Готово! Теперь можно тестировать приложение с реальными данными."
