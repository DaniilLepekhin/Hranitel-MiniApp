#!/bin/bash
# Скрипт для настройки удаленного доступа к PostgreSQL в Docker

set -e

SSH_HOST="31.128.36.81"
SSH_USER="root"
SSH_PASSWORD="U3S%fZ(D2cru"
CONTAINER="postgres"
APP_SERVER_IP="2.58.98.41"

echo "=========================================="
echo "🔧 НАСТРОЙКА УДАЛЕННОГО ДОСТУПА К POSTGRESQL"
echo "=========================================="
echo ""

echo "1️⃣  Проверка текущей конфигурации Docker..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" \
  "docker ps | grep $CONTAINER"

echo ""
echo "2️⃣  Настройка postgresql.conf (разрешить удаленные подключения)..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" << 'ENDSSH'
docker exec postgres bash -c "
  echo \"listen_addresses = '*'\" >> /var/lib/postgresql/data/postgresql.conf
"
ENDSSH

echo ""
echo "3️⃣  Настройка pg_hba.conf (разрешить подключения с сервера приложения)..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" << ENDSSH
docker exec postgres bash -c "
  echo \"# Allow connections from app server\" >> /var/lib/postgresql/data/pg_hba.conf
  echo \"host    all             all             $APP_SERVER_IP/32         md5\" >> /var/lib/postgresql/data/pg_hba.conf
  echo \"host    all             all             0.0.0.0/0                 md5\" >> /var/lib/postgresql/data/pg_hba.conf
"
ENDSSH

echo ""
echo "4️⃣  Проверка docker-compose.yml (порты должны быть открыты)..."
echo "   ВНИМАНИЕ: Убедитесь, что в docker-compose.yml PostgreSQL имеет:"
echo "   ports:"
echo "     - \"5432:5432\""
echo ""
echo "   Если порты не открыты, выполните:"
echo "   1. Отредактировать docker-compose.yml"
echo "   2. docker-compose down && docker-compose up -d"

echo ""
echo "5️⃣  Перезапуск контейнера PostgreSQL..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" \
  "docker restart $CONTAINER"

echo ""
echo "⏳ Ожидание запуска PostgreSQL (10 сек)..."
sleep 10

echo ""
echo "6️⃣  Настройка firewall (открыть порт 5432)..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" << 'ENDSSH'
# Проверяем есть ли ufw
if command -v ufw &> /dev/null; then
  echo "UFW найден, настраиваем правила..."
  ufw allow from 2.58.98.41 to any port 5432
  ufw allow 5432/tcp
  ufw status
else
  echo "UFW не найден, проверяем iptables..."
  if command -v iptables &> /dev/null; then
    iptables -I INPUT -p tcp --dport 5432 -j ACCEPT
    iptables -I INPUT -s 2.58.98.41 -p tcp --dport 5432 -j ACCEPT
  fi
fi
ENDSSH

echo ""
echo "=========================================="
echo "✅ НАСТРОЙКА ЗАВЕРШЕНА!"
echo "=========================================="
echo ""
echo "🧪 Тестирование подключения с сервера приложения:"
echo "   ssh root@2.58.98.41"
echo "   psql -h 31.128.36.81 -U postgres -d club_hranitel"
echo ""
echo "📝 Connection String для приложения:"
echo "   DATABASE_URL=postgresql://postgres:U3S%fZ(D2cru@31.128.36.81:5432/club_hranitel"
echo ""
