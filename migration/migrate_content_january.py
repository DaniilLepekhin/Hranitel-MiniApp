#!/usr/bin/env python3
"""
Миграционный скрипт для загрузки контента января из CSV в PostgreSQL

Использование:
    python3 migrate_content_january.py

Требования:
    pip install psycopg2-binary
"""

import csv
import sys
from datetime import datetime
from typing import List, Dict, Tuple
import uuid

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("❌ Ошибка: необходимо установить psycopg2")
    print("Запустите: pip install psycopg2-binary")
    sys.exit(1)

# Настройки подключения к БД
DB_CONFIG = {
    'host': 'localhost',  # Подключаемся локально с сервера
    'database': 'club_hranitel',
    'user': 'postgres',
    'password': 'kH*kyrS&9z7K',
    'port': 5423
}

# Маппинг разделов на типы контента
SECTION_TO_TYPE = {
    'Эфир': 'stream_record',
    'Медитация': 'practice',  # Медитации это тоже практики
    'Практика': 'practice',
    'Подкаст': 'podcast'
}


def parse_csv(filepath: str) -> List[Dict[str, str]]:
    """Парсит CSV файл с контентом"""
    rows = []

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # Пропускаем заголовок

        for row in reader:
            if len(row) >= 7 and row[0].strip():  # Проверяем что строка не пустая
                rows.append({
                    'section': row[0].strip(),
                    'format': row[1].strip(),
                    'title': row[2].strip(),
                    'source_link': row[3].strip(),
                    'description': row[4].strip(),
                    'additional_info': row[5].strip(),
                    'storage_url': row[6].strip() if len(row) > 6 else ''
                })

    return rows


def estimate_duration(url: str, format_type: str) -> int:
    """Примерная оценка длительности контента в секундах"""
    if format_type == 'Видео':
        return 1800  # 30 минут для видео
    else:
        return 600   # 10 минут для аудио


def migrate(csv_path: str):
    """Основная функция миграции"""
    print("🚀 Начало миграции контента за январь...\n")

    # 1. Подключаемся к БД
    print(f"🔌 Подключаемся к базе данных: {DB_CONFIG['database']}@{DB_CONFIG['host']}")

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        cur = conn.cursor()
        print("✅ Подключение установлено\n")
    except Exception as e:
        print(f"❌ Ошибка подключения к БД: {e}")
        sys.exit(1)

    try:
        # 2. Читаем CSV
        print(f"📄 Читаем CSV: {csv_path}")
        rows = parse_csv(csv_path)
        print(f"✅ Прочитано {len(rows)} записей из CSV\n")

        # 3. Удаляем существующий контент
        print("🗑️  Удаляем существующий контент типов: stream_record, podcast, practice...")

        cur.execute("""
            DELETE FROM content_items
            WHERE type IN ('stream_record', 'podcast', 'practice')
            RETURNING id
        """)

        deleted_count = cur.rowcount
        print(f"✅ Удалено {deleted_count} элементов контента\n")

        # 4. Загружаем новый контент
        print("📦 Загружаем новый контент...\n")

        created_count = 0
        video_count = 0
        practice_text_count = 0
        stats = {}

        for idx, row in enumerate(rows):
            section = row['section']
            content_type = SECTION_TO_TYPE.get(section)

            if not content_type:
                print(f"⚠️  Пропускаем неизвестный раздел: {section}")
                continue

            # Генерируем UUID для content item
            content_item_id = str(uuid.uuid4())
            now = datetime.now()

            # Создаем content item
            cur.execute("""
                INSERT INTO content_items
                (id, type, title, description, order_index, is_published, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                content_item_id,
                content_type,
                row['title'],
                row['description'],
                idx,
                True,
                now,
                now
            ))

            print(f"✅ Создан: [{section}] {row['title']}")
            created_count += 1

            # Статистика по типам
            stats[section] = stats.get(section, 0) + 1

            # Создаем video/audio запись если есть ссылка
            if row['storage_url']:
                is_video = row['format'] == 'Видео' or '.mp4' in row['storage_url']
                is_audio = row['format'] == 'Аудио' or any(ext in row['storage_url'] for ext in ['.mp3', '.ogg'])

                if is_video or is_audio:
                    video_id = str(uuid.uuid4())
                    duration = estimate_duration(row['storage_url'], row['format'])

                    cur.execute("""
                        INSERT INTO videos
                        (id, content_item_id, title, description, video_url, duration_seconds, order_index, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        video_id,
                        content_item_id,
                        row['title'],
                        row['additional_info'] or row['description'],
                        row['storage_url'],
                        duration,
                        0,
                        now
                    ))

                    video_count += 1
                    media_type = 'видео' if is_video else 'аудио'
                    print(f"  📹 Добавлено {media_type}: {row['storage_url'][:80]}...")

            # Для практик добавляем текстовый контент
            if content_type == 'practice' and row['description']:
                practice_content_id = str(uuid.uuid4())
                content_text = row['description']

                if row['additional_info']:
                    content_text += f"\n\n---\n\n{row['additional_info']}"

                cur.execute("""
                    INSERT INTO practice_content
                    (id, content_item_id, content_type, content, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    practice_content_id,
                    content_item_id,
                    'markdown',
                    content_text,
                    now
                ))

                practice_text_count += 1
                print(f"  📝 Добавлен текстовый контент практики")

            print()

        # 5. Коммитим изменения
        conn.commit()

        # 6. Выводим статистику
        print("\n✨ Миграция завершена успешно!")
        print(f"\n📊 Статистика:")
        print(f"   • Создано элементов контента: {created_count}")
        print(f"   • Создано видео/аудио записей: {video_count}")
        print(f"   • Создано текстовых практик: {practice_text_count}")
        print(f"\n   По типам:")

        for section, count in stats.items():
            print(f"   • {section}: {count}")

        print("\n✅ Все изменения сохранены в базу данных")

    except Exception as e:
        print(f"\n❌ Ошибка миграции: {e}")
        print("Откатываем изменения...")
        conn.rollback()
        sys.exit(1)

    finally:
        cur.close()
        conn.close()
        print("\n🔌 Соединение с БД закрыто")


if __name__ == '__main__':
    import os

    # Путь к CSV файлу
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, 'Копия Контент клуб - Январь.csv')

    if not os.path.exists(csv_path):
        print(f"❌ Файл не найден: {csv_path}")
        sys.exit(1)

    print("=" * 60)
    print("  МИГРАЦИЯ КОНТЕНТА ЗА ЯНВАРЬ")
    print("=" * 60)
    print(f"\nБаза данных: {DB_CONFIG['database']}")
    print(f"Сервер: {DB_CONFIG['host']}")
    print(f"CSV файл: {csv_path}")
    print("\n⚠️  ВНИМАНИЕ: Этот скрипт удалит весь существующий контент")
    print("   типов: Эфир, Медитация, Практика, Подкаст\n")

    response = input("Продолжить? (yes/no): ")

    if response.lower() not in ['yes', 'y', 'да', 'д']:
        print("\n❌ Миграция отменена")
        sys.exit(0)

    print()
    migrate(csv_path)
