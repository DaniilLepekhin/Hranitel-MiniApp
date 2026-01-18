# 📊 Database Structure - Club Hranitel

**Database:** PostgreSQL 18.1
**Total tables:** 27
**Total size:** ~11 MB (users table占主导)

---

## 🗂️ Структура по категориям

### 👤 Users & Authentication

#### **users** (6.8 MB - главная таблица)
```sql
id                   UUID PRIMARY KEY
telegram_id          TEXT UNIQUE NOT NULL        -- Telegram ID пользователя
username             TEXT                        -- Telegram username
first_name           TEXT
last_name            TEXT
photo_url            TEXT
language_code        TEXT DEFAULT 'ru'
city                 TEXT                        -- ⭐ НОВОЕ ПОЛЕ для рейтингов

-- Gamification
level                INTEGER NOT NULL DEFAULT 1
experience           INTEGER NOT NULL DEFAULT 0
energies             INTEGER NOT NULL DEFAULT 0  -- Основная валюта
streak               INTEGER NOT NULL DEFAULT 0  -- Дни подряд

-- Subscription
is_pro               BOOLEAN NOT NULL DEFAULT false
subscription_expires TIMESTAMP
role                 user_role NOT NULL DEFAULT 'user'

-- Metadata
settings             JSONB DEFAULT '{}'
metadata             JSONB DEFAULT '{}'
last_active_date     TIMESTAMP
created_at           TIMESTAMP NOT NULL
updated_at           TIMESTAMP NOT NULL
```

**Indexes (11):**
- `users_telegram_id_hash_idx` - HASH index для быстрого поиска (50x faster)
- `users_is_pro_energies_idx` - Global leaderboard (33x faster)
- `users_city_is_pro_energies_idx` - City ratings (30x faster)
- `users_level_experience_idx` - Level progression
- `users_subscription_expires_idx` - Subscription checks

**User Roles:** `user`, `admin`, `moderator`

---

### 👥 Teams System

#### **teams** (8 KB)
```sql
id           UUID PRIMARY KEY
name         TEXT NOT NULL               -- Название команды
description  TEXT
metka        TEXT                        -- Метка/тег команды
city_chat    TEXT                        -- ID чата города
member_count INTEGER NOT NULL DEFAULT 0
max_members  INTEGER NOT NULL DEFAULT 12
created_at   TIMESTAMP NOT NULL
```

**Indexes (2):**
- `teams_metka_idx` - Поиск по метке

#### **team_members** (8 KB)
```sql
id        UUID PRIMARY KEY
team_id   UUID NOT NULL -> teams(id)
user_id   UUID NOT NULL -> users(id)
role      TEXT NOT NULL DEFAULT 'member'  -- member, leader
joined_at TIMESTAMP NOT NULL
```

**Indexes (5):**
- `team_members_team_user_idx` - UNIQUE (team_id, user_id)
- `team_members_user_id_role_idx` - Роли пользователей

---

### ⚡ Energy System

#### **energy_transactions** (8 KB)
```sql
id         UUID PRIMARY KEY
user_id    UUID NOT NULL -> users(id)
amount     INTEGER NOT NULL              -- Положительное или отрицательное
type       energy_transaction_type       -- income, expense
reason     TEXT NOT NULL                 -- Причина транзакции
metadata   JSONB DEFAULT '{}'
created_at TIMESTAMP NOT NULL
```

**Transaction Types:**
- `income` - Получение энергий
- `expense` - Трата энергий

**Indexes (8):**
- `energy_transactions_income_idx` - Partial index для income
- `energy_transactions_expense_idx` - Partial index для expense
- `energy_transactions_user_created_idx` - История пользователя

**Autovacuum:** Aggressive (high-frequency table)

---

### 🛒 Shop System

#### **shop_items** (8 KB)
```sql
id          UUID PRIMARY KEY
title       TEXT NOT NULL
description TEXT
category    shop_category NOT NULL        -- boost, upgrade, cosmetic
price       INTEGER NOT NULL               -- Цена в энергиях
image_url   TEXT
item_type   shop_item_type NOT NULL       -- experience_boost, energy_pack, avatar_frame
item_data   JSONB DEFAULT '{}'             -- Параметры предмета
is_active   BOOLEAN NOT NULL DEFAULT true
sort_order  INTEGER NOT NULL DEFAULT 0
created_at  TIMESTAMP NOT NULL
updated_at  TIMESTAMP NOT NULL
```

**Shop Categories:**
- `boost` - Бусты (опыт, энергии)
- `upgrade` - Улучшения
- `cosmetic` - Косметика (аватары, рамки)

