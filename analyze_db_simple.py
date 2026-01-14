#!/usr/bin/env python3
"""
Упрощенный скрипт для анализа БД через SSH
"""
import subprocess
import sys

SSH_HOST = "31.128.36.81"
SSH_USER = "root"
SSH_PASSWORD = "U3S%fZ(D2cru"

TABLES = [
    'private_club_free_dostup',
    'private_club_transactions',
    'private_club_update_podpiska',
    'private_club_users',
    'prodamus_payments',
    'products',
    'club_email_webapp',
    'statistics_club_IK'
]

def ssh_exec(cmd):
    """Execute command via SSH"""
    full_cmd = ['sshpass', '-p', SSH_PASSWORD, 'ssh', '-o', 'StrictHostKeyChecking=no', f'{SSH_USER}@{SSH_HOST}', cmd]
    result = subprocess.run(full_cmd, capture_output=True, text=True, timeout=30)
    return result.stdout

print("="*80)
print("АНАЛИЗ БАЗЫ ДАННЫХ КЛУБА 'КОД ДЕНЕГ'")
print("="*80)
print()

# List all tables
print("📊 Получение списка таблиц...")
output = ssh_exec("sudo -u postgres psql -d postgres -t -c '\\dt public.*' 2>/dev/null")
all_tables = []
for line in output.split('\n'):
    if '|' in line:
        parts = line.split('|')
        if len(parts) >= 2:
            table_name = parts[1].strip()
            if table_name:
                all_tables.append(table_name)

print(f"✅ Найдено таблиц: {len(all_tables)}")
print()

print("🔥 АНАЛИЗ ПРИОРИТЕТНЫХ ТАБЛИЦ:")
print("-"*80)

for table in TABLES:
    if table not in all_tables:
        print(f"⚠️  Таблица '{table}' не найдена")
        continue

    print(f"\n📋 Таблица: {table}")
    print("-"*40)

    # Count records
    output = ssh_exec(f"sudo -u postgres psql -d postgres -t -c 'SELECT COUNT(*) FROM {table};' 2>/dev/null")
    count = output.strip()
    print(f"   Записей: {count}")

    # Get structure
    cmd = f"sudo -u postgres psql -d postgres -c '\\d {table}' 2>/dev/null"
    output = ssh_exec(cmd)
    print(f"   Структура:")
    in_columns = False
    for line in output.split('\n'):
        line = line.strip()
        if 'Column' in line and 'Type' in line:
            in_columns = True
            continue
        if in_columns:
            if line.startswith('---') or line.startswith('Indexes') or not line:
                in_columns = False
                continue
            if '|' in line:
                parts = [p.strip() for p in line.split('|')]
                if len(parts) >= 2:
                    print(f"      - {parts[0]}: {parts[1]}")

    # Sample data
    cmd = f"sudo -u postgres psql -d postgres -t -A -F'|' -c 'SELECT * FROM {table} ORDER BY id DESC LIMIT 2;' 2>/dev/null"
    output = ssh_exec(cmd)
    if output.strip():
        print(f"   Последние записи:")
        for i, line in enumerate(output.strip().split('\n')[:2], 1):
            # Truncate long lines
            if len(line) > 150:
                line = line[:150] + "..."
            print(f"      #{i}: {line}")

print("\n" + "="*80)
print("📚 ОСТАЛЬНЫЕ ТАБЛИЦЫ:")
print("-"*80)

other_tables = sorted([t for t in all_tables if t not in TABLES])
for table in other_tables:
    output = ssh_exec(f"sudo -u postgres psql -d postgres -t -c 'SELECT COUNT(*) FROM {table};' 2>/dev/null")
    count = output.strip()
    print(f"   - {table}: {count} записей")

print("\n" + "="*80)
print("✅ АНАЛИЗ ЗАВЕРШЁН")
print("="*80)
