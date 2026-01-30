#!/usr/bin/env python3
"""
Скрипт для синхронизации городов пользователей по участию в чатах.
Версия 6: Продолжает с того места, где остановился (пропускает уже обработанных).

В users записывается:
- city = название города из city_chats_ik.city
- city_chat_id = ID записи из city_chats_ik.id (не platform_id!)

Запуск: python3 sync_city_chats_v6.py
"""

import asyncio
import psycopg2
from telegram import Bot
from telegram.error import TelegramError, BadRequest
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
BATCH_SIZE = 50
DELAY_BETWEEN_CHECKS = 0.05  # 50ms между проверками чатов


async def check_user_in_chat(bot: Bot, chat_id: int, user_id: int) -> bool:
    """Проверить, является ли пользователь участником чата"""
    try:
        member = await bot.get_chat_member(chat_id, user_id)
        return member.status in ['creator', 'administrator', 'member', 'restricted']
    except:
        return False


async def main():
    start_time = datetime.now()
    print("=" * 60)
    print("🔄 Синхронизация городов v6 (продолжение)")
    print(f"⏰ Начало: {start_time.strftime('%H:%M:%S')}")
    print("=" * 60, flush=True)

    conn = psycopg2.connect(**DB_CONFIG, connect_timeout=30)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # Загружаем чаты: id, platform_id (для Telegram API), city
        cur.execute("SELECT id, platform_id, city FROM city_chats_ik ORDER BY city")
        chats = cur.fetchall()
        # chat_list: [(telegram_chat_id, db_record_id, city_name), ...]
        chat_list = [(int(row[1]), row[0], row[2]) for row in chats]
        print(f"📋 Чатов: {len(chat_list)}", flush=True)

        # Загружаем ТОЛЬКО пользователей БЕЗ city_chat_id (ещё не обработанных)
        cur.execute("""
            SELECT telegram_id, city, first_name, id
            FROM users
            WHERE subscription_expires > NOW()
              AND city_chat_id IS NULL
            ORDER BY telegram_id
        """)
        users = cur.fetchall()

        # Также посчитаем сколько уже обработано
        cur.execute("""
            SELECT COUNT(*) FROM users
            WHERE subscription_expires > NOW() AND city_chat_id IS NOT NULL
        """)
        already_done = cur.fetchone()[0]

        print(f"✅ Уже обработано: {already_done}", flush=True)
        print(f"👥 Осталось обработать: {len(users)}", flush=True)
        print("-" * 60, flush=True)

        bot = Bot(token=BOT_TOKEN)

        total_updated = 0
        total_found = 0

        for i, (tg_id, current_city, first_name, user_id) in enumerate(users):
            # Прогресс
            if i % BATCH_SIZE == 0:
                elapsed = (datetime.now() - start_time).total_seconds() / 60
                print(f"📊 {i}/{len(users)} | обновлено: {total_updated} | в чатах: {total_found} | {elapsed:.1f} мин", flush=True)
                # Коммит
                conn.commit()

            # Ищем пользователя в чатах
            found_chat = None
            for telegram_chat_id, db_record_id, city_name in chat_list:
                try:
                    is_member = await check_user_in_chat(bot, telegram_chat_id, tg_id)
                    if is_member:
                        found_chat = (db_record_id, city_name)  # Записываем ID записи, не telegram_chat_id!
                        break
                    await asyncio.sleep(DELAY_BETWEEN_CHECKS)
                except:
                    pass

            # Обновляем если нашли
            if found_chat:
                total_found += 1
                db_record_id, city_name = found_chat
                cur.execute("""
                    UPDATE users SET city = %s, city_chat_id = %s WHERE id = %s
                """, (city_name, db_record_id, user_id))
                print(f"  ✓ {first_name}: '{current_city}' -> '{city_name}' (chat_id={db_record_id})", flush=True)
                total_updated += 1

        # Финальный коммит
        conn.commit()

        elapsed = (datetime.now() - start_time).total_seconds() / 60
        print(f"\n{'=' * 60}")
        print(f"✅ Готово за {elapsed:.1f} мин!")
        print(f"📊 Проверено: {len(users)}")
        print(f"🏙  В чатах: {total_found}")
        print(f"✏️  Обновлено: {total_updated}")
        print(f"📈 Всего с городами: {already_done + total_updated}")

    except Exception as e:
        print(f"❌ Ошибка: {e}", flush=True)
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
        print("🔌 Соединение закрыто", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
