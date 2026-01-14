#!/usr/bin/env python3
"""
Скрипт для анализа существующей базы данных через SSH туннель
"""
import subprocess
import json

# SSH и DB параметры
SSH_HOST = "31.128.36.81"
SSH_USER = "root"
SSH_PASSWORD = "U3S%fZ(D2cru"
DB_NAME = "postgres"
DB_USER = "postgres"

# Таблицы для анализа
PRIORITY_TABLES = [
    'private_club_free_dostup',
    'private_club_transactions',
    'private_club_update_podpiska',
    'private_club_users',
    'prodamus_payments',
    'products',
    'club_email_webapp',
    'statistics_club_IK'
]

def run_ssh_command(command):
    """Выполнить команду через SSH"""
    ssh_cmd = [
        'sshpass', '-p', SSH_PASSWORD,
        'ssh', '-o', 'StrictHostKeyChecking=no',
        f'{SSH_USER}@{SSH_HOST}',
        command
    ]
    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=30)
        return result.stdout, result.stderr, result.returncode
    except Exception as e:
        return None, str(e), 1

def run_psql_query(query):
    """Выполнить SQL запрос через SSH"""
    # Экранируем кавычки в запросе
    escaped_query = query.replace('"', '\\"').replace("'", "'\\''")
    psql_cmd = f"sudo -u {DB_USER} psql -d {DB_NAME} -t -A -F'|' -c \"{escaped_query}\""
    return run_ssh_command(psql_cmd)

def analyze_database():
    """Анализ базы данных"""
    print("=" * 80)
    print("АНАЛИЗ СУЩЕСТВУЮЩЕЙ БАЗЫ ДАННЫХ КЛУБА 'КОД ДЕНЕГ' (через SSH)")
    print("=" * 80)
    print()

    # Проверка подключения
    print("🔌 Проверка SSH подключения...")
    stdout, stderr, code = run_ssh_command("echo 'OK'")
    if code != 0:
        print(f"❌ Ошибка SSH: {stderr}")
        return
    print("✅ SSH подключение успешно")
    print()

    # Список таблиц
    print("📊 Получение списка таблиц...")
    query = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    stdout, stderr, code = run_psql_query(query)

    if code != 0:
        print(f"❌ Ошибка получения таблиц: {stderr}")
        return

    all_tables = [t.strip() for t in stdout.strip().split('\n') if t.strip()]
    print(f"✅ Найдено таблиц: {len(all_tables)}")
    print()

    # Анализ приоритетных таблиц
    print("🔥 ПРИОРИТЕТНЫЕ ТАБЛИЦЫ:")
    print("-" * 80)

    for table in PRIORITY_TABLES:
        if table not in all_tables:
            print(f"\n⚠️  Таблица {table} не найдена")
            continue

        print(f"\n📋 Таблица: {table}")
        print("-" * 40)

        # Количество записей
        query = f"SELECT COUNT(*) FROM {table};"
        stdout, stderr, code = run_psql_query(query)
        if code == 0:
            count = stdout.strip()
            print(f"   Записей: {count}")

        # Структура таблицы
        query = f"""
            SELECT column_name, data_type, character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_name = '{table}'
            ORDER BY ordinal_position;
        """
        stdout, stderr, code = run_psql_query(query)
        if code == 0:
            print(f"   Структура:")
            for line in stdout.strip().split('\n'):
                if line.strip():
                    parts = line.split('|')
                    if len(parts) >= 4:
                        col_name, data_type, max_length, nullable = parts[:4]
                        length_str = f"({max_length})" if max_length != '' else ""
                        nullable_str = "NULL" if nullable == "YES" else "NOT NULL"
                        print(f"      - {col_name}: {data_type}{length_str} {nullable_str}")

        # Примеры данных (3 последние записи)
        # Определяем есть ли колонка id
        query = f"""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = '{table}' AND column_name = 'id';
        """
        stdout, stderr, code = run_psql_query(query)
        has_id = stdout.strip() != ''

        if has_id:
            query = f"SELECT * FROM {table} ORDER BY id DESC LIMIT 2;"
        else:
            query = f"SELECT * FROM {table} LIMIT 2;"

        stdout, stderr, code = run_psql_query(query)
        if code == 0 and stdout.strip():
            print(f"   Последние записи:")
            lines = stdout.strip().split('\n')
            for i, line in enumerate(lines[:2], 1):
                # Ограничиваем вывод
                if len(line) > 200:
                    line = line[:200] + "..."
                print(f"      #{i}: {line}")

    # Остальные таблицы
    print("\n" + "=" * 80)
    print("📚 ОСТАЛЬНЫЕ ТАБЛИЦЫ:")
    print("-" * 80)

    other_tables = [t for t in all_tables if t not in PRIORITY_TABLES]
    for table in sorted(other_tables):
        query = f"SELECT COUNT(*) FROM {table};"
        stdout, stderr, code = run_psql_query(query)
        count = stdout.strip() if code == 0 else "?"
        print(f"   - {table}: {count} записей")

    print("\n" + "=" * 80)
    print("✅ АНАЛИЗ ЗАВЕРШЁН")
    print("=" * 80)

if __name__ == "__main__":
    try:
        analyze_database()
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
