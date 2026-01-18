# 🔍 Анализ Архитектуры БД - Критические Проблемы

**Дата:** 2026-01-18
**База данных:** academy_miniapp (новая) + club_hranitel (старая)
**Статус:** 🔴 КРИТИЧЕСКИЕ ОШИБКИ ОБНАРУЖЕНЫ

---

## 📋 Краткое Резюме

**Проблема:** "В новой базе кроме чатов городов нет актуальной инфы"

**Корневая причина:** В новой БД отсутствует поле `city` в таблице `users`, но код пытается его использовать для рейтингов. Это приводит к ошибкам БД при каждом запросе рейтингов городов.

**Критичность:** 🔴 HIGH - Рейтинги городов полностью не работают

---

## 🔴 КРИТИЧЕСКАЯ ПРОБЛЕМА #1: Отсутствует поле `city`

### Файл: `backend/src/db/schema.ts` (строки 16-46)

**Текущая схема:**
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: text('telegram_id').unique().notNull(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  photoUrl: text('photo_url'),
  languageCode: text('language_code').default('ru'),

  // Gamification
  level: integer('level').default(1).notNull(),
  experience: integer('experience').default(0).notNull(),
  energies: integer('energies').default(0).notNull(),
  streak: integer('streak').default(0).notNull(),
  lastActiveDate: timestamp('last_active_date'),

  // Subscription
  isPro: boolean('is_pro').default(false).notNull(),
  subscriptionExpires: timestamp('subscription_expires'),

  // Settings
  role: userRoleEnum('role').default('user').notNull(),
  settings: jsonb('settings').default({}),
  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**ЧТО ОТСУТСТВУЕТ:**
```typescript
// ❌ НЕТ В SCHEMA!
city: text('city'),
team: text('team'),  // опционально, если команды работают через отдельную таблицу
```

**Последствия:**
- Рейтинги городов не работают
- API `/api/v1/ratings/cities` выбрасывает ошибку БД
- Frontend показывает пустой список городов
- Нет возможности фильтровать пользователей по городу

---

## 🔴 КРИТИЧЕСКАЯ ПРОБЛЕМА #2: Ratings Service использует несуществующее поле

### Файл: `backend/src/modules/ratings/service.ts` (строки 59-75)

**Проблемный код:**
```typescript
async getCityRatings(limit: number = 50): Promise<CityRating[]> {
  // ...
  const ratings = await db
    .select({
      city: users.city,  // ❌ ОШИБКА! users.city НЕ ОПРЕДЕЛЁН в schema.ts
      totalEnergies: sql<number>`SUM(${users.energies})`,
      userCount: sql<number>`COUNT(*)`,
    })
    .from(users)
    .where(
      and(
        eq(users.isPro, true),
        isNotNull(users.city),  // ❌ ОШИБКА!
        gt(users.energies, 0)
      )
    )
    .groupBy(users.city)  // ❌ ОШИБКА!
    .orderBy(sql`SUM(${users.energies}) DESC`)
    .limit(limit);
```

**Ошибка БД (ожидаемая):**
```
column users.city does not exist
```

**Почему это не было замечено ранее:**
- TypeScript НЕ выдаёт ошибку типов (drizzle инференс работает странно)
- Ошибка происходит только при runtime запросе к БД
- Возможно, endpoint `/api/v1/ratings/cities` не тестировался после миграции

---

## 🟡 СРЕДНЯЯ ПРОБЛЕМА #3: Teams Service использует старое имя поля

### Файл: `backend/src/modules/teams/service.ts` (строка 62)

**Проблемный код:**
```typescript
const members = await db
  .select({
    id: teamMembers.id,
    userId: teamMembers.userId,
    role: teamMembers.role,
    joinedAt: teamMembers.joinedAt,
    // Данные пользователя
    username: users.username,
    firstName: users.firstName,
    lastName: users.lastName,
    photoUrl: users.photoUrl,
    level: users.level,
    energyPoints: users.energyPoints,  // ❌ УСТАРЕВШЕЕ ИМЯ!
  })
```

**Проблема:**
- Поле `energy_points` было переименовано в `energies` миграцией `0003_rename_ep_to_energies.sql`
- В schema.ts оно называется `energies` (строка 28)
- Но код всё ещё использует старое имя `energyPoints`

**Ошибка БД (ожидаемая):**
```
column users.energy_points does not exist
```

**Исправление:**
```typescript
energies: users.energies,  // ✅ Правильное имя после миграции
```

---

## 📊 АРХИТЕКТУРА: Гибридный подход (2 базы данных)

### Текущая схема работы:

```
┌─────────────────────────────────────────────────────────────┐
│  СТАРАЯ БД: club_hranitel (31.128.36.81:5423)              │
├─────────────────────────────────────────────────────────────┤
│  ✅ city_chats_ik           (список городов с чатами)       │
│  ✅ private_club_users      (старые данные пользователей)   │
│  ⚠️  Используется только для:                               │
│     - Получение списка городов (city-chats module)         │
│     - Миграция данных (migration/migrate_users.py)         │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    (Читает список городов)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  НОВАЯ БД: academy_miniapp (localhost через Drizzle)       │
├─────────────────────────────────────────────────────────────┤
│  ✅ users                   (НО БЕЗ поля city!)             │
│  ✅ courses, meditations    (работают)                      │
│  ✅ chat_messages           (работают)                      │
│  ✅ teams, team_members     (работают, но см. Проблему #3)  │
│  ❌ ratings/cities          (НЕ РАБОТАЕТ - нет users.city)  │
│  ✅ energy_transactions     (работают)                      │
│  ✅ achievements            (работают)                      │
└─────────────────────────────────────────────────────────────┘
```

### Код в `backend/src/modules/city-chats/index.ts` (строки 8-15):

```typescript
// ⚠️ Прямое подключение к СТАРОЙ БД для city_chats_ik
const oldDbConnection = postgres({
  host: '31.128.36.81',
  port: 5423,
  database: 'club_hranitel',
  username: 'postgres',
  password: 'kH*kyrS&9z7K',  // 🔴 SECURITY: Пароль в коде!
  ssl: false,
});
```

**Проблемы:**
1. 🔴 **Безопасность:** Пароль БД хардкоднут в исходном коде
2. ⚠️ **Зависимость:** Приложение зависит от двух БД одновременно
3. ⚠️ **Синхронизация:** Нет механизма синхронизации данных между БД

---

## 🔄 МИГРАЦИЯ ДАННЫХ: Что было перенесено

### Файл: `migration/migrate_users.py` (строки 123-145)

**Что мигрируется:**
```python
INSERT INTO users (
    telegram_id,      # ✅
    username,         # ✅
    first_name,       # ✅
    last_name,        # ✅
    level,            # ✅
    experience,       # ✅
    streak,           # ✅
    energy_points,    # ✅ (позже переименовано в energies)
    is_pro,           # ✅
    subscription_expires,  # ✅
    role,             # ✅
    metadata,         # ✅ (metka хранится здесь)
    created_at,       # ✅
    updated_at        # ✅
)
```

**Что НЕ мигрируется:**
```python
# ❌ city - нет в новой schema
# ❌ team - команды переназначаются через distributeUsersToTeams()
# ❌ avatar - нет в старой БД (используется photoUrl из Telegram)
```

### Почему `city` не было перенесено:

1. В старой БД `private_club_users` могло быть поле `city` (нужно проверить)
2. Но в новой schema `users` это поле не определено
3. Скрипт миграции пытается вставить только те поля, которые есть в schema
4. Результат: данные о городе потеряны при миграции

---

## 📝 DRIZZLE МИГРАЦИИ: Хронология

### Миграция #0000 - Начальное создание БД
**Файл:** `backend/drizzle/0000_gray_aqueduct.sql`

- Создаёт таблицу `users` БЕЗ поля `city`
- Базовые поля: id, telegram_id, username, first_name, last_name, etc.

### Миграция #0001 - КОД ДЕНЕГ 4.0
**Файл:** `backend/drizzle/0001_keen_spectrum.sql`

- Добавляет `energy_points` (позже переименуется)
- Добавляет `metadata` JSONB для хранения metka
- Создаёт таблицы: teams, team_members, stream_attendance, chat_messages

### Миграция #0002 - Система контента
**Файл:** `backend/drizzle/0002_cloudy_ares.sql`

- Добавляет content_items, videos, practice_content
- Изменения в user_content_progress

### Миграция #0003 - Переименование EP → Energies
**Файл:** `backend/drizzle/0003_rename_ep_to_energies.sql`

```sql
ALTER TABLE "users" RENAME COLUMN "energy_points" TO "energies";
ALTER TABLE "ep_transactions" RENAME TO "energy_transactions";
ALTER TABLE "energy_transactions" RENAME COLUMN "ep_amount" TO "amount";
```

**ОТСУТСТВУЕТ:**
```sql
-- ❌ Эта миграция НЕ СОЗДАНА!
ALTER TABLE "users" ADD COLUMN "city" text;
CREATE INDEX "users_city_idx" ON "users" ("city");
```

---

## 🎯 ПОЧЕМУ "ТОЛЬКО ЧАТЫ РАБОТАЮТ"

### ✅ Чаты городов РАБОТАЮТ

**Почему:**
1. `city-chats` модуль читает `city_chats_ik` напрямую из старой БД
2. Таблица `chat_messages` хранится в новой БД и работает корректно
3. Список городов берётся из старой БД: `SELECT DISTINCT city FROM city_chats_ik`

### ❌ Рейтинги городов НЕ РАБОТАЮТ

**Почему:**
1. Ratings service пытается прочитать `users.city` из новой БД
2. Это поле не существует в schema → ошибка БД
3. API возвращает пустой массив или ошибку 500

### ⚠️ Команды ЧАСТИЧНО РАБОТАЮТ

**Почему:**
1. Таблицы `teams`, `team_members` существуют и заполнены
2. Но если код пытается вывести `energyPoints` → ошибка БД
3. Основной функционал команд работает (вступление, выход, список)

### ✅ Курсы, Медитации РАБОТАЮТ

**Почему:**
1. Отдельные таблицы с полным seed данных
2. Не зависят от `users.city` или переименованных полей

---

## 📋 ТАБЛИЦА ПРОБЛЕМ И ПРИОРИТЕТОВ

| # | Проблема | Файл | Строки | Критичность | Влияние | Статус |
|---|----------|------|--------|-------------|---------|--------|
| 1 | Отсутствует `city` в schema | `schema.ts` | 16-46 | 🔴 CRITICAL | Рейтинги не работают | ❌ |
| 2 | Ratings ссылается на `users.city` | `ratings/service.ts` | 61,69,73,176 | 🔴 CRITICAL | API ошибка | ❌ |
| 3 | Teams использует `energyPoints` | `teams/service.ts` | 62 | 🟡 MEDIUM | Возможная ошибка | ❌ |
| 4 | Нет миграции для добавления `city` | `drizzle/` | - | 🔴 CRITICAL | Нет данных | ❌ |
| 5 | Пароль БД в коде | `city-chats/index.ts` | 13 | 🔴 SECURITY | Уязвимость | 🔴 |
| 6 | Два подключения к БД | `city-chats/index.ts` | 8-15 | 🟡 MEDIUM | Сложность | ⚠️ |
| 7 | `city` не мигрирован | `migrate_users.py` | 123-145 | 🔴 CRITICAL | Потеря данных | ❌ |
| 8 | Нет seed для городов | `seed.ts` | - | 🟡 MEDIUM | Нет тестовых данных | ❌ |

---

## 🛠️ ПЛАН ИСПРАВЛЕНИЯ

### Фаза 1: КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ (приоритет 1)

#### 1.1 Добавить поле `city` в schema

**Файл:** `backend/src/db/schema.ts`

**Изменение:**
```typescript
export const users = pgTable('users', {
  // ... существующие поля ...

  // Subscription
  isPro: boolean('is_pro').default(false).notNull(),
  subscriptionExpires: timestamp('subscription_expires'),

  // ✅ НОВОЕ: География
  city: text('city'),  // Город пользователя
  country: text('country'),  // Страна (опционально)

  // Settings
  role: userRoleEnum('role').default('user').notNull(),
  // ...
}, (table) => [
  uniqueIndex('users_telegram_id_idx').on(table.telegramId),
  index('users_level_idx').on(table.level),
  index('users_city_idx').on(table.city),  // ✅ Индекс для быстрых запросов
]);
```

#### 1.2 Создать миграцию для добавления `city`

**Команда:**
```bash
cd backend
bun run db:generate  # Сгенерирует новую миграцию
```

**Ожидаемый файл:** `backend/drizzle/0004_add_city_to_users.sql`

**Содержимое:**
```sql
-- Migration: Add city field to users table
ALTER TABLE "users" ADD COLUMN "city" text;
ALTER TABLE "users" ADD COLUMN "country" text;

-- Create index for faster city-based queries
CREATE INDEX "users_city_idx" ON "users" ("city");

-- Комментарий
COMMENT ON COLUMN "users"."city" IS 'Город пользователя для рейтингов и чатов';
```

#### 1.3 Исправить Teams Service

**Файл:** `backend/src/modules/teams/service.ts` (строка 62)

**До:**
```typescript
energyPoints: users.energyPoints,  // ❌
```

**После:**
```typescript
energies: users.energies,  // ✅
```

#### 1.4 Вынести пароль БД в .env

**Файл:** `backend/src/modules/city-chats/index.ts`

**До:**
```typescript
const oldDbConnection = postgres({
  host: '31.128.36.81',
  port: 5423,
  database: 'club_hranitel',
  username: 'postgres',
  password: 'kH*kyrS&9z7K',  // 🔴 HARDCODED
  ssl: false,
});
```

**После:**
```typescript
const oldDbConnection = postgres({
  host: process.env.OLD_DB_HOST || '31.128.36.81',
  port: parseInt(process.env.OLD_DB_PORT || '5423'),
  database: process.env.OLD_DB_NAME || 'club_hranitel',
  username: process.env.OLD_DB_USER || 'postgres',
  password: process.env.OLD_DB_PASSWORD!,  // ✅ Из .env
  ssl: false,
});
```

**Файл:** `backend/.env`

```env
# Старая БД (для city-chats модуля)
OLD_DB_HOST=31.128.36.81
OLD_DB_PORT=5423
OLD_DB_NAME=club_hranitel
OLD_DB_USER=postgres
OLD_DB_PASSWORD=kH*kyrS&9z7K
```

### Фаза 2: МИГРАЦИЯ ДАННЫХ (приоритет 2)

#### 2.1 Обновить скрипт миграции

**Файл:** `migration/migrate_users.py`

**Добавить:** Проверку и миграцию поля `city`

```python
# Проверить есть ли city в старой БД
old_cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='private_club_users' AND column_name='city'")
has_city = old_cur.fetchone() is not None

if has_city:
    # Добавить city в INSERT
    new_cur.execute("""
        INSERT INTO users (
            telegram_id, username, first_name, last_name,
            level, experience, streak, energies,
            is_pro, subscription_expires, role, metadata,
            city,  # ✅ Добавлено
            created_at, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s,  # city
            %s, %s
        )
    """, (..., old_user['city'], ...))
```

#### 2.2 Создать скрипт для обновления существующих пользователей

**Новый файл:** `migration/update_cities.py`

```python
"""
Обновить города для пользователей, которые уже были мигрированы
"""
import psycopg2

old_db = psycopg2.connect(
    host='31.128.36.81',
    port=5423,
    database='club_hranitel',
    user='postgres',
    password='kH*kyrS&9z7K'
)

new_db = psycopg2.connect(
    host='localhost',
    port=5432,
    database='academy_miniapp',
    # ...
)

old_cur = old_db.cursor(cursor_factory=RealDictCursor)
new_cur = new_db.cursor()

# Получить города из старой БД
old_cur.execute("SELECT telegram_id, city FROM private_club_users WHERE city IS NOT NULL")

for row in old_cur.fetchall():
    # Обновить в новой БД
    new_cur.execute("""
        UPDATE users
        SET city = %s
        WHERE telegram_id = %s
    """, (row['city'], row['telegram_id']))

new_db.commit()
print(f"Updated {new_cur.rowcount} users with city data")
```

### Фаза 3: ОПТИМИЗАЦИЯ (приоритет 3)

#### 3.1 Мигрировать city_chats в новую БД

**Цель:** Избавиться от зависимости на старую БД

**Новая схема:**
```typescript
export const cityChatLinks = pgTable('city_chat_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  city: text('city').notNull(),
  country: text('country'),
  chatUrl: text('chat_url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('city_chat_links_city_idx').on(table.city),
]);
```

#### 3.2 Добавить seed данные

**Файл:** `backend/src/db/seed.ts`

```typescript
// Добавить seed для городов
const cities = [
  { city: 'Москва', country: 'Россия', chatUrl: 't.me/...' },
  { city: 'Санкт-Петербург', country: 'Россия', chatUrl: 't.me/...' },
  // ...
];

await db.insert(cityChatLinks).values(cities);
```

---

## 🧪 ТЕСТИРОВАНИЕ ПОСЛЕ ИСПРАВЛЕНИЯ

### Чек-лист:

- [ ] **Schema:** Поле `city` добавлено в `users` таблицу
- [ ] **Migration:** Миграция `0004_add_city_to_users.sql` выполнена успешно
- [ ] **Ratings API:** `GET /api/v1/ratings/cities` возвращает данные без ошибок
- [ ] **Teams API:** `GET /api/v1/teams/:id/members` показывает `energies` корректно
- [ ] **Frontend:** RatingsTab показывает рейтинг городов
- [ ] **Security:** Пароль БД в `.env`, не в коде
- [ ] **Migration Script:** Города пользователей обновлены из старой БД

### SQL запросы для проверки:

```sql
-- 1. Проверить что city добавлен
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'city';

-- 2. Проверить сколько пользователей с городом
SELECT COUNT(*) FROM users WHERE city IS NOT NULL;

-- 3. Проверить рейтинг городов
SELECT city, COUNT(*) as user_count, SUM(energies) as total_energies
FROM users
WHERE is_pro = true AND city IS NOT NULL AND energies > 0
GROUP BY city
ORDER BY total_energies DESC
LIMIT 10;

-- 4. Проверить индекс
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users' AND indexname LIKE '%city%';
```

---

## 📊 ИТОГОВАЯ ДИАГРАММА (ПОСЛЕ ИСПРАВЛЕНИЯ)

```
┌─────────────────────────────────────────────────────────────┐
│  СТАРАЯ БД: club_hranitel                                   │
│  ⚠️  Используется ТОЛЬКО для миграции данных               │
│  🗑️  После миграции может быть отключена                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
                (Одноразовая миграция городов)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  НОВАЯ БД: academy_miniapp                                  │
├─────────────────────────────────────────────────────────────┤
│  ✅ users (с полем city!)                                   │
│  ✅ city_chat_links (список городов и чатов)                │
│  ✅ ratings работают корректно                              │
│  ✅ teams показывают energies правильно                     │
│  ✅ Все данные в одной БД                                   │
│  ✅ Пароли в .env                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 РЕЗЮМЕ

### Что было обнаружено:

1. 🔴 **Критично:** Поле `city` отсутствует в schema → рейтинги не работают
2. 🔴 **Критично:** Ratings service ссылается на несуществующее поле
3. 🟡 **Средне:** Teams service использует старое имя поля `energyPoints`
4. 🔴 **Security:** Пароль БД в исходном коде
5. ⚠️ **Архитектура:** Зависимость от двух БД одновременно

### Что нужно сделать:

1. Добавить `city` в schema.ts
2. Создать и выполнить миграцию
3. Исправить teams/service.ts
4. Вынести пароли в .env
5. Обновить города из старой БД
6. Протестировать рейтинги

### Оценка времени:

- **Критичные исправления:** 2-3 часа
- **Миграция данных:** 1-2 часа
- **Тестирование:** 1 час
- **Итого:** 4-6 часов работы

---

**Автор:** Claude Sonnet 4.5
**Проект:** Club Webapp (Исходный Код)
**Дата:** 18 января 2026
