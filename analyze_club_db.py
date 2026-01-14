#!/usr/bin/env python3
"""
Полный анализ существующей БД клуба КОД ДЕНЕГ (в Docker контейнере)
"""
import subprocess
import json

SSH_HOST = "31.128.36.81"
SSH_USER = "root"
SSH_PASSWORD = "U3S%fZ(D2cru"
CONTAINER = "postgres"

PRIORITY_TABLES = [
    'private_club_free_dostup',        # Бесплатные доступы
    'private_club_transactions',       # Транзакции (баллы)
    'private_club_update_podpiska',    # Логи обновления подписок
    'private_club_users',              # Пользователи клуба
    'prodamus_payments',               # Платежи
    'products',                        # Продукты
    'club_email_webapp',               # Формы перед оплатой
    'statistics_club_IK',              # Статистика заходов
]

def ssh_cmd(cmd):
    """Execute SSH command"""
    full_cmd = ['sshpass', '-p', SSH_PASSWORD, 'ssh', '-o', 'StrictHostKeyChecking=no', f'{SSH_USER}@{SSH_HOST}', cmd]
    result = subprocess.run(full_cmd, capture_output=True, text=True, timeout=60)
    return result.stdout

def psql_query(query):
    """Execute PostgreSQL query in Docker"""
    escaped = query.replace("'", "'\\''")
    cmd = f"docker exec {CONTAINER} psql -U postgres -d postgres -t -A -F'|' -c '{escaped}' 2>/dev/null"
    return ssh_cmd(cmd)

def psql_describe(table):
    """Describe table structure"""
    cmd = f"docker exec {CONTAINER} psql -U postgres -d postgres -c '\\d {table}' 2>/dev/null"
    return ssh_cmd(cmd)

print("=" * 100)
print("📊 АНАЛИЗ СУЩЕСТВУЮЩЕЙ БАЗЫ ДАННЫХ КЛУБА 'КОД ДЕНЕГ' (Docker PostgreSQL)")
print("=" * 100)
print()

# Test connection
print("🔌 Проверка подключения...")
result = ssh_cmd("docker exec postgres psql -U postgres -d postgres -c 'SELECT version();' 2>/dev/null | head -3")
if 'PostgreSQL' in result:
    lines = result.strip().split('\n')
    version_line = next((l for l in lines if 'PostgreSQL' in l), "Connected")
    print(f"✅ {version_line}")
else:
    print("❌ Ошибка подключения")
    exit(1)
print()

# Get all tables
print("📋 Получение списка таблиц...")
output = psql_query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;")
all_tables = [line.strip() for line in output.strip().split('\n') if line.strip()]
print(f"✅ Найдено таблиц: {len(all_tables)}")
print()

# Analyze priority tables
print("🔥 ДЕТАЛЬНЫЙ АНАЛИЗ ПРИОРИТЕТНЫХ ТАБЛИЦ:")
print("=" * 100)

