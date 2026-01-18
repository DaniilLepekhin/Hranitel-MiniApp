# 📺 → 🎥 Migration: Live Streams → Stream Recordings

**Дата:** 2026-01-18
**Migration:** 0007_rename_streams_to_recordings.sql
**Статус:** ✅ Completed

---

## Причина изменений

Таблица `live_streams` изначально создавалась для проведения live трансляций, но фактически используется для хранения **записей прошедших эфиров**. Переименование делает структуру БД более семантически корректной.

---

## Что изменилось

### 1. Database Changes

#### Переименование таблицы
```sql
live_streams → stream_recordings
```

#### Переименование полей
```sql
scheduled_at  → recorded_at     -- Дата проведения эфира
stream_url    → video_url       -- Ссылка на запись
ep_reward     → energies_reward -- Consistency с другими таблицами
```

#### Новые поля
```sql
duration       INTEGER         -- Длительность видео в секундах
thumbnail_url  TEXT            -- Превью изображение
views_count    INTEGER         -- Количество просмотров
category       TEXT            -- general, meditation, practice, qa, workshop
sort_order     INTEGER         -- Порядок сортировки
is_published   BOOLEAN         -- Опубликована ли запись
```

#### Индексы
```sql
-- Старые (переименованы)
live_streams_pkey              → stream_recordings_pkey
live_streams_scheduled_at_idx  → stream_recordings_recorded_at_idx
live_streams_status_idx        → stream_recordings_status_idx

-- Новые
stream_recordings_published_recorded_idx  -- Опубликованные по дате
stream_recordings_sort_order_idx          -- Сортировка
stream_recordings_category_idx            -- Категории
stream_recordings_views_idx               -- Популярные
```

#### stream_attendance
```sql
-- Индексы переименованы для консистентности
stream_attendance_stream_user_idx → stream_attendance_recording_user_idx
stream_attendance_stream_id_idx   → stream_attendance_recording_id_idx

-- Foreign key обновлён
stream_id → stream_recordings(id)
```

---

### 2. Code Changes

#### src/db/schema.ts

**До:**
```typescript
export const liveStreams = pgTable('live_streams', {
  scheduledAt: timestamp('scheduled_at').notNull(),
  streamUrl: text('stream_url'),
  epReward: integer('ep_reward').default(100).notNull(),
  ...
});
```

**После:**
```typescript
export const streamRecordings = pgTable('stream_recordings', {
  recordedAt: timestamp('recorded_at').notNull(),
  videoUrl: text('video_url'),
  energiesReward: integer('energies_reward').default(100).notNull(),

  // Новые поля
  duration: integer('duration'),
  thumbnailUrl: text('thumbnail_url'),
  viewsCount: integer('views_count').default(0).notNull(),
  category: text('category').default('general'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  ...
});
```

**Relations:**
```typescript
// До
export const liveStreamsRelations = relations(liveStreams, ({ many }) => ({
  attendance: many(streamAttendance),
}));

// После
export const streamRecordingsRelations = relations(streamRecordings, ({ many }) => ({
  attendance: many(streamAttendance),
}));
```

---

#### src/modules/streams/service.ts

**Переименование класса:**
```typescript
// До
export class StreamsService { ... }

// После
export class StreamRecordingsService { ... }
```

**Новые методы:**
```typescript
// Получить все записи с фильтрами
getAllRecordings(options?: { category?, isPublished?, limit? })

// Получить последние записи
getRecentRecordings(limit = 10)

// Получить популярные записи (по просмотрам)
getPopularRecordings(limit = 10)

// Получить записи по категории
getRecordingsByCategory(category, limit = 20)

// Отметить просмотр записи (+ increment views_count)
markWatched(userId, recordingId)

// Создать запись эфира
createRecording(data: {
  title, recordedAt, host, videoUrl,
  description?, duration?, thumbnailUrl?,
  category?, energiesReward?, sortOrder?, isPublished?
})

// Обновить запись
updateRecording(recordingId, data)

// Удалить запись
deleteRecording(recordingId)

// Статистика
getRecordingStats(recordingId)
getUserWatchStats(userId)
```

**Удалённые методы** (не актуальны для записей):
```typescript
// Эти методы были для live трансляций, больше не нужны
❌ getUpcomingStreams()
❌ getNextStream()
❌ updateStreamStatus()
```

**Обратная совместимость:**
```typescript
// Старый экспорт всё ещё работает
export const streamsService = streamRecordingsService;
```

---

#### src/modules/energy-points/service.ts

**До:**
```typescript
async awardLiveStream(userId: string, streamId: string, watchedOnline: boolean) {
  if (watchedOnline) {
    return this.award(userId, 100, 'Участие в прямом эфире', { streamId });
  } else {
    return this.award(userId, 10, 'Просмотр записи эфира', { streamId });
  }
}
```

**После:**
```typescript
// Новый метод
async awardStreamRecording(userId: string, recordingId: string) {
  return this.award(userId, 100, 'Просмотр записи эфира', { recordingId });
}

// Старый метод DEPRECATED (обратная совместимость)
async awardLiveStream(userId: string, streamId: string, watchedOnline: boolean) {
  return this.awardStreamRecording(userId, streamId);
}
```

---

## Категории записей

```typescript
type RecordingCategory =
  | 'general'      // Общие эфиры
  | 'meditation'   // Медитации
  | 'practice'     // Практики
  | 'qa'           // Вопросы-ответы
  | 'workshop'     // Мастер-классы
  | 'interview';   // Интервью
```

---

