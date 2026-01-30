#!/usr/bin/env python3
"""
Скрипт для синхронизации городов пользователей по участию в чатах.
Проходит по всем пользователям из базы, проверяет их членство в городских чатах
через getChatMember и обновляет city + city_chat_id.

Запуск: python3 sync_city_chats_v2.py
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

async def check_user_in_chat(bot: Bot, chat_id: int, user_id: int) -> bool:
    """Проверить, является ли пользователь участником чата"""
    try:
        member = await bot.get_chat_member(chat_id, user_id)
        # Статусы: 'creator', 'administrator', 'member', 'restricted', 'left', 'kicked'
        return member.status in ['creator', 'administrator', 'member', 'restricted']
    except BadRequest as e:
        # User not found in chat
        return False
    except TelegramError as e:
        # Другие ошибки (чат недоступен и т.д.)
        return False

async def main():
    # Подключение к базе
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Получаем все чаты
    cur.execute("SELECT platform_id, city FROM city_chats_ik ORDER BY city")
    chats = cur.fetchall()
    chat_list = [(int(chat_id), city) for chat_id, city in chats]
    print(f"Загружено {len(chat_list)} чатов", flush=True)

    # Получаем всех пользователей с активной подпиской
    cur.execute("""
        SELECT telegram_id, city, first_name, id
        FROM users
        WHERE subscription_expires > NOW()
        ORDER BY telegram_id
    """)
    users = cur.fetchall()
    print(f"Загружено {len(users)} активных пользователей\n", flush=True)

    # Инициализируем бота
    bot = Bot(token=BOT_TOKEN)

    # Статистика
    total_updated = 0
    total_checked = 0
    errors = 0

    for i, (tg_id, current_city, first_name, user_id) in enumerate(users):
        total_checked += 1

        if i % 50 == 0:
            print(f"Прогресс: {i}/{len(users)} ({total_updated} обновлено)", flush=True)

        # Проверяем пользователя во всех чатах
        found_in_chat = None

        for chat_id, city in chat_list:
            try:
                is_member = await check_user_in_chat(bot, chat_id, tg_id)
                if is_member:
                    found_in_chat = (chat_id, city)
                    break  # Нашли первый чат, останавливаемся

                # Пауза между запросами чтобы не превысить лимиты
                await asyncio.sleep(0.05)  # 20 запросов в секунду max

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

        # Пауза между пользователями
        await asyncio.sleep(0.1)

    # Сохраняем изменения
    conn.commit()

    print(f"\n{'='*50}")
    print(f"✅ Готово!")
    print(f"Проверено пользователей: {total_checked}")
    print(f"Обновлено записей: {total_updated}")
    print(f"Ошибок: {errors}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    asyncio.run(main())
