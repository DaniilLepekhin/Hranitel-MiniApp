#!/usr/bin/env python3
"""
Скрипт для синхронизации городов пользователей по участию в чатах.
Проходит по всем чатам из city_chats_ik, получает участников через Telegram API,
и обновляет city + city_chat_id в таблице users.
"""

import asyncio
import psycopg2
from telegram import Bot
from telegram.error import TelegramError
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

async def get_chat_members(bot: Bot, chat_id: int):
    """Получить всех участников чата через getChatAdministrators (для обычных участников нужен Premium)"""
    members = []
    try:
        # Для обычных групп можно попробовать getChatMembersCount
        count = await bot.get_chat_member_count(chat_id)
        print(f"  Чат {chat_id}: {count} участников")

        # Получаем админов (это всегда работает)
        admins = await bot.get_chat_administrators(chat_id)
        for admin in admins:
            if admin.user.id and not admin.user.is_bot:
                members.append(admin.user.id)
        print(f"  Получено админов: {len(members)}")

    except TelegramError as e:
        print(f"  Ошибка для чата {chat_id}: {e}")

    return members

async def main():
    # Подключение к базе
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Получаем все чаты
    cur.execute("SELECT platform_id, city FROM city_chats_ik ORDER BY city")
    chats = cur.fetchall()
    print(f"Найдено {len(chats)} чатов")

    # Инициализируем бота
    bot = Bot(token=BOT_TOKEN)

    # Статистика
    total_updated = 0
    total_users_found = 0

    for chat_id_str, city in chats:
        chat_id = int(chat_id_str)
        print(f"\n📍 Обработка: {city} ({chat_id})")

        try:
            # Получаем участников чата
            member_ids = await get_chat_members(bot, chat_id)

            if not member_ids:
                print(f"  Нет участников или ошибка")
                continue

            # Проверяем, есть ли эти пользователи в базе
            placeholders = ','.join(['%s'] * len(member_ids))
            cur.execute(f"""
                SELECT telegram_id, city, first_name
                FROM users
                WHERE telegram_id IN ({placeholders})
            """, member_ids)

            db_users = cur.fetchall()
            print(f"  Найдено в базе: {len(db_users)} пользователей")

            # Обновляем city для тех, у кого он не установлен или отличается
            for tg_id, current_city, first_name in db_users:
                total_users_found += 1
                if current_city != city:
                    cur.execute("""
                        UPDATE users
                        SET city = %s, city_chat_id = %s
                        WHERE telegram_id = %s
                    """, (city, str(chat_id), tg_id))
                    print(f"    ✓ {first_name} ({tg_id}): {current_city} -> {city}")
                    total_updated += 1

            # Небольшая пауза чтобы не превысить лимиты API
            await asyncio.sleep(0.5)

        except Exception as e:
            print(f"  Ошибка: {e}")
            continue

    # Сохраняем изменения
    conn.commit()

    print(f"\n{'='*50}")
    print(f"✅ Готово!")
    print(f"Всего найдено пользователей: {total_users_found}")
    print(f"Обновлено записей: {total_updated}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    asyncio.run(main())