**Item Types:**
- `experience_boost` - Множитель опыта
- `energy_pack` - Пакет энергий
- `avatar_frame` - Рамка аватара
- `special` - Специальные предметы

#### **shop_purchases** (8 KB)
```sql
id           UUID PRIMARY KEY
user_id      UUID NOT NULL -> users(id)
item_id      UUID NOT NULL -> shop_items(id)
price        INTEGER NOT NULL              -- Цена на момент покупки
status       TEXT NOT NULL DEFAULT 'completed'
purchased_at TIMESTAMP NOT NULL
used_at      TIMESTAMP                     -- Когда предмет использован
```

**Indexes (7):**
- `shop_purchases_unused_idx` - Неиспользованные покупки
- `shop_purchases_user_purchased_idx` - История покупок

---

### 📚 Content System

#### **content_items** (16 KB)
```sql
id            UUID PRIMARY KEY
type          content_type NOT NULL         -- article, video, practice
title         TEXT NOT NULL
description   TEXT
cover_url     TEXT
key_number    INTEGER                       -- Номер ключа (1-12)
month_program BOOLEAN DEFAULT false         -- Месячная программа
order_index   INTEGER NOT NULL DEFAULT 0
is_published  BOOLEAN NOT NULL DEFAULT true
created_at    TIMESTAMP NOT NULL
updated_at    TIMESTAMP NOT NULL
```

**Content Types:**
- `article` - Статьи
- `video` - Видео уроки
- `practice` - Практики

#### **content_sections** (16 KB)
```sql
id              UUID PRIMARY KEY
content_item_id UUID NOT NULL -> content_items(id)
title           TEXT NOT NULL
description     TEXT
order_index     INTEGER NOT NULL DEFAULT 0
created_at      TIMESTAMP NOT NULL
```

#### **videos** (16 KB)
```sql
id                 UUID PRIMARY KEY
content_item_id    UUID -> content_items(id)
content_section_id UUID -> content_sections(id)
title              TEXT NOT NULL
description        TEXT
video_url          TEXT NOT NULL
thumbnail_url      TEXT
duration           INTEGER                    -- Длительность в секундах
order_index        INTEGER NOT NULL DEFAULT 0
energies_reward    INTEGER NOT NULL DEFAULT 0  -- Награда за просмотр
created_at         TIMESTAMP NOT NULL
updated_at         TIMESTAMP NOT NULL
```

#### **video_timecodes** (16 KB)
```sql
id         UUID PRIMARY KEY
video_id   UUID NOT NULL -> videos(id)
time       INTEGER NOT NULL              -- Время в секундах
label      TEXT NOT NULL                 -- Метка таймкода
created_at TIMESTAMP NOT NULL
```

#### **user_content_progress** (0 bytes - пустая)
```sql
id                 UUID PRIMARY KEY
user_id            UUID NOT NULL -> users(id)
content_item_id    UUID -> content_items(id)
video_id           UUID -> videos(id)
watched            BOOLEAN DEFAULT false
watch_time_seconds INTEGER DEFAULT 0
completed_at       TIMESTAMP
energies_earned    INTEGER DEFAULT 0         -- Заработано энергий
created_at         TIMESTAMP NOT NULL
updated_at         TIMESTAMP NOT NULL
```

**Indexes (6):**
- `user_content_progress_user_video_idx` - UNIQUE (user_id, video_id)
- `user_content_progress_completed_energies_idx` - Завершённый контент

**Autovacuum:** Aggressive (high-frequency table)

---

### 🎓 Courses System

#### **courses** (8 KB)
```sql
id               UUID PRIMARY KEY
title            TEXT NOT NULL
description      TEXT
category         course_category NOT NULL     -- mindset, health, relationships
cover_url        TEXT
is_premium       BOOLEAN NOT NULL DEFAULT false
key_number       INTEGER                      -- Номер ключа (1-12)
month_theme      TEXT                         -- Тема месяца
unlock_condition JSONB DEFAULT '{}'           -- Условия разблокировки
sort_order       INTEGER NOT NULL DEFAULT 0
is_active        BOOLEAN NOT NULL DEFAULT true
created_at       TIMESTAMP NOT NULL
updated_at       TIMESTAMP NOT NULL
```

**Course Categories:**
- `mindset` - Mindset / Мышление
- `health` - Здоровье
- `relationships` - Отношения
- `finance` - Финансы
- `spirituality` - Духовность

