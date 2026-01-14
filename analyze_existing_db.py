#!/usr/bin/env python3
"""
Скрипт для анализа существующей базы данных клуба КОД ДЕНЕГ
"""
import psycopg2
from psycopg2.extras import RealDictCursor
import json

# Параметры подключения
DB_CONFIG = {
    'host': '31.128.36.81',
    'port': 5432,
    'database': 'postgres',
    'user': 'postgres',
    'password': 'U3S%fZ(D2cru',
    'connect_timeout': 10,
    'sslmode': 'prefer'
}

def get_connection():
    """Подключение к БД"""
    return psycopg2.connect(**DB_CONFIG)

def get_tables():
    """Получить список таблиц"""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            return [row[0] for row in cur.fetchall()]

def get_table_structure(table_name):
    """Получить структуру таблицы"""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    column_name,
                    data_type,
                    character_maximum_length,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position;
            """, (table_name,))
            return cur.fetchall()

def get_table_sample(table_name, limit=3):
    """Получить примеры данных из таблицы"""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"""
                SELECT * FROM public.{table_name}
                ORDER BY
                    CASE
                        WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                    WHERE table_name = %s AND column_name = 'id')
                        THEN id
                        ELSE NULL
                    END DESC
                LIMIT %s;
            """, (table_name, limit))
            return cur.fetchall()

def get_table_count(table_name):
    """Получить количество записей"""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM public.{table_name};")
            return cur.fetchone()[0]

def analyze_database():
    """Полный анализ базы данных"""
    print("=" * 80)
    print("АНАЛИЗ СУЩЕСТВУЮЩЕЙ БАЗЫ ДАННЫХ КЛУБА 'КОД ДЕНЕГ'")
    print("=" * 80)
    print()

    # Получаем список таблиц
    tables = get_tables()
    print(f"📊 Найдено таблиц: {len(tables)}")
    print()

    # Приоритетные таблицы из ТЗ
    priority_tables = [
        'private_club_free_dostup',
        'private_club_transactions',
        'private_club_update_podpiska',
        'private_club_users',
        'prodamus_payments',
        'products',
        'club_email_webapp',
        'statistics_club_IK'
    ]

    # Анализируем приоритетные таблицы
    print("🔥 ПРИОРИТЕТНЫЕ ТАБЛИЦЫ:")
    print("-" * 80)

    for table in priority_tables:
        if table in tables:
            print(f"\n📋 Таблица: {table}")
            print("-" * 40)

            # Количество записей
            count = get_table_count(table)
            print(f"   Записей: {count:,}")

            # Структура
            print(f"   Структура:")
            structure = get_table_structure(table)
            for col in structure:
                col_name, data_type, max_length, nullable, default = col
                length_str = f"({max_length})" if max_length else ""
                nullable_str = "NULL" if nullable == "YES" else "NOT NULL"
                default_str = f" DEFAULT {default}" if default else ""
                print(f"      - {col_name}: {data_type}{length_str} {nullable_str}{default_str}")

            # Примеры данных
            if count > 0:
                print(f"   Примеры данных:")
                samples = get_table_sample(table, limit=2)
                for i, sample in enumerate(samples, 1):
                    print(f"      Запись #{i}:")
                    for key, value in sample.items():
                        # Сокращаем длинные значения
                        val_str = str(value)
                        if len(val_str) > 100:
                            val_str = val_str[:100] + "..."
                        print(f"         {key}: {val_str}")

    # Остальные таблицы
    print("\n" + "=" * 80)
    print("📚 ОСТАЛЬНЫЕ ТАБЛИЦЫ:")
    print("-" * 80)

    other_tables = [t for t in tables if t not in priority_tables]
    for table in sorted(other_tables):
        count = get_table_count(table)
        print(f"   - {table}: {count:,} записей")

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
