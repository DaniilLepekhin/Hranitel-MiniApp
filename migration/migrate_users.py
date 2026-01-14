#!/usr/bin/env python3
"""
Скрипт миграции пользователей из старой БД в новую
Переносит данные из private_club_users → users (club_hranitel)
"""

import psycopg2
from datetime import datetime
import json

# Параметры подключения
OLD_DB_CONFIG = {
    'host': '31.128.36.81',
    'port': 5423,
    'database': 'postgres',  # старая БД
    'user': 'postgres',
    'password': 'kH*kyrS&9z7K'
}

NEW_DB_CONFIG = {
    'host': '31.128.36.81',
    'port': 5423,
    'database': 'club_hranitel',  # новая БД
    'user': 'postgres',
    'password': 'kH*kyrS&9z7K'
}

def migrate_users():
    """Миграция пользователей"""

    print("🚀 Начало миграции пользователей...\n")

    # Подключения
    old_conn = psycopg2.connect(**OLD_DB_CONFIG)
    new_conn = psycopg2.connect(**NEW_DB_CONFIG)

    old_cur = old_conn.cursor()
    new_cur = new_conn.cursor()

    try:
        # 1. Получить всех пользователей из старой БД
        print("📊 Загрузка пользователей из старой БД...")
        # Используем CAST и CASE для безопасной обработки дат
        old_cur.execute("""
            SELECT
                id,
                CASE
                    WHEN created_at IS NULL OR EXTRACT(YEAR FROM created_at) < 1900
                    THEN '2024-01-01'::timestamp
                    ELSE created_at
                END as created_at,
                client_id,
                platform_id,
                name,
                tg_username,
                phone,
                email,
                COALESCE(coins, 0) as coins,
                COALESCE(coins_2, 0) as coins_2,
                metka,
                chat_id,
                CASE
                    WHEN date_end IS NULL OR EXTRACT(YEAR FROM date_end) < 1900
                    THEN NULL
                    ELSE date_end
                END as date_end
            FROM private_club_users
            ORDER BY id
        """)

        users = old_cur.fetchall()
        print(f"✅ Найдено {len(users):,} пользователей\n")

        # 2. Мигрировать пользователей
        print("🔄 Миграция пользователей в новую БД...")
        migrated = 0
        skipped = 0
        errors = []

        for user in users:
            try:
                (
                    old_id, created_at, client_id, platform_id, name,
                    tg_username, phone, email, coins, coins_2,
                    metka, chat_id, date_end
                ) = user

                # Создать telegram_id (используем platform_id если есть, иначе client_id)
                telegram_id = str(platform_id if platform_id else client_id)

                # Убрать @ из username
                username = tg_username.replace('@', '').strip() if tg_username else None

                # Разделить имя на first_name и last_name
                first_name = None
                last_name = None
                if name:
                    name_parts = name.strip().split(' ', 1)
                    first_name = name_parts[0] if len(name_parts) > 0 else None
                    last_name = name_parts[1] if len(name_parts) > 1 else None

                # Подсчитать начальные EP (coins + coins_2)
                initial_ep = (coins or 0) + (coins_2 or 0)

                # Проверить подписку (isPro)
                is_pro = False
                subscription_expires = None
                if date_end:
                    is_pro = date_end > datetime.now()
                    subscription_expires = date_end

                # Метаданные
                metadata = {
                    'old_id': old_id,
                    'metka': metka or '',
                    'chat_id': chat_id,
                    'migrated_at': datetime.now().isoformat(),
                    'old_coins': coins,
                    'old_coins_2': coins_2
                }

                # Вставить пользователя в новую БД
                new_cur.execute("""
                    INSERT INTO users (
                        telegram_id,
                        username,
                        first_name,
                        last_name,
                        level,
                        experience,
                        streak,
                        energy_points,
                        is_pro,
                        subscription_expires,
                        role,
                        metadata,
                        created_at,
                        updated_at
                    ) VALUES (
                        %s, %s, %s, %s,
                        1, 0, 0, %s,
                        %s, %s,
                        'user',
                        %s, %s, %s
                    )
                    ON CONFLICT (telegram_id) DO UPDATE SET
                        username = EXCLUDED.username,
                        first_name = EXCLUDED.first_name,
                        last_name = EXCLUDED.last_name,
                        energy_points = EXCLUDED.energy_points,
                        is_pro = EXCLUDED.is_pro,
                        subscription_expires = EXCLUDED.subscription_expires,
                        metadata = EXCLUDED.metadata,
                        updated_at = EXCLUDED.updated_at
                """, (
                    telegram_id,
                    username,
                    first_name,
                    last_name,
                    initial_ep,
                    is_pro,
                    subscription_expires,
                    json.dumps(metadata),
                    created_at,
                    datetime.now()
                ))

                migrated += 1

                # Коммит каждые 1000 записей
                if migrated % 1000 == 0:
                    new_conn.commit()
                    print(f"  ✓ Мигрировано {migrated:,} пользователей...")

            except Exception as e:
                skipped += 1
                errors.append(f"User {user[0]}: {str(e)}")
                if skipped <= 10:  # Показать первые 10 ошибок
                    print(f"  ⚠️  Пропущен user {user[0]}: {e}")

        # Финальный коммит
        new_conn.commit()

        # 3. Итоги
        print(f"\n✅ Миграция завершена!")
        print(f"  Мигрировано: {migrated:,} пользователей")
        print(f"  Пропущено: {skipped:,} пользователей")

        if errors:
            print(f"\n⚠️  Ошибки ({len(errors)}):")
            for err in errors[:20]:  # Показать первые 20
                print(f"  - {err}")

        # 4. Проверка
        print(f"\n🔍 Проверка результатов...")
        new_cur.execute("SELECT COUNT(*) FROM users")
        new_count = new_cur.fetchone()[0]
        print(f"  Пользователей в новой БД: {new_count:,}")

        new_cur.execute("SELECT SUM(energy_points) FROM users")
        total_ep = new_cur.fetchone()[0] or 0
        print(f"  Общий баланс EP: {total_ep:,}")

    except Exception as e:
        print(f"\n❌ Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
        new_conn.rollback()
    finally:
        old_cur.close()
        new_cur.close()
        old_conn.close()
        new_conn.close()

if __name__ == "__main__":
    import sys

    print("=" * 80)
    print("МИГРАЦИЯ ПОЛЬЗОВАТЕЛЕЙ: private_club_users → users")
    print("=" * 80)
    print()

    # Проверить флаг --auto для автоматического запуска
    if '--auto' in sys.argv:
        migrate_users()
    else:
        response = input("Начать миграцию 54K+ пользователей? (yes/no): ")
        if response.lower() in ['yes', 'y', 'да']:
            migrate_users()
        else:
            print("❌ Миграция отменена")
