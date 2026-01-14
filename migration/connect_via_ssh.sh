#!/bin/bash
# Скрипт для создания SSH туннеля к базе данных

echo "🚀 Создание SSH туннеля к базе данных..."

# Параметры
APP_SERVER="root@2.58.98.41"
DB_HOST="31.128.36.81"
DB_PORT="5423"
LOCAL_PORT="15423"

echo "📡 Туннель: localhost:$LOCAL_PORT -> $DB_HOST:$DB_PORT через $APP_SERVER"

# Создаем туннель
# -L local_port:remote_host:remote_port
# -N не выполнять команды
# -f фоновый режим
ssh -L $LOCAL_PORT:$DB_HOST:$DB_PORT $APP_SERVER -N -f

if [ $? -eq 0 ]; then
    echo "✅ SSH туннель создан успешно!"
    echo ""
    echo "Теперь подключайтесь к БД через:"
    echo "  Host: localhost"
    echo "  Port: $LOCAL_PORT"
    echo "  Database: postgres или club_hranitel"
    echo "  User: postgres"
    echo ""
    echo "Пример для Python:"
    echo "  psycopg2.connect(host='localhost', port=$LOCAL_PORT, database='postgres', user='postgres', password='...')"
    echo ""
    echo "Для остановки туннеля:"
    echo "  pkill -f 'ssh -L $LOCAL_PORT:$DB_HOST:$DB_PORT'"
else
    echo "❌ Ошибка при создании туннеля"
    echo "Проверьте:"
    echo "  1. Доступ по SSH: ssh $APP_SERVER"
    echo "  2. Пароль сервера: 6gNJOtZexhZG2nQwiamOYxUx"
fi
