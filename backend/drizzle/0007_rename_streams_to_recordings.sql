-- Migration 0007: Rename live_streams to stream_recordings
-- Адаптация таблицы для хранения записей прошедших эфиров
-- Created: 2026-01-18

BEGIN;

-- ============================================================================
-- STEP 1: Переименование таблицы
-- ============================================================================

ALTER TABLE live_streams RENAME TO stream_recordings;

-- ============================================================================
-- STEP 2: Переименование полей для семантики "записи"
-- ============================================================================

-- scheduled_at → recorded_at (дата проведения эфира)
ALTER TABLE stream_recordings RENAME COLUMN scheduled_at TO recorded_at;

-- stream_url → video_url (ссылка на запись)
ALTER TABLE stream_recordings RENAME COLUMN stream_url TO video_url;

-- ep_reward → energies_reward (для consistency с другими таблицами)
ALTER TABLE stream_recordings RENAME COLUMN ep_reward TO energies_reward;

-- ============================================================================
-- STEP 3: Добавление новых полей для записей
-- ============================================================================

-- Длительность видео в секундах
ALTER TABLE stream_recordings
ADD COLUMN duration INTEGER;

-- Превью/thumbnail изображение
ALTER TABLE stream_recordings
ADD COLUMN thumbnail_url TEXT;

-- Количество просмотров
ALTER TABLE stream_recordings
ADD COLUMN views_count INTEGER DEFAULT 0;

-- Категория записи (медитация, практика, Q&A и т.д.)
ALTER TABLE stream_recordings
ADD COLUMN category TEXT DEFAULT 'general';

-- Сортировка (для отображения в определённом порядке)
ALTER TABLE stream_recordings
ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Опубликована ли запись (для модерации)
ALTER TABLE stream_recordings
ADD COLUMN is_published BOOLEAN DEFAULT true;

-- ============================================================================
-- STEP 4: Удаление/изменение поля status
-- ============================================================================

-- Для записей status не нужен, все записи считаются "ended"
-- Но сначала нужно удалить constraint и зависимости
DROP INDEX IF EXISTS live_streams_status_idx;
DROP INDEX IF EXISTS live_streams_status_scheduled_idx;

-- Устанавливаем все существующие записи как 'ended'
UPDATE stream_recordings SET status = 'ended';

-- Можем оставить поле status для обратной совместимости
-- Или удалить если уверены что не используется
-- ALTER TABLE stream_recordings DROP COLUMN status;

-- ============================================================================
-- STEP 5: Переименование индексов
-- ============================================================================

-- Переименование существующих индексов
ALTER INDEX live_streams_pkey RENAME TO stream_recordings_pkey;
ALTER INDEX live_streams_scheduled_at_idx RENAME TO stream_recordings_recorded_at_idx;

-- Если не удалили status_idx выше
ALTER INDEX IF EXISTS live_streams_status_idx RENAME TO stream_recordings_status_idx;

-- ============================================================================
-- STEP 6: Создание новых индексов для производительности
-- ============================================================================

-- Индекс для поиска опубликованных записей по дате
CREATE INDEX stream_recordings_published_recorded_idx
ON stream_recordings (is_published, recorded_at DESC)
WHERE is_published = true;

-- Индекс для сортировки
CREATE INDEX stream_recordings_sort_order_idx
ON stream_recordings (sort_order);

-- Индекс для категорий
CREATE INDEX stream_recordings_category_idx
ON stream_recordings (category);

-- Индекс для популярных записей (по просмотрам)
CREATE INDEX stream_recordings_views_idx
ON stream_recordings (views_count DESC);

-- ============================================================================
-- STEP 7: Обновление foreign key в stream_attendance
-- ============================================================================

-- Foreign key автоматически обновится при переименовании таблицы,
-- но переименуем constraint для ясности
ALTER TABLE stream_attendance
DROP CONSTRAINT stream_attendance_stream_id_live_streams_id_fk;

ALTER TABLE stream_attendance
ADD CONSTRAINT stream_attendance_stream_id_stream_recordings_id_fk
FOREIGN KEY (stream_id) REFERENCES stream_recordings(id) ON DELETE CASCADE;

-- Переименуем индексы в stream_attendance для консистентности
ALTER INDEX stream_attendance_stream_user_idx RENAME TO stream_attendance_recording_user_idx;
ALTER INDEX stream_attendance_stream_id_idx RENAME TO stream_attendance_recording_id_idx;

-- ============================================================================
-- STEP 8: Комментарии к таблице и полям
-- ============================================================================

COMMENT ON TABLE stream_recordings IS
'Записи прошедших эфиров (не для live трансляций)';

COMMENT ON COLUMN stream_recordings.recorded_at IS
'Дата и время проведения эфира';

COMMENT ON COLUMN stream_recordings.video_url IS
'Ссылка на запись эфира (YouTube, Vimeo и т.д.)';

COMMENT ON COLUMN stream_recordings.duration IS
'Длительность видео в секундах';

COMMENT ON COLUMN stream_recordings.thumbnail_url IS
'Превью изображение для записи';

COMMENT ON COLUMN stream_recordings.views_count IS
'Количество просмотров записи';

COMMENT ON COLUMN stream_recordings.category IS
'Категория записи: general, meditation, practice, qa, workshop';

COMMENT ON COLUMN stream_recordings.is_published IS
'Опубликована ли запись (для модерации)';

COMMENT ON COLUMN stream_recordings.energies_reward IS
'Награда энергиями за просмотр записи';

-- ============================================================================
-- STEP 9: ANALYZE для обновления статистики
-- ============================================================================

ANALYZE stream_recordings;
ANALYZE stream_attendance;

COMMIT;

-- ============================================================================
-- NOTES
-- ============================================================================

-- После применения миграции нужно обновить код:
-- 1. src/db/schema.ts: liveStreams → streamRecordings
-- 2. src/modules/streams/service.ts: переименовать методы и логику
-- 3. Обновить API endpoints если есть

-- Рекомендуемые категории для category:
-- - 'general' - Общие эфиры
-- - 'meditation' - Медитации
-- - 'practice' - Практики
-- - 'qa' - Вопросы-ответы
-- - 'workshop' - Мастер-классы
-- - 'interview' - Интервью
