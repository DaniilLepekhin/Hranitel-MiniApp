#!/bin/bash
# Скрипт для создания новой базы данных club_hranitel на сервере 31.128.36.81

set -e

SSH_HOST="31.128.36.81"
SSH_USER="root"
SSH_PASSWORD="U3S%fZ(D2cru"
CONTAINER="postgres"
NEW_DB="club_hranitel"

echo "=========================================="
echo "📦 СОЗДАНИЕ НОВОЙ БД: $NEW_DB"
echo "=========================================="
echo ""

# 1. Создать новую БД
echo "1️⃣  Создание базы данных $NEW_DB..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" \
  "docker exec $CONTAINER psql -U postgres -c \"CREATE DATABASE $NEW_DB;\" 2>/dev/null || echo 'БД уже существует'"

# 2. Проверить создание
echo "2️⃣  Проверка создания БД..."
RESULT=$(sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" \
  "docker exec $CONTAINER psql -U postgres -t -c \"SELECT 1 FROM pg_database WHERE datname='$NEW_DB';\"")

if [[ "$RESULT" == *"1"* ]]; then
  echo "✅ База данных $NEW_DB успешно создана!"
else
  echo "❌ Ошибка при создании БД"
  exit 1
fi

# 3. Настроить права доступа
echo "3️⃣  Настройка прав доступа..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" \
  "docker exec $CONTAINER psql -U postgres -d $NEW_DB -c \"GRANT ALL PRIVILEGES ON DATABASE $NEW_DB TO postgres;\""

echo ""
echo "=========================================="
echo "✅ НАСТРОЙКА ЗАВЕРШЕНА!"
echo "=========================================="
echo ""
echo "📋 Информация о подключении:"
echo "   Host: $SSH_HOST"
echo "   Port: 5432"
echo "   Database: $NEW_DB"
echo "   User: postgres"
echo "   Password: $SSH_PASSWORD"
echo ""
echo "🔌 Connection String:"
echo "   postgresql://postgres:$SSH_PASSWORD@$SSH_HOST:5432/$NEW_DB"
echo ""
