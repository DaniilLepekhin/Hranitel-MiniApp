# Архитектура раздела "Путь" - Обучающий контент

## Общая структура

```
Путь (PathTab)
├── Программа месяца (Monthly Program)
├── Курсы (Courses)
│   └── Курс → Уроки → Видео с таймкодами
├── Подкасты (Podcasts)
│   └── Подкаст → Эпизоды → Аудио/Видео
├── Эфиры (Live Streams - записи)
│   └── Эфир → Видео с таймкодами
└── Практики (Practices)
    └── Практика → Контент практики
```

## Структура БД

### 1. Content Items (общая таблица контента)
```sql
CREATE TABLE content_items (
  id VARCHAR PRIMARY KEY,
  type VARCHAR NOT NULL, -- 'course' | 'podcast' | 'stream' | 'practice'
  title VARCHAR NOT NULL,
  description TEXT,
  cover_url VARCHAR,
  key_number INTEGER, -- связь с ключами (1-12)
  month_program BOOLEAN DEFAULT false, -- программа месяца
  order_index INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Content Sections (уроки внутри курса, эпизоды подкаста)
```sql
CREATE TABLE content_sections (
  id VARCHAR PRIMARY KEY,
  content_item_id VARCHAR REFERENCES content_items(id),
  title VARCHAR NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Videos (видео контент)
```sql
CREATE TABLE videos (
  id VARCHAR PRIMARY KEY,
  content_section_id VARCHAR REFERENCES content_sections(id),
  content_item_id VARCHAR REFERENCES content_items(id), -- для прямой связи с эфирами
  title VARCHAR NOT NULL,
  description TEXT,
  video_url VARCHAR NOT NULL, -- URL видео (YouTube, Vimeo, S3, etc.)
  duration_seconds INTEGER,
  thumbnail_url VARCHAR,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Timecodes (таймкоды для видео)
```sql
CREATE TABLE video_timecodes (
  id VARCHAR PRIMARY KEY,
  video_id VARCHAR REFERENCES videos(id),
  time_seconds INTEGER NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0
);
```

### 5. User Progress (прогресс пользователя)
```sql
CREATE TABLE user_content_progress (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id),
  content_item_id VARCHAR REFERENCES content_items(id),
  video_id VARCHAR REFERENCES videos(id),
  watched BOOLEAN DEFAULT false,
  watch_time_seconds INTEGER DEFAULT 0, -- сколько секунд просмотрел
  completed_at TIMESTAMP,
  ep_earned INTEGER DEFAULT 0, -- сколько EP заработал
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);
```

### 6. Practices Content (текстовый контент практик)
```sql
CREATE TABLE practice_content (
  id VARCHAR PRIMARY KEY,
  content_item_id VARCHAR REFERENCES content_items(id),
  content_type VARCHAR NOT NULL, -- 'markdown' | 'html'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### Content Items
- `GET /api/content/items?type=course&keyNumber=1` - список контента по типу и ключу
- `GET /api/content/items/:id` - детали контента
- `GET /api/content/month-program` - программа текущего месяца

### Sections & Videos
- `GET /api/content/:itemId/sections` - секции контента (уроки курса)
- `GET /api/content/sections/:sectionId/videos` - видео в секции
- `GET /api/content/videos/:videoId` - детали видео с таймкодами

### User Progress
- `GET /api/content/progress?userId=xxx` - весь прогресс пользователя
- `POST /api/content/progress/complete` - отметить видео как просмотренное
  ```json
  {
    "userId": "xxx",
    "videoId": "yyy",
    "watchTimeSeconds": 1234
  }
  ```
- `GET /api/content/progress/stats?userId=xxx` - статистика (сколько EP заработано)

### Practices
- `GET /api/content/practices/:id/content` - контент практики

## Frontend Компоненты

### 1. PathTab (главная)
- Описание раздела
- Кнопки навигации: Программа месяца, Курсы, Подкасты, Эфиры, Практики

### 2. MonthProgramPage
- Контент текущего месяца
- Список всех материалов месяца

### 3. ContentListPage (универсальная)
- Список курсов / подкастов / эфиров / практик
- Карточки с превью

### 4. ContentDetailPage
- Детали курса/подкаста/эфира
- Список уроков/эпизодов внутри

### 5. VideoPlayerPage
- Видеоплеер с Picture-in-Picture
- Таймкоды (кликабельные)
- Кнопка "Я посмотрел(а)"
- Прогресс-бар

### 6. PracticeViewerPage
- Отображение текстового контента практики
- Markdown/HTML рендеринг

## Награды и геймификация

### EP за просмотр видео:
- Короткое видео (< 5 мин): +25 EP
- Среднее видео (5-20 мин): +50 EP
- Длинное видео (> 20 мин): +100 EP
- Завершение урока полностью: +150 EP
- Завершение всего курса: +500 EP

## Технологии

### Video Player
- **React Player** (поддерживает YouTube, Vimeo, file URLs)
- **Picture-in-Picture API** (браузерный API)
- Custom controls с таймкодами

### Хранение видео
- YouTube (для публичного контента)
- Vimeo Private (для премиум контента)
- S3 + CloudFront (для эксклюзивного контента)

## Приоритеты реализации

1. **Phase 1: База и API**
   - Создать таблицы БД
   - Реализовать CRUD API для контента
   - API прогресса пользователя

2. **Phase 2: Видеоплеер**
   - VideoPlayer компонент
   - Picture-in-Picture
   - Таймкоды
   - Кнопка завершения

3. **Phase 3: Контент-страницы**
   - Список контента
   - Детальные страницы
   - Навигация между разделами

4. **Phase 4: Геймификация**
   - Начисление EP
   - Статистика прогресса
   - Достижения
