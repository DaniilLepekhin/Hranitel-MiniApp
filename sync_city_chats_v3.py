#!/usr/bin/env python3
"""
Скрипт для синхронизации городов пользователей по участию в чатах.
Версия 3: с батчевыми коммитами и увеличенными паузами для стабильности.

Запуск: python3 sync_city_chats_v3.py
"""

import asyncio
import psycopg2
from telegram import Bot
from telegram.error import TelegramError, BadRequest
import time

# Конфигурация
BOT_TOKEN = "8233570593:AAFUrEuTDQbUvwollurpJhxynMHu54i4_sk"
DB_CONFIG = {
    "host": "31.128.36.81",
    "port": 5423,
    "database": "club_hranitel",
    "user": "postgres",
    "password": "kH*kyrS&9z7K"
}

# Настройки для стабильной работы
BATCH_SIZE = 50  # Коммитим каждые N пользователей
DELAY_BETWEEN_CHATS = 0.1  # Пауза между проверками чатов (сек)
DELAY_BETWEEN_USERS = 0.2  # Пауза между пользователями (сек)
DELAY_BETWEEN_BATCHES = 2  # Пауза между батчами (сек)


async def check_user_in_chat(bot: Bot, chat_id: int, user_id: int) -> bool:
    """Проверить, является ли пользователь участником чата"""
    try:
        member = await bot.get_chat_member(chat_id, user_id)
        return member.status in ['creator', 'administrator', 'member', 'restricted']
    except BadRequest:
        return False
    except TelegramError:
        return False
    except Exception:
        return False


async def main():
    print("=" * 60)
    print("🔄 Синхронизация городов пользователей v3")
    print("=" * 60)

    # Подключение к базе
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False  # Явное управление транзакциями
    cur = conn.cursor()

    try:
        # Получаем все чаты
        cur.execute("SELECT platform_id, city FROM city_chats_ik ORDER BY city")
        chats = cur.fetchall()
        chat_list = [(int(chat_id), city) for chat_id, city in chats]
        print(f"📋 Загружено {len(chat_list)} чатов")

        # Получаем всех пользователей с активной подпиской
        cur.execute("""
            SELECT telegram_id, city, first_name, id
            FROM users
            WHERE subscription_expires > NOW()
            ORDER BY telegram_id
        """)
        users = cur.fetchall()
        print(f"👥 Загружено {len(users)} активных пользователей")
        print(f"⏱  Расчётное время: ~{len(users) * len(chat_list) * DELAY_BETWEEN_CHATS / 60:.0f} минут (максимум)")
        print("-" * 60)

        # Инициализируем бота
        bot = Bot(token=BOT_TOKEN)

        # Статистика
        total_updated = 0
        total_checked = 0
        errors = 0
        batch_updated = 0

        for i, (tg_id, current_city, first_name, user_id) in enumerate(users):
            total_checked += 1

            # Прогресс каждые 50 пользователей
            if i % BATCH_SIZE == 0:
                print(f"\n📊 Прогресс: {i}/{len(users)} ({total_updated} обновлено, {errors} ошибок)")

            # Проверяем пользователя во всех чатах
            found_in_chat = None

            for chat_id, city in chat_list:
                try:
                    is_member = await check_user_in_chat(bot, chat_id, tg_id)
                    if is_member:
                        found_in_chat = (chat_id, city)
                        break  # Нашли первый чат, останавливаемся

                    # Пауза между запросами к Telegram API
                    await asyncio.sleep(DELAY_BETWEEN_CHATS)

                except Exception as e:
                    errors += 1
                    continue

            # Обновляем, если нашли чат и город отличается
            if found_in_chat:
                chat_id, city = found_in_chat
                if current_city != city:
                    cur.execute("""
                        UPDATE users
                        SET city = %s, city_chat_id = %s
                        WHERE id = %s
                    """, (city, chat_id, user_id))
                    print(f"  ✓ {first_name} ({tg_id}): '{current_city}' -> '{city}'")
                    total_updated += 1
                    batch_updated += 1

            # Пауза между пользователями
            await asyncio.sleep(DELAY_BETWEEN_USERS)

            # Коммитим каждый батч
            if (i + 1) % BATCH_SIZE == 0:
                conn.commit()
                print(f"  💾 Сохранено {batch_updated} изменений в этом батче")
                batch_updated = 0
                # Дополнительная пауза между батчами
                await asyncio.sleep(DELAY_BETWEEN_BATCHES)

        # Финальный коммит
        conn.commit()

        print(f"\n{'=' * 60}")
        print(f"✅ Готово!")
        print(f"📊 Проверено пользователей: {total_checked}")
        print(f"✏️  Обновлено записей: {total_updated}")
        print(f"❌ Ошибок: {errors}")
        print(f"{'=' * 60}")

    except Exception as e:
        print(f"\n❌ Критическая ошибка: {e}")
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
        print("🔌 Соединение с базой закрыто")


if __name__ == "__main__":
    asyncio.run(main())
