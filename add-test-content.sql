-- Тестовые данные для системы обучающего контента КОД ДЕНЕГ 4.0
-- Применить: PGPASSWORD='kH*kyrS&9z7K' psql -h 31.128.36.81 -p 5423 -U postgres -d club_hranitel -f add-test-content.sql

-- ==============================
-- 1. ПРОГРАММА МЕСЯЦА (Январь 2026)
-- ==============================

-- Курс "Финансовая трансформация"
INSERT INTO content_items (id, type, title, description, cover_url, key_number, month_program, order_index, is_published)
VALUES
('11111111-1111-1111-1111-111111111111', 'course', 'Финансовая трансформация',
'Начните свой путь к финансовому благополучию с базовых принципов управления деньгами',
'https://example.com/course1.jpg', 1, true, 1, true);

-- Практика "Денежная медитация"
INSERT INTO content_items (id, type, title, description, cover_url, key_number, month_program, order_index, is_published)
VALUES
('22222222-2222-2222-2222-222222222222', 'practice', 'Денежная медитация',
'Ежедневная практика для привлечения изобилия в вашу жизнь',
'https://example.com/practice1.jpg', 1, true, 2, true);

-- ==============================
-- 2. СЕКЦИИ КУРСА (Уроки)
-- ==============================

-- Урок 1: Введение
INSERT INTO content_sections (id, content_item_id, title, description, order_index)
VALUES
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
'Урок 1: Основы денежного мышления',
'Изучите фундаментальные принципы взаимодействия с деньгами', 1);

-- Урок 2: Практика
INSERT INTO content_sections (id, content_item_id, title, description, order_index)
VALUES
('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
'Урок 2: Создание финансового плана',
'Практические шаги по составлению личного финансового плана', 2);

-- ==============================
-- 3. ВИДЕО
-- ==============================

-- Видео 1 для Урока 1
INSERT INTO videos (id, content_section_id, title, description, video_url, duration_seconds, thumbnail_url, order_index)
VALUES
('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333',
'Что такое денежное мышление',
'Основные концепции и принципы работы с деньгами',
'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 720,
'https://example.com/thumb1.jpg', 1);

-- Видео 2 для Урока 1
INSERT INTO videos (id, content_section_id, title, description, video_url, duration_seconds, thumbnail_url, order_index)
VALUES
('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333',
'Убеждения о деньгах',
'Как наши убеждения влияют на финансовое благополучие',
'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 900,
'https://example.com/thumb2.jpg', 2);

-- Видео для Урока 2
INSERT INTO videos (id, content_section_id, title, description, video_url, duration_seconds, thumbnail_url, order_index)
VALUES
('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444',
'Пошаговое создание финансового плана',
'Практическое руководство по планированию финансов',
'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 1500,
'https://example.com/thumb3.jpg', 1);

-- ==============================
-- 4. ТАЙМКОДЫ ДЛЯ ВИДЕО
-- ==============================

-- Таймкоды для видео "Что такое денежное мышление"
INSERT INTO video_timecodes (video_id, time_seconds, title, description, order_index)
VALUES
('55555555-5555-5555-5555-555555555555', 0, 'Введение', 'Приветствие и обзор урока', 1),
('55555555-5555-5555-5555-555555555555', 120, 'Что такое деньги', 'Определение денег и их функции', 2),
('55555555-5555-5555-5555-555555555555', 360, 'Денежное мышление', 'Как мыслят богатые люди', 3),
('55555555-5555-5555-5555-555555555555', 600, 'Заключение', 'Резюме и домашнее задание', 4);

-- Таймкоды для видео "Убеждения о деньгах"
INSERT INTO video_timecodes (video_id, time_seconds, title, description, order_index)
VALUES
('66666666-6666-6666-6666-666666666666', 0, 'Введение', 'О чем этот урок', 1),
('66666666-6666-6666-6666-666666666666', 180, 'Ограничивающие убеждения', 'Какие убеждения мешают богатству', 2),
('66666666-6666-6666-6666-666666666666', 540, 'Трансформация убеждений', 'Как изменить свои убеждения', 3);

-- ==============================
-- 5. КОНТЕНТ ПРАКТИКИ
-- ==============================

INSERT INTO practice_content (id, content_item_id, content_type, content)
VALUES
('88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', 'markdown',
'# Денежная медитация

## Подготовка

Найдите тихое место, где вас никто не будет беспокоить в течение 15-20 минут.

## Инструкция

1. **Сядьте удобно** и закройте глаза
2. **Сделайте 3 глубоких вдоха и выдоха**
3. **Представьте** поток золотистого света, наполняющий вас
4. **Повторите** про себя: "Я достойна изобилия. Деньги приходят ко мне легко и свободно"
5. **Визуализируйте** себя в окружении изобилия

## Важно

> Выполняйте эту практику ежедневно утром или перед сном для максимального эффекта.

## Результаты

После регулярного выполнения практики вы заметите:
- Улучшение отношения к деньгам
- Увеличение финансовых возможностей
- Снижение тревожности по поводу денег
');

-- ==============================
-- 6. ДОПОЛНИТЕЛЬНЫЙ КОНТЕНТ ДЛЯ ДРУГИХ КЛЮЧЕЙ
-- ==============================

-- Подкаст для Ключа #2
INSERT INTO content_items (id, type, title, description, cover_url, key_number, month_program, order_index, is_published)
VALUES
('99999999-9999-9999-9999-999999999999', 'podcast', 'Истории успеха',
'Интервью с людьми, достигшими финансового благополучия',
'https://example.com/podcast1.jpg', 2, false, 3, true);

-- Эпизод подкаста
INSERT INTO content_sections (id, content_item_id, title, description, order_index)
VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999',
'Эпизод 1: От нуля до миллиона',
'История предпринимателя, построившего бизнес с нуля', 1);

-- Аудио для подкаста
INSERT INTO videos (id, content_section_id, title, description, video_url, duration_seconds, thumbnail_url, order_index)
VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
'От нуля до миллиона - полная история',
'45-минутное интервью',
'https://example.com/audio1.mp3', 2700,
'https://example.com/podcast_thumb.jpg', 1);

-- Запись эфира для Ключа #3
INSERT INTO content_items (id, type, title, description, cover_url, key_number, month_program, order_index, is_published)
VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'stream_record', 'Разбор инвестиций',
'Прямой эфир о том, как начать инвестировать с небольшой суммы',
'https://example.com/stream1.jpg', 3, false, 4, true);

-- Видео эфира (без секции, прямая привязка)
INSERT INTO videos (id, content_item_id, title, description, video_url, duration_seconds, thumbnail_url, order_index)
VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
'Инвестиции для начинающих',
'Запись прямого эфира от 15 января 2026',
'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 3600,
'https://example.com/stream_thumb.jpg', 1);

-- ==============================
-- ГОТОВО!
-- ==============================
-- Добавлено:
-- - 1 курс с 2 уроками и 3 видео
-- - 1 практика с текстовым контентом
-- - 1 подкаст с эпизодом
-- - 1 запись эфира
-- - Таймкоды для навигации по видео
-- ==============================
