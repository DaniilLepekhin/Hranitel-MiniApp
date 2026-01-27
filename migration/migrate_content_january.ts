import { db } from '../backend/src/db';
import { contentItems, videos, practiceContent } from '../backend/src/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Миграционный скрипт для загрузки контента января из CSV
 *
 * Структура CSV:
 * - Раздел: Эфир | Медитация | Практика | Подкаст
 * - Формат: Видео | Аудио
 * - Название: название контента
 * - Ссылка: исходная ссылка (не используется)
 * - Описание: полное описание
 * - Комментарий/дополнение: доп материалы
 * - [последняя колонка]: финальная ссылка на store.daniillepekhin.com
 */

interface CSVRow {
  section: string;      // Раздел
  format: string;       // Формат
  title: string;        // Название
  sourceLink: string;   // Ссылка (яндекс диск)
  description: string;  // Описание
  additionalInfo: string; // Комментарий/дополнение
  storageUrl: string;   // Финальная ссылка
}

// Маппинг разделов на типы контента
const SECTION_TO_TYPE: Record<string, 'stream_record' | 'podcast' | 'practice'> = {
  'Эфир': 'stream_record',
  'Медитация': 'practice', // Медитации это тоже практики
  'Практика': 'practice',
  'Подкаст': 'podcast'
};

// Парсинг CSV
function parseCSV(filePath: string): CSVRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  // Пропускаем заголовок
  const dataLines = lines.slice(1);

  const rows: CSVRow[] = [];

  for (const line of dataLines) {
    // Парсим CSV с учетом кавычек и запятых внутри полей
    const values: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // Добавляем последнее поле

    if (values.length >= 7) {
      rows.push({
        section: values[0],
        format: values[1],
        title: values[2],
        sourceLink: values[3],
        description: values[4],
        additionalInfo: values[5],
        storageUrl: values[6]
      });
    }
  }

  return rows;
}

// Определение длительности по формату файла
function estimateDuration(url: string, format: string): number {
  // Примерная оценка длительности
  if (format === 'Видео') {
    return 1800; // 30 минут для видео
  } else {
    // Для аудио пытаемся угадать по размеру или названию
    return 600; // 10 минут для аудио
  }
}

async function migrate() {
  console.log('🚀 Начало миграции контента за январь...\n');

  // 1. Читаем CSV
  const csvPath = path.join(__dirname, 'Копия Контент клуб - Январь.csv');
  console.log(`📄 Читаем CSV: ${csvPath}`);

  const rows = parseCSV(csvPath);
  console.log(`✅ Прочитано ${rows.length} записей из CSV\n`);

  // 2. Удаляем существующий контент типов: stream_record, podcast, practice
  console.log('🗑️  Удаляем существующий контент...');

  const typesToDelete: ('stream_record' | 'podcast' | 'practice')[] = ['stream_record', 'podcast', 'practice'];

  const deletedItems = await db
    .delete(contentItems)
    .where(inArray(contentItems.type, typesToDelete))
    .returning();

  console.log(`✅ Удалено ${deletedItems.length} элементов контента\n`);

  // 3. Загружаем новый контент
  console.log('📦 Загружаем новый контент...\n');

  let createdCount = 0;
  let videoCount = 0;
  let practiceTextCount = 0;

  for (const row of rows) {
    const contentType = SECTION_TO_TYPE[row.section];

    if (!contentType) {
      console.log(`⚠️  Пропускаем неизвестный раздел: ${row.section}`);
      continue;
    }

    // Создаем content item
    const [newItem] = await db
      .insert(contentItems)
      .values({
        type: contentType,
        title: row.title,
        description: row.description,
        orderIndex: createdCount,
        isPublished: true
      })
      .returning();

    console.log(`✅ Создан: [${row.section}] ${row.title}`);
    createdCount++;

    // Для медитаций и практик с аудио/видео создаем video запись для воспроизведения
    if (row.storageUrl) {
      const isVideoFormat = row.format === 'Видео' || row.storageUrl.includes('.mp4');
      const isAudioFormat = row.format === 'Аудио' || row.storageUrl.match(/\.(mp3|ogg)$/);

      if (isVideoFormat || isAudioFormat) {
        // Создаем video/audio запись привязанную напрямую к content item
        await db.insert(videos).values({
          contentItemId: newItem.id,
          title: row.title,
          description: row.additionalInfo || row.description,
          videoUrl: row.storageUrl,
          durationSeconds: estimateDuration(row.storageUrl, row.format),
          orderIndex: 0
        });

        videoCount++;
        console.log(`  📹 Добавлено ${isVideoFormat ? 'видео' : 'аудио'}: ${row.storageUrl.substring(0, 80)}...`);
      }
    }

    // Для практик можем добавить текстовый контент из описания
    if (contentType === 'practice' && row.description) {
      await db.insert(practiceContent).values({
        contentItemId: newItem.id,
        contentType: 'markdown',
        content: row.description + (row.additionalInfo ? `\n\n---\n\n${row.additionalInfo}` : '')
      });

      practiceTextCount++;
      console.log(`  📝 Добавлен текстовый контент практики`);
    }

    console.log('');
  }

  console.log('\n✨ Миграция завершена!');
  console.log(`\n📊 Статистика:`);
  console.log(`   • Создано элементов контента: ${createdCount}`);
  console.log(`   • Создано видео/аудио записей: ${videoCount}`);
  console.log(`   • Создано текстовых практик: ${practiceTextCount}`);
  console.log(`\n   По типам:`);

  const stats = rows.reduce((acc, row) => {
    const section = row.section;
    acc[section] = (acc[section] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(stats).forEach(([section, count]) => {
    console.log(`   • ${section}: ${count}`);
  });
}

// Запуск миграции
migrate()
  .then(() => {
    console.log('\n✅ Скрипт завершен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка миграции:', error);
    process.exit(1);
  });
