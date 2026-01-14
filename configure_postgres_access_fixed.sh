#!/bin/bash
# Исправленный скрипт настройки доступа к PostgreSQL

set -e

SSH_HOST="31.128.36.81"
SSH_USER="root"
SSH_PASSWORD="U3S%fZ(D2cru"
CONTAINER="postgres"
APP_SERVER_IP="2.58.98.41"
POSTGRES_PORT="5423"  # Реальный порт из docker ps

echo "=========================================="
echo "🔧 НАСТРОЙКА УДАЛЕННОГО ДОСТУПА К POSTGRESQL"
echo "=========================================="
echo ""

echo "📋 Обнаружено: PostgreSQL работает на порту $POSTGRES_PORT"
echo ""

echo "1️⃣  Найти путь к данным PostgreSQL..."
DATA_DIR=$(sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" \
  "docker inspect postgres | grep -A 5 'Mounts' | grep 'Source' | head -1 | awk -F'\"' '{print \$4}'")

echo "   Найдено: $DATA_DIR"
echo ""

echo "2️⃣  Настройка postgresql.conf..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" << ENDSSH
# Проверяем текущую конфигурацию
docker exec postgres psql -U postgres -c "SHOW listen_addresses;"

# Изменяем listen_addresses через ALTER SYSTEM
docker exec postgres psql -U postgres -c "ALTER SYSTEM SET listen_addresses = '*';"

echo "✅ listen_addresses настроен"
ENDSSH

echo ""
echo "3️⃣  Настройка pg_hba.conf (разрешить подключения)..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" << ENDSSH
# Добавляем правило для сервера приложения
docker exec postgres bash -c "grep -q '$APP_SERVER_IP' /var/lib/postgresql/data/pg_hba.conf || echo 'host    all             all             $APP_SERVER_IP/32         md5' >> /var/lib/postgresql/data/pg_hba.conf"

# Добавляем правило для всех (на случай, если IP изменится)
docker exec postgres bash -c "grep -q '0.0.0.0/0' /var/lib/postgresql/data/pg_hba.conf || echo 'host    all             all             0.0.0.0/0                 md5' >> /var/lib/postgresql/data/pg_hba.conf"

echo "✅ pg_hba.conf настроен"
ENDSSH

echo ""
echo "4️⃣  Перезапуск PostgreSQL для применения изменений..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" \
  "docker restart $CONTAINER"

echo "⏳ Ожидание запуска PostgreSQL (15 сек)..."
sleep 15

echo ""
echo "5️⃣  Проверка конфигурации..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" \
  "docker exec postgres psql -U postgres -c \"SHOW listen_addresses;\""

echo ""
echo "6️⃣  Настройка firewall (открыть порт $POSTGRES_PORT)..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" << ENDSSH
# Проверяем есть ли ufw
if command -v ufw &> /dev/null; then
  echo "UFW найден, настраиваем правила..."
  ufw allow from $APP_SERVER_IP to any port $POSTGRES_PORT comment 'PostgreSQL from app server'
  ufw allow $POSTGRES_PORT/tcp comment 'PostgreSQL'
  ufw status | grep $POSTGRES_PORT
else
  echo "UFW не найден, проверяем iptables..."
  if command -v iptables &> /dev/null; then
    iptables -I INPUT -p tcp --dport $POSTGRES_PORT -j ACCEPT
    iptables -I INPUT -s $APP_SERVER_IP -p tcp --dport $POSTGRES_PORT -j ACCEPT
    echo "✅ iptables настроен"
  fi
fi
ENDSSH

echo ""
echo "=========================================="
echo "✅ НАСТРОЙКА ЗАВЕРШЕНА!"
echo "=========================================="
echo ""
echo "📝 Connection String для приложения:"
echo "   DATABASE_URL=postgresql://postgres:U3S%fZ(D2cru@31.128.36.81:$POSTGRES_PORT/club_hranitel"
echo ""
echo "🧪 Тестирование подключения:"
echo "   Выполните на сервере приложения (2.58.98.41):"
echo "   docker run --rm postgres:18 psql -h 31.128.36.81 -p $POSTGRES_PORT -U postgres -d club_hranitel -c 'SELECT version();'"
echo ""
