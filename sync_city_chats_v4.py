#!/usr/bin/env python3
"""
Скрипт для синхронизации городов пользователей по участию в чатах.
Версия 4: Оптимизированная - параллельная проверка чатов для каждого пользователя.

Запуск: python3 sync_city_chats_v4.py
"""

import asyncio
import psycopg2
from telegram import Bot
from telegram.error import TelegramError, BadRequest
import time
from datetime import datetime

# Конфигурация
BOT_TOKEN = "8233570593:AAFUrEuTDQbUvwollurpJhxynMHu54i4_sk"
DB_CONFIG = {
    "host": "31.128.36.81",
    "port": 5423,
    "database": "club_hranitel",
    "user": "postgres",
    "password": "kH*kyrS&9z7K"
}

# Настройки
BATCH_SIZE = 100  # Коммитим каждые N пользователей
CONCURRENT_CHECKS = 5  # Параллельных проверок чатов одновременно
DELAY_BETWEEN_USERS = 0.3  # Пауза между пользователями (сек)
DELAY_BETWEEN_BATCHES = 3  # Пауза между батчами (сек)


async def check_user_in_chat(bot: Bot, chat_id: int, user_id: int, semaphore: asyncio.Semaphore):
    """Проверить, является ли пользователь участником чата"""
    async with semaphore:
        try:
            member = await bot.get_chat_member(chat_id, user_id)
            return member.status in ['creator', 'administrator', 'member', 'restricted']
        except (BadRequest, TelegramError):
            return False
        except Exception:
            return False


async def find_user_city(bot: Bot, user_id: int, chat_list: list, semaphore: asyncio.Semaphore):
    """Найти город пользователя по членству в чатах (параллельная проверка)"""
    # Создаём задачи для всех чатов
    tasks = []
    for chat_id, city in chat_list:
        task = asyncio.create_task(check_user_in_chat(bot, chat_id, user_id, semaphore))
        tasks.append((task, chat_id, city))

    # Ждём результаты и возвращаем первый найденный чат
    for task, chat_id, city in tasks:
        try:
            is_member = await task
            if is_member:
                # Отменяем остальные задачи
                for other_task, _, _ in tasks:
                    if other_task != task and not other_task.done():
                        other_task.cancel()
                return (chat_id, city)
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    return None


async def main():
    start_time = datetime.now()
    print("=" * 60)
    print("🔄 Синхронизация городов пользователей v4 (оптимизированная)")
    print(f"⏰ Начало: {start_time.strftime('%H:%M:%S')}")
    print("=" * 60)

    # Подключение к базе
    conn = psycopg2.connect(**DB_CONFIG, connect_timeout=30)
    conn.autocommit = False
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

        # Расчётное время с параллельной обработкой
        estimated_minutes = (len(users) * DELAY_BETWEEN_USERS) / 60
        print(f"⏱  Расчётное время: ~{estimated_minutes:.0f} минут")
        print("-" * 60, flush=True)

        # Инициализируем бота
        bot = Bot(token=BOT_TOKEN)

        # Семафор для ограничения параллельных запросов
        semaphore = asyncio.Semaphore(CONCURRENT_CHECKS)

        # Статистика
        total_updated = 0
        total_checked = 0
        total_found_in_chats = 0
        errors = 0
        batch_updated = 0

        for i, (tg_id, current_city, first_name, user_id) in enumerate(users):
            total_checked += 1

            # Прогресс
            if i % BATCH_SIZE == 0:
                elapsed = (datetime.now() - start_time).total_seconds() / 60
                print(f"\n📊 Прогресс: {i}/{len(users)} ({total_updated} обновлено, {total_found_in_chats} в чатах) [{elapsed:.1f} мин]", flush=True)

            try:
                # Ищем город пользователя параллельно
                found = await find_user_city(bot, tg_id, chat_list, semaphore)

                if found:
                    total_found_in_chats += 1
                    chat_id, city = found
                    if current_city != city:
                        cur.execute("""
                            UPDATE users
                            SET city = %s, city_chat_id = %s
                            WHERE id = %s
                        """, (city, chat_id, user_id))
                        print(f"  ✓ {first_name} ({tg_id}): '{current_city}' -> '{city}'", flush=True)
                        total_updated += 1
                        batch_updated += 1

            except Exception as e:
                errors += 1

            # Пауза между пользователями
            await asyncio.sleep(DELAY_BETWEEN_USERS)

            # Коммитим каждый батч
            if (i + 1) % BATCH_SIZE == 0:
                conn.commit()
                if batch_updated > 0:
                    print(f"  💾 Сохранено {batch_updated} изменений", flush=True)
                batch_updated = 0
                await asyncio.sleep(DELAY_BETWEEN_BATCHES)

        # Финальный коммит
        conn.commit()

        elapsed = (datetime.now() - start_time).total_seconds() / 60
        print(f"\n{'=' * 60}")
        print(f"✅ Готово за {elapsed:.1f} минут!")
        print(f"📊 Проверено пользователей: {total_checked}")
        print(f"🏙  Найдено в чатах: {total_found_in_chats}")
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