## Breaking Changes

### ⚠️ Что сломается без обновления кода:

1. **Import из schema.ts:**
```typescript
// ❌ Старый код сломается
import { liveStreams } from '@/db/schema';

// ✅ Нужно заменить на
import { streamRecordings } from '@/db/schema';
```

2. **Поля объекта:**
```typescript
// ❌ Старый код сломается
stream.scheduledAt
stream.streamUrl
stream.epReward

// ✅ Нужно заменить на
recording.recordedAt
recording.videoUrl
recording.energiesReward
```

3. **Методы service:**
```typescript
// ❌ Эти методы больше не существуют
await streamsService.getUpcomingStreams()
await streamsService.getNextStream()
await streamsService.getAllStreams()

// ✅ Нужно использовать новые
await streamRecordingsService.getAllRecordings()
await streamRecordingsService.getRecentRecordings()
await streamRecordingsService.getPopularRecordings()
```

---

## Migration Steps

### 1. Применить SQL миграцию ✅ DONE
```bash
psql < drizzle/0007_rename_streams_to_recordings.sql
```

### 2. Обновить schema.ts ✅ DONE
- Переименовать `liveStreams` → `streamRecordings`
- Добавить новые поля
- Обновить relations

### 3. Обновить service.ts ✅ DONE
- Переименовать класс
- Обновить методы
- Добавить новые методы для работы с записями

### 4. Обновить energy-points/service.ts ✅ DONE
- Добавить `awardStreamRecording()`
- Пометить `awardLiveStream()` как DEPRECATED

### 5. Обновить API endpoints (TODO если есть)
- Обновить routes
- Обновить controllers

### 6. Обновить frontend (TODO)
- Обновить типы
- Обновить API calls
- Обновить UI для новых полей (duration, thumbnail, category)

---

## Обратная совместимость

### ✅ Что продолжит работать:

1. **Старые imports:**
```typescript
import { streamsService } from '@/modules/streams/service';
// Всё ещё работает, просто алиас для streamRecordingsService
```

2. **Поле status:**
```sql
-- Поле status оставлено для обратной совместимости
-- Все записи имеют status = 'ended'
```

3. **Старый метод awardLiveStream:**
```typescript
// Продолжит работать, вызывает awardStreamRecording() внутри
await energyPointsService.awardLiveStream(userId, streamId, true);
```

---

## Примеры использования

### Создать запись эфира
```typescript
const recording = await streamRecordingsService.createRecording({
  title: 'Медитация на привлечение изобилия',
  recordedAt: new Date('2026-01-15'),
  host: 'Кристина',
  videoUrl: 'https://youtube.com/watch?v=xxxxx',
  description: 'Глубокая медитация на изобилие...',
  duration: 3600, // 1 час в секундах
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  category: 'meditation',
  energiesReward: 150,
  sortOrder: 1,
  isPublished: true,
});
```

### Получить записи по категории
```typescript
const meditations = await streamRecordingsService.getRecordingsByCategory('meditation', 20);
```

### Отметить просмотр
```typescript
const result = await streamRecordingsService.markWatched(userId, recordingId);
// { success: true, energiesEarned: 150, alreadyWatched: false }
```

### Получить популярные записи
```typescript
const popular = await streamRecordingsService.getPopularRecordings(10);
// Сортировка по views_count DESC
```

### Получить историю просмотров пользователя
```typescript
const history = await streamRecordingsService.getUserWatchHistory(userId);
// Возвращает: recordingTitle, recordingHost, recordingCategory, energiesEarned, watchedAt
```

---

## Database Statistics

**После миграции:**
```sql
-- Проверить таблицу
SELECT * FROM stream_recordings LIMIT 5;

-- Проверить новые поля
SELECT title, category, views_count, duration FROM stream_recordings;

-- Проверить индексы
\di stream_recordings*

-- Проверить статистику
SELECT
  category,
  COUNT(*) as count,
  SUM(views_count) as total_views,
  AVG(duration) as avg_duration
FROM stream_recordings
WHERE is_published = true
GROUP BY category;
```

---

## Rollback Plan

Если что-то пошло не так:

```sql
-- 1. Переименовать обратно
ALTER TABLE stream_recordings RENAME TO live_streams;
ALTER TABLE stream_recordings RENAME COLUMN recorded_at TO scheduled_at;
ALTER TABLE stream_recordings RENAME COLUMN video_url TO stream_url;
ALTER TABLE stream_recordings RENAME COLUMN energies_reward TO ep_reward;

-- 2. Удалить новые поля
ALTER TABLE live_streams DROP COLUMN duration;
ALTER TABLE live_streams DROP COLUMN thumbnail_url;
ALTER TABLE live_streams DROP COLUMN views_count;
ALTER TABLE live_streams DROP COLUMN category;
ALTER TABLE live_streams DROP COLUMN sort_order;
ALTER TABLE live_streams DROP COLUMN is_published;

-- 3. Восстановить код из backup
mv src/modules/streams/service.ts.backup src/modules/streams/service.ts
```

---

## Summary

✅ **Миграция успешна!**

- Таблица переименована: `live_streams` → `stream_recordings`
- Поля переименованы для семантической корректности
- Добавлено 6 новых полей для работы с записями
- Создано 4 новых индекса для производительности
- Код обновлён с обратной совместимостью
- Service методы адаптированы под записи эфиров

**Теперь структура БД корректно отражает назначение:** хранение записей прошедших эфиров.

---

**Created:** 2026-01-18
**Updated by:** Claude Sonnet 4.5