for table in PRIORITY_TABLES:
    if table not in all_tables:
        print(f"\n⚠️  Таблица '{table}' не найдена!")
        continue

    print(f"\n{'='*100}")
    print(f"📋 ТАБЛИЦА: {table}")
    print(f"{'='*100}")

    # Count
    output = psql_query(f"SELECT COUNT(*) FROM {table};")
    count = output.strip()
    print(f"\n📊 Количество записей: {count:>10}")

    # Structure
    print(f"\n📐 СТРУКТУРА ТАБЛИЦЫ:")
    print("-" * 100)
    describe_output = psql_describe(table)
    in_columns = False
    columns = []

    for line in describe_output.split('\n'):
        line_stripped = line.strip()

        if 'Column' in line and 'Type' in line:
            in_columns = True
            print(f"{'Колонка':<30} | {'Тип':<25} | {'Nullable':<10}")
            print("-" * 100)
            continue

        if in_columns:
            if line_stripped.startswith('---') or line_stripped.startswith('Indexes') or not line_stripped or line_stripped.startswith('Foreign'):
                in_columns = False
                continue

            if '|' in line:
                parts = [p.strip() for p in line.split('|')]
                if len(parts) >= 3:
                    col_name, col_type, nullable = parts[0], parts[1], parts[2]
                    columns.append(col_name)
                    print(f"{col_name:<30} | {col_type:<25} | {nullable:<10}")

    # Sample data with column headers
    try:
        record_count = int(count) if count.strip() else 0
    except:
        record_count = 0

    if record_count > 0:
        print(f"\n📝 ПРИМЕРЫ ДАННЫХ (последние 3 записи):")
        print("-" * 100)

        # Get column names if not already
        if not columns:
            col_query = f"""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = '{table}'
                ORDER BY ordinal_position;
            """
            col_output = psql_query(col_query)
            columns = [line.strip() for line in col_output.strip().split('\n') if line.strip()]

        # Get sample data
        has_id = 'id' in columns
        if has_id:
            sample_query = f"SELECT * FROM {table} ORDER BY id DESC LIMIT 3;"
        else:
            sample_query = f"SELECT * FROM {table} LIMIT 3;"

        sample_output = psql_query(sample_query)

        if sample_output.strip():
            print(f"\nКолонки: {', '.join(columns)}\n")

            for i, line in enumerate(sample_output.strip().split('\n')[:3], 1):
                print(f"Запись #{i}:")
                values = line.split('|')

                for col, val in zip(columns, values):
                    # Truncate long values
                    val_display = val if len(val) <= 80 else val[:80] + "..."
                    print(f"  {col:<25} = {val_display}")
                print()

    # Key statistics
    print(f"\n📈 КЛЮЧЕВАЯ СТАТИСТИКА:")
    print("-" * 100)

    # For transaction table - sum of points
    if table == 'private_club_transactions':
        stats = [
            ("Всего транзакций", f"SELECT COUNT(*) FROM {table};"),
            ("Сумма всех баллов", f"SELECT COALESCE(SUM(points), 0) FROM {table};"),
            ("Средний балл", f"SELECT COALESCE(ROUND(AVG(points), 2), 0) FROM {table};"),
            ("Уникальных пользователей", f"SELECT COUNT(DISTINCT COALESCE(telegram_id, user_id)) FROM {table} WHERE COALESCE(telegram_id, user_id) IS NOT NULL;"),
        ]
        for stat_name, query in stats:
            try:
                result = psql_query(query)
                print(f"  {stat_name:<30} = {result.strip()}")
            except:
                pass

    # For users table
    elif table == 'private_club_users':
        stats = [
            ("Всего пользователей", f"SELECT COUNT(*) FROM {table};"),
            ("Активных подписок", f"SELECT COUNT(*) FROM {table} WHERE subscription_end > NOW();"),
            ("Истекших подписок", f"SELECT COUNT(*) FROM {table} WHERE subscription_end <= NOW();"),
        ]
        for stat_name, query in stats:
            try:
                result = psql_query(query)
                print(f"  {stat_name:<30} = {result.strip()}")
            except:
                pass

    # For payments table
    elif table == 'prodamus_payments':
        stats = [
            ("Всего платежей", f"SELECT COUNT(*) FROM {table};"),
            ("Сумма платежей", f"SELECT COALESCE(SUM(CAST(sum AS NUMERIC)), 0) FROM {table} WHERE sum ~ '^[0-9.]+$';"),
            ("Успешных платежей", f"SELECT COUNT(*) FROM {table} WHERE status = 'success' OR payment_status = 'success';"),
        ]
        for stat_name, query in stats:
            try:
                result = psql_query(query)
                print(f"  {stat_name:<30} = {result.strip()}")
            except:
                pass

print("\n" + "=" * 100)
print("📚 СПИСОК ВСЕХ ОСТАЛЬНЫХ ТАБЛИЦ:")
print("=" * 100)

other_tables = sorted([t for t in all_tables if t not in PRIORITY_TABLES])
for i, table in enumerate(other_tables, 1):
    output = psql_query(f"SELECT COUNT(*) FROM {table};")
    count = output.strip()
    print(f"  {i:2}. {table:<50} - {count:>10} записей")

print("\n" + "=" * 100)
print("✅ АНАЛИЗ ЗАВЕРШЁН")
print("=" * 100)