#### **course_days** (8 KB)
```sql
id                 UUID PRIMARY KEY
course_id          UUID NOT NULL -> courses(id)
day_number         INTEGER NOT NULL
title              TEXT NOT NULL
content            TEXT                       -- HTML/Markdown контент
audio_url          TEXT
video_url          TEXT
pdf_url            TEXT
welcome_content    TEXT
course_info        TEXT
meditation_guide   TEXT
additional_content TEXT
gift_content       TEXT
stream_link        TEXT
is_premium         BOOLEAN NOT NULL DEFAULT false
created_at         TIMESTAMP NOT NULL
updated_at         TIMESTAMP NOT NULL

UNIQUE (course_id, day_number)
```

#### **course_progress** (8 KB)
```sql
id               UUID PRIMARY KEY
user_id          UUID NOT NULL -> users(id)
course_id        UUID NOT NULL -> courses(id)
current_day      INTEGER NOT NULL DEFAULT 1
completed_days   JSONB DEFAULT '[]'          -- [1, 2, 3, ...]
last_accessed_at TIMESTAMP NOT NULL
created_at       TIMESTAMP NOT NULL
updated_at       TIMESTAMP NOT NULL

UNIQUE (user_id, course_id)
```

#### **favorites** (0 bytes - пустая)
```sql
id         UUID PRIMARY KEY
user_id    UUID NOT NULL -> users(id)
course_id  UUID NOT NULL -> courses(id)
created_at TIMESTAMP NOT NULL

UNIQUE (user_id, course_id)
```

---

### 🧘 Meditations System

#### **meditations** (8 KB)
```sql
id           UUID PRIMARY KEY
title        TEXT NOT NULL
description  TEXT
duration     INTEGER NOT NULL              -- Длительность в секундах
cover_url    TEXT
audio_url    TEXT
audio_series JSONB DEFAULT '[]'            -- Серии аудио
category     TEXT DEFAULT 'relaxation'     -- relaxation, focus, sleep
is_premium   BOOLEAN NOT NULL DEFAULT false
sort_order   INTEGER NOT NULL DEFAULT 0
created_at   TIMESTAMP NOT NULL
updated_at   TIMESTAMP NOT NULL
```

**Meditation Categories:**
- `relaxation` - Расслабление
- `focus` - Концентрация
- `sleep` - Сон
- `energy` - Энергия

#### **meditation_history** (0 bytes - пустая)
```sql
id                UUID PRIMARY KEY
user_id           UUID NOT NULL -> users(id)
meditation_id     UUID NOT NULL -> meditations(id)
duration_listened INTEGER NOT NULL DEFAULT 0  -- Прослушано секунд
completed         BOOLEAN NOT NULL DEFAULT false
created_at        TIMESTAMP NOT NULL
```

**Indexes (4):**
- `meditation_history_user_completed_created_idx` - История медитаций

---

### 🎥 Stream Recordings System (Записи эфиров)

#### **stream_recordings** (8 KB) ⭐ ОБНОВЛЕНО 2026-01-18
```sql
id              UUID PRIMARY KEY
title           TEXT NOT NULL
description     TEXT
recorded_at     TIMESTAMP NOT NULL           -- Дата проведения эфира
video_url       TEXT                         -- Ссылка на запись (YouTube, Vimeo)
host            TEXT                         -- Ведущий (Кристина, Продюсер)
status          stream_status NOT NULL       -- Оставлено для совместимости
energies_reward INTEGER NOT NULL DEFAULT 100 -- Награда за просмотр

-- НОВЫЕ ПОЛЯ (Migration 0007)
duration        INTEGER                      -- Длительность видео в секундах
thumbnail_url   TEXT                         -- Превью изображение
views_count     INTEGER DEFAULT 0            -- Счётчик просмотров
category        TEXT DEFAULT 'general'       -- Категория записи
sort_order      INTEGER DEFAULT 0            -- Порядок сортировки
is_published    BOOLEAN DEFAULT true         -- Опубликована ли запись

created_at      TIMESTAMP NOT NULL
updated_at      TIMESTAMP NOT NULL
```

**Recording Categories:**
- `general` - Общие эфиры
- `meditation` - Медитации
- `practice` - Практики
- `qa` - Вопросы-ответы
- `workshop` - Мастер-классы
- `interview` - Интервью

**Indexes (6):**
- `stream_recordings_recorded_at_idx` - По дате проведения
- `stream_recordings_category_idx` - По категориям
- `stream_recordings_published_recorded_idx` - Опубликованные по дате
- `stream_recordings_sort_order_idx` - Сортировка
- `stream_recordings_views_idx` - Популярные (по просмотрам)

