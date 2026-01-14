#!/usr/bin/env python3
"""
Скрипт для анализа структуры старой БД private_club
Подключается к БД и анализирует таблицы с данными пользователей и транзакций
"""

import psycopg2
from datetime import datetime
import json

# Параметры подключения
# Попробуем разные варианты подключения
DB_CONFIGS = [
    {
        'name': 'Вариант 1: postgres с новым паролем',
        'host': '31.128.36.81',
        'port': 5423,
        'database': 'postgres',
        'user': 'postgres',
        'password': 'kH*kyrS&9z7K'
    },
    {
        'name': 'Вариант 2: club_hranitel DB с новым паролем',
        'host': '31.128.36.81',
        'port': 5423,
        'database': 'club_hranitel',
        'user': 'postgres',
        'password': 'kH*kyrS&9z7K'
    },
    {
        'name': 'Вариант 3: postgres старый пароль',
        'host': '31.128.36.81',
        'port': 5423,
        'database': 'postgres',
        'user': 'postgres',
        'password': 'U3S%fZ(D2cru'
    },
]

DB_CONFIG = None  # Будет выбран рабочий вариант

def analyze_database():
    """Анализ структуры и содержимого старой БД"""

    conn = None
    db_config = None

    # Пробуем подключиться к каждому варианту
    for config in DB_CONFIGS:
        try:
            print(f"🔌 Пробую: {config['name']}...")
            test_conn = psycopg2.connect(
                host=config['host'],
                port=config['port'],
                database=config['database'],
                user=config['user'],
                password=config['password']
            )
            print(f"✅ Успешно подключено к {config['database']}!")
            conn = test_conn
            db_config = config
            break
        except Exception as e:
            print(f"❌ Не удалось: {e}")
            continue

    if not conn:
        print("\n❌ Не удалось подключиться ни к одной БД!")
        print("\nПопробуйте:")
        print("1. Проверить доступность сервера: telnet 31.128.36.81 5423")
        print("2. Проверить пароль в PROJECT_COMPLETE_95_PERCENT.md")
        print("3. Попробовать подключение через SSH туннель")
        return

    try:
        cur = conn.cursor()
        print(f"\n✅ Работаем с БД: {db_config['database']}\n")

        # 1. Найти таблицы с данными пользователей
        print("=" * 80)
        print("📊 ПОИСК ТАБЛИЦ С ПОЛЬЗОВАТЕЛЯМИ")
        print("=" * 80)

        cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND (
                table_name LIKE '%user%'
                OR table_name LIKE '%club%'
                OR table_name LIKE '%member%'
            )
            ORDER BY table_name
        """)

        user_tables = cur.fetchall()
        print(f"\nНайдено {len(user_tables)} таблиц:")
        for table in user_tables:
            print(f"  - {table[0]}")

        # 2. Анализ каждой таблицы с пользователями
        print("\n" + "=" * 80)
        print("🔍 ДЕТАЛЬНЫЙ АНАЛИЗ ТАБЛИЦ")
        print("=" * 80)

        for table in user_tables:
            table_name = table[0]
            print(f"\n📋 Таблица: {table_name}")
            print("-" * 80)

            # Структура таблицы
            cur.execute(f"""
                SELECT column_name, data_type, character_maximum_length, is_nullable
                FROM information_schema.columns
                WHERE table_name = '{table_name}'
                ORDER BY ordinal_position
            """)

            columns = cur.fetchall()
            print(f"Колонки ({len(columns)}):")
            for col in columns:
                col_name, data_type, max_len, nullable = col
                len_info = f"({max_len})" if max_len else ""
                null_info = "NULL" if nullable == 'YES' else "NOT NULL"
                print(f"  - {col_name}: {data_type}{len_info} {null_info}")

            # Количество записей
            cur.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cur.fetchone()[0]
            print(f"\nКоличество записей: {count:,}")

            # Примеры данных (первые 3 записи)
            if count > 0:
                cur.execute(f"SELECT * FROM {table_name} LIMIT 3")
                samples = cur.fetchall()
                print(f"\nПримеры данных (первые {len(samples)} записи):")
                for i, row in enumerate(samples, 1):
                    print(f"  Запись {i}:")
                    for j, col in enumerate(columns):
                        col_name = col[0]
                        value = row[j]
                        # Обрезаем длинные значения
                        if isinstance(value, str) and len(value) > 50:
                            value = value[:50] + "..."
                        print(f"    {col_name}: {value}")

        # 3. Найти таблицы с транзакциями
        print("\n" + "=" * 80)
        print("💰 ПОИСК ТАБЛИЦ С ТРАНЗАКЦИЯМИ")
        print("=" * 80)

        cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND (
                table_name LIKE '%transaction%'
                OR table_name LIKE '%payment%'
                OR table_name LIKE '%balance%'
                OR table_name LIKE '%xp%'
                OR table_name LIKE '%point%'
            )
            ORDER BY table_name
        """)

        tx_tables = cur.fetchall()
        print(f"\nНайдено {len(tx_tables)} таблиц:")
        for table in tx_tables:
            print(f"  - {table[0]}")

        # 4. Анализ таблиц с транзакциями
        print("\n" + "=" * 80)
        print("🔍 ДЕТАЛЬНЫЙ АНАЛИЗ ТРАНЗАКЦИЙ")
        print("=" * 80)

        for table in tx_tables:
            table_name = table[0]
            print(f"\n📋 Таблица: {table_name}")
            print("-" * 80)

            # Структура
            cur.execute(f"""
                SELECT column_name, data_type, character_maximum_length, is_nullable
                FROM information_schema.columns
                WHERE table_name = '{table_name}'
                ORDER BY ordinal_position
            """)

            columns = cur.fetchall()
            print(f"Колонки ({len(columns)}):")
            for col in columns:
                col_name, data_type, max_len, nullable = col
                len_info = f"({max_len})" if max_len else ""
                null_info = "NULL" if nullable == 'YES' else "NOT NULL"
                print(f"  - {col_name}: {data_type}{len_info} {null_info}")

            # Количество
            cur.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cur.fetchone()[0]
            print(f"\nКоличество записей: {count:,}")

            # Примеры
            if count > 0:
                cur.execute(f"SELECT * FROM {table_name} LIMIT 3")
                samples = cur.fetchall()
                print(f"\nПримеры данных (первые {len(samples)} записи):")
                for i, row in enumerate(samples, 1):
                    print(f"  Запись {i}:")
                    for j, col in enumerate(columns):
                        col_name = col[0]
                        value = row[j]
                        if isinstance(value, str) and len(value) > 50:
                            value = value[:50] + "..."
                        print(f"    {col_name}: {value}")

        # 5. Общая статистика
        print("\n" + "=" * 80)
        print("📈 ОБЩАЯ СТАТИСТИКА")
        print("=" * 80)

        print(f"\nВсего таблиц с пользователями: {len(user_tables)}")
        print(f"Всего таблиц с транзакциями: {len(tx_tables)}")

        # Итоговая информация для миграции
        print("\n" + "=" * 80)
        print("✅ РЕКОМЕНДАЦИИ ДЛЯ МИГРАЦИИ")
        print("=" * 80)

        print("""
На основе анализа БД нужно:

1. Определить основную таблицу пользователей
   - Проверить наличие telegram_id, username, first_name, last_name
   - Посмотреть метаданные (metka для распределения по командам)

2. Определить таблицу транзакций
   - Должна содержать user_id, amount, type, reason, created_at
   - Подсчитать текущие балансы пользователей

3. Создать скрипты миграции:
   - migrate_users.py - перенос пользователей
   - migrate_transactions.py - перенос транзакций
   - update_balances.py - пересчет балансов EP

4. После миграции:
   - Запустить /api/teams/distribute для создания команд
   - Проверить целостность данных
        """)

        cur.close()
        conn.close()

        print("\n✅ Анализ завершен!")

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🚀 Запуск анализа базы данных private_club\n")
    analyze_database()
