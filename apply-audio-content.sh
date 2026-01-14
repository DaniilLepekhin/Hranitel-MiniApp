#!/bin/bash

# Script to apply audio/video test content to production database
# Добавляет практики с аудио, курсы с видео, подкасты

echo "🎵 Applying audio/video test content to database..."

# Database connection details
DB_HOST="31.128.36.81"
DB_PORT="5423"
DB_NAME="club_hranitel"
DB_USER="postgres"
DB_PASSWORD="kH*kyrS&9z7K"

# Apply SQL file
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f add-audio-test-content.sql

if [ $? -eq 0 ]; then
  echo "✅ Audio/video content added successfully!"
  echo ""
  echo "📊 Added content:"
  echo "  - Практики с аудио-гайдами (3 треки каждая)"
  echo "  - Новый подкаст 'Истории миллионеров' (3 эпизода)"
  echo "  - Новый курс 'Основы финансовой грамотности' с видео (ПРОГРАММА МЕСЯЦА)"
  echo "  - Новый курс 'Инвестиции для начинающих' с видео"
  echo "  - Новый эфир 'Разбор бизнес-кейсов' с таймкодами"
  echo "  - Обложки и таймкоды для существующих материалов"
  echo ""
  echo "🎯 Ready to test!"
else
  echo "❌ Failed to apply content"
  exit 1
fi