#### **stream_attendance** (0 bytes - пустая)
```sql
id              UUID PRIMARY KEY
stream_id       UUID NOT NULL -> stream_recordings(id)
user_id         UUID NOT NULL -> users(id)
joined_at       TIMESTAMP NOT NULL
watched_online  BOOLEAN NOT NULL DEFAULT false
energies_earned INTEGER NOT NULL DEFAULT 0

UNIQUE (stream_id, user_id)
```

**Indexes (3):**
- `stream_attendance_recording_user_idx` - UNIQUE по записи и пользователю
- `stream_attendance_user_id_idx` - По пользователю
- `stream_attendance_recording_id_idx` - По записи

---

### 🏆 Achievements System

#### **achievements** (8 KB)
```sql
id          UUID PRIMARY KEY
code        TEXT UNIQUE NOT NULL          -- Уникальный код (e.g., 'first_stream')
title       TEXT NOT NULL
description TEXT
icon        TEXT
xp_reward   INTEGER NOT NULL DEFAULT 0    -- Награда опытом
condition   JSONB DEFAULT '{}'            -- Условия получения
created_at  TIMESTAMP NOT NULL
```

#### **user_achievements** (0 bytes - пустая)
```sql
id             UUID PRIMARY KEY
user_id        UUID NOT NULL -> users(id)
achievement_id UUID NOT NULL -> achievements(id)
unlocked_at    TIMESTAMP NOT NULL

UNIQUE (user_id, achievement_id)
```

---

### 🎯 Practice System

#### **practice_content** (16 KB)
```sql
id              UUID PRIMARY KEY
content_item_id UUID NOT NULL -> content_items(id)
title           TEXT NOT NULL
description     TEXT
audio_url       TEXT
duration        INTEGER                    -- Длительность в секундах
is_premium      BOOLEAN NOT NULL DEFAULT false
sort_order      INTEGER NOT NULL DEFAULT 0
created_at      TIMESTAMP NOT NULL
updated_at      TIMESTAMP NOT NULL
```

---

### 📊 Analytics & Reports

#### **weekly_reports** (8 KB)
```sql
id         UUID PRIMARY KEY
user_id    UUID NOT NULL -> users(id)
week_start TIMESTAMP NOT NULL
week_end   TIMESTAMP NOT NULL
data       JSONB DEFAULT '{}'             -- Статистика недели
created_at TIMESTAMP NOT NULL
```

#### **xp_history** (8 KB)
```sql
id         UUID PRIMARY KEY
user_id    UUID NOT NULL -> users(id)
amount     INTEGER NOT NULL              -- Изменение XP
reason     TEXT NOT NULL                 -- Причина получения XP
metadata   JSONB DEFAULT '{}'
created_at TIMESTAMP NOT NULL
```

---

### 💬 Chat System

#### **chat_messages** (8 KB)
```sql
id            UUID PRIMARY KEY
user_id       UUID NOT NULL -> users(id)
chat_type     TEXT NOT NULL                -- team, global, city
chat_id       TEXT                         -- ID чата (для team/city)
message       TEXT NOT NULL
is_deleted    BOOLEAN NOT NULL DEFAULT false
created_at    TIMESTAMP NOT NULL
```

#### **city_chats_ik** (64 KB)
```sql
id      INTEGER PRIMARY KEY
city    TEXT NOT NULL
country TEXT
chat_id TEXT                              -- Telegram chat ID
```

**Note:** Используется для валидации городов в рейтингах (исключая Украину)

---

### 🔑 User Keys System

#### **user_keys** (0 bytes - пустая)
```sql
id           UUID PRIMARY KEY
user_id      UUID NOT NULL -> users(id)
key_number   INTEGER NOT NULL              -- Номер ключа (1-12)
unlocked_at  TIMESTAMP NOT NULL
energy_spent INTEGER NOT NULL DEFAULT 0    -- Потрачено энергий
created_at   TIMESTAMP NOT NULL

UNIQUE (user_id, key_number)
```

---

## 📈 Database Statistics

### Table Sizes
```
users               : 6.8 MB  (главная таблица)
city_chats_ik       : 64 KB   (валидация городов)
content_items       : 16 KB
content_sections    : 16 KB
videos              : 16 KB
video_timecodes     : 16 KB
practice_content    : 16 KB
Other tables        : 8 KB each (27 tables)
```

### Index Performance
```
Index hit rate  : 99.5%  ✅ Excellent
Table hit rate  : 92.2%  ✅ Good
Slow queries    : 0      ✅ Perfect
```

### Connection Pool
```
Max connections : 200
Active          : 1
Idle            : 0
Waiting         : 0
```

---

## 🎨 ENUM Types

