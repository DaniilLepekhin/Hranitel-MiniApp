#!/bin/bash
# Скрипт для проверки подключения к БД с application server

echo "🔍 Проверка подключения к БД с application server..."

ssh root@2.58.98.41 << 'ENDSSH'
echo "📍 Я на сервере: $(hostname)"
echo ""

# Проверить наличие .env файлов с паролями
echo "🔑 Поиск .env файлов с DATABASE_URL:"
find /var/www /root -name ".env*" -type f 2>/dev/null | while read file; do
    if grep -q "DATABASE" "$file" 2>/dev/null; then
        echo "  Найден: $file"
        echo "  ---"
        grep "DATABASE" "$file" | head -5
        echo ""
    fi
done

# Проверить docker-compose файлы
echo "🐳 Проверка docker-compose.yml:"
find /var/www -name "docker-compose*.yml" -type f 2>/dev/null | while read file; do
    echo "  Файл: $file"
    if grep -q "postgres" "$file"; then
        echo "  Postgres конфиг:"
        grep -A 5 "postgres" "$file"
    fi
    echo ""
done

# Проверить активные PostgreSQL процессы
echo "💽 PostgreSQL процессы:"
ps aux | grep postgres | grep -v grep | head -5

# Проверить подключение к БД
echo ""
echo "🔌 Попытка подключения к БД:"
if command -v psql &> /dev/null; then
    echo "psql установлен"
    # Попробуем разные варианты
    PGPASSWORD="U3S%fZ(D2cru" psql -h 31.128.36.81 -p 5423 -U postgres -d postgres -c "\l" 2>&1 | head -10
else
    echo "psql не установлен, попробуйте установить: apt-get install postgresql-client"
fi

ENDSSH

echo ""
echo "✅ Проверка завершена"