```sql
-- User roles
user_role: 'user' | 'admin' | 'moderator'

-- Energy transactions
energy_transaction_type: 'income' | 'expense'

-- Shop
shop_category: 'boost' | 'upgrade' | 'cosmetic'
shop_item_type: 'experience_boost' | 'energy_pack' | 'avatar_frame' | 'special'

-- Content
content_type: 'article' | 'video' | 'practice'

-- Courses
course_category: 'mindset' | 'health' | 'relationships' | 'finance' | 'spirituality'

-- Streams
stream_status: 'scheduled' | 'live' | 'ended' | 'cancelled'
```

---

## 🔗 Foreign Key Relationships

### Users (центральная таблица)
- **users** ← chat_messages (user_id)
- **users** ← course_progress (user_id)
- **users** ← energy_transactions (user_id)
- **users** ← favorites (user_id)
- **users** ← meditation_history (user_id)
- **users** ← shop_purchases (user_id)
- **users** ← stream_attendance (user_id)
- **users** ← team_members (user_id)
- **users** ← user_achievements (user_id)
- **users** ← user_content_progress (user_id)
- **users** ← user_keys (user_id)
- **users** ← weekly_reports (user_id)
- **users** ← xp_history (user_id)

### Content Hierarchy
- **content_items** ← content_sections (content_item_id)
- **content_items** ← practice_content (content_item_id)
- **content_items** ← user_content_progress (content_item_id)
- **content_items** ← videos (content_item_id)
- **content_sections** ← videos (content_section_id)
- **videos** ← video_timecodes (video_id)
- **videos** ← user_content_progress (video_id)

### Courses Hierarchy
- **courses** ← course_days (course_id)
- **courses** ← course_progress (course_id)
- **courses** ← favorites (course_id)

### Teams
- **teams** ← team_members (team_id)

### Shop
- **shop_items** ← shop_purchases (item_id)

### Streams
- **live_streams** ← stream_attendance (stream_id)

### Meditations
- **meditations** ← meditation_history (meditation_id)

### Achievements
- **achievements** ← user_achievements (achievement_id)

---

## 🔍 Critical Indexes

### Global Performance (NEW - 33x faster)
- `users_is_pro_energies_idx` - Global leaderboard
- `users_city_is_pro_energies_idx` - City ratings
- `users_telegram_id_hash_idx` - Telegram lookup (50x faster)

### User Queries
- `users_level_experience_idx` - Level progression
- `users_subscription_expires_idx` - Subscription status
- `users_last_active_date_idx` - Activity tracking

### Energy System
- `energy_transactions_income_idx` - Income transactions (partial)
- `energy_transactions_expense_idx` - Expense transactions (partial)
- `energy_transactions_user_created_idx` - User history

### Content Progress
- `user_content_progress_completed_energies_idx` - Completed content
- `user_content_progress_user_watched_idx` - Unwatched content

### Shop
- `shop_purchases_unused_idx` - Unused purchases
- `shop_purchases_user_purchased_idx` - Purchase history

### Teams
- `team_members_team_user_idx` - UNIQUE constraint
- `team_members_user_id_role_idx` - User roles

---

## 💡 Recommendations for Editing

### Если хочешь добавить поля:

#### Users table
```sql
-- Пример добавления нового поля
ALTER TABLE users ADD COLUMN avatar_frame_id UUID;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN birth_date DATE;
```

#### Energy transactions
```sql
-- Добавить новые типы транзакций
ALTER TYPE energy_transaction_type ADD VALUE 'refund';
ALTER TYPE energy_transaction_type ADD VALUE 'bonus';
```

#### Shop items
```sql
-- Добавить новые категории магазина
ALTER TYPE shop_category ADD VALUE 'limited';
ALTER TYPE shop_category ADD VALUE 'event';
```

### Если хочешь изменить лимиты:

```sql
-- Увеличить max_members в командах
ALTER TABLE teams ALTER COLUMN max_members SET DEFAULT 20;

-- Изменить награду за стримы
ALTER TABLE live_streams ALTER COLUMN ep_reward SET DEFAULT 200;
```

---

## 🚨 Important Notes

1. **city field** - Новое поле, только что добавлено для рейтингов по городам
2. **energies** - Переименовано из energyPoints в migration 0003
3. **Autovacuum** - Настроен агрессивно для users, energy_transactions, user_content_progress
4. **Indexes** - 28+ индексов для 10K+ users performance
5. **JSONB fields** - settings, metadata, unlock_condition, item_data - для гибкости

---

**Last updated:** 2026-01-18
**PostgreSQL version:** 18.1
**Total tables:** 27
**Total indexes:** 80+
