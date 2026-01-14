# 🏗️ АРХИТЕКТУРА РАЗВЕРТЫВАНИЯ КЛУБА "КОД ДЕНЕГ 4.0"

**Дата:** 14 января 2026
**Статус:** Готов к разработке

---

## 🎯 СЕРВЕРНАЯ АРХИТЕКТУРА

### **Сервер 1: Приложение (2.58.98.41)**
```
Доступ: root / 6gNJOtZexhZG2nQwiamOYxUx

Компоненты:
  - Backend (Bun + Elysia.js)
  - Frontend (Next.js - Telegram Mini App)
  - Redis (кеш для быстрых запросов)
  - Nginx (reverse proxy)
```

### **Сервер 2: База данных (31.128.36.81)**
```
Доступ: root / U3S%fZ(D2cru

PostgreSQL 18.1 (Docker):
  - Порт: 5423 (открыт наружу)

Базы данных:
  ✅ club_hranitel (НОВАЯ) - все новые таблицы + мигрированные данные
  📦 postgres (СТАРАЯ) - читаем только для миграции
```

---

## 🔌 ПОДКЛЮЧЕНИЕ К БД

### **Connection String для приложения:**
```bash
DATABASE_URL=postgresql://postgres:U3S%fZ(D2cru@31.128.36.81:5423/club_hranitel
```

### **Тестирование подключения:**
```bash
# С сервера приложения (2.58.98.41):
docker run --rm postgres:18 psql \
  -h 31.128.36.81 \
  -p 5423 \
  -U postgres \
  -d club_hranitel \
  -c 'SELECT version();'
```

---

## 📊 СТРУКТУРА БД

### **ТЕКУЩИЕ ТАБЛИЦЫ (уже есть в schema.ts):**
- ✅ users
- ✅ courses
- ✅ course_days
- ✅ course_progress
- ✅ favorites
- ✅ meditations
- ✅ meditation_history
- ✅ achievements
- ✅ user_achievements
- ✅ xp_history
- ✅ chat_messages

### **НОВЫЕ ТАБЛИЦЫ (нужно добавить):**

#### 1. Energy Points (вместо XP)
```sql
-- Изменить users:
ALTER TABLE users ADD COLUMN energy_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN metadata JSONB DEFAULT '{}';

-- Создать новую таблицу:
CREATE TABLE ep_transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  amount INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'income' | 'expense'
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. Магазин
```sql
CREATE TABLE shop_items (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'elite' | 'secret' | 'savings'
  price INTEGER NOT NULL, -- в EP
  image_url TEXT,
  item_type TEXT NOT NULL, -- 'raffle_ticket' | 'lesson' | 'discount'
  item_data JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE shop_purchases (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  item_id UUID REFERENCES shop_items(id),
  price INTEGER NOT NULL,
  status TEXT DEFAULT 'completed', -- 'pending' | 'completed' | 'used'
  purchased_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP
);
```

#### 3. Десятки (Команды)
```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  metka TEXT, -- 'art', 'relationship', etc
  city_chat TEXT, -- ссылка на чат города
  member_count INTEGER DEFAULT 0,
  max_members INTEGER DEFAULT 12,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  role TEXT DEFAULT 'member', -- 'member' | 'leader'
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);
```

#### 4. Эфиры (Live Streams)
```sql
CREATE TABLE live_streams (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMP NOT NULL,
  stream_url TEXT,
  host TEXT, -- 'Кристина', 'Продюсер', etc
  status TEXT DEFAULT 'scheduled', -- 'scheduled' | 'live' | 'ended'
  ep_reward INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stream_attendance (
  id UUID PRIMARY KEY,
  stream_id UUID REFERENCES live_streams(id),
  user_id UUID REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  watched_online BOOLEAN DEFAULT false,
  ep_earned INTEGER DEFAULT 0,
  UNIQUE(stream_id, user_id)
);
```

#### 5. Недельные отчеты
```sql
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  week_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  submitted_at TIMESTAMP DEFAULT NOW(),
  deadline TIMESTAMP NOT NULL,
  ep_earned INTEGER DEFAULT 100
);
```

#### 6. 12 Ключей
```sql
-- Изменить courses:
ALTER TABLE courses ADD COLUMN key_number INTEGER; -- 1-12
ALTER TABLE courses ADD COLUMN month_theme TEXT;
ALTER TABLE courses ADD COLUMN unlock_condition JSONB DEFAULT '{}';

-- Создать таблицу прогресса:
CREATE TABLE user_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  key_number INTEGER NOT NULL,
  is_unlocked BOOLEAN DEFAULT false,
  unlocked_at TIMESTAMP,
  progress INTEGER DEFAULT 0, -- 0-100%
  completed_at TIMESTAMP,
  UNIQUE(user_id, key_number)
);
```

---

## 📋 ПЛАН ДЕЙСТВИЙ

### **Этап 1: Расширение схемы БД (1 день)**
1. Добавить новые таблицы в [backend/src/db/schema.ts](backend/src/db/schema.ts)
2. Применить миграции: `bun run db:push`
3. Добавить seed данных для магазина

### **Этап 2: Backend Services (2-3 дня)**
1. Energy Points сервис
2. Shop сервис
3. Teams сервис
4. Streams сервис
5. Reports сервис
6. Legacy sync сервис (для миграции)

### **Этап 3: Frontend (2-3 дня)**
1. Изменить навигацию (5 табов)
2. Новый экран "Магазин"
3. Новый экран "Чаты"
4. Переделать "Курсы" → "Путь" (12 Ключей)
5. Виджеты на главной (EP баланс, эфиры)

### **Этап 4: Миграция данных (1 день)**
1. Скрипт миграции пользователей (54K)
2. Скрипт миграции баллов (1.7M транзакций)
3. Скрипт распределения по Десяткам
4. Тестирование на копии БД

### **Этап 5: Deploy (1 день)**
1. Docker Compose на сервере 2.58.98.41
2. Настройка окружения
3. Тестирование всех компонентов
4. Запуск в продакшн

---

## ⏱️ ОЦЕНКА ВРЕМЕНИ

| Этап | Время | Статус |
|------|-------|--------|
| Расширение БД | 1 день | 🔄 В работе |
| Backend Services | 2-3 дня | ⏳ Ожидание |
| Frontend | 2-3 дня | ⏳ Ожидание |
| Миграция данных | 1 день | ⏳ Ожидание |
| Deploy | 1 день | ⏳ Ожидание |
| **ИТОГО** | **7-9 дней** | |

---

## 🔐 БЕЗОПАСНОСТЬ

### **Доступ к БД:**
- ✅ PostgreSQL работает на нестандартном порту 5423
- ✅ Firewall настроен (только нужные IP)
- ✅ Используется сложный пароль

### **Приложение:**
- Redis для кеширования
- Rate limiting на API
- JWT токены для авторизации
- HTTPS через Nginx

---

## 📞 КОНТАКТЫ СЕРВЕРОВ

### **Сервер приложения:**
```
IP: 2.58.98.41
User: root
Pass: 6gNJOtZexhZG2nQwiamOYxUx
SSH: ssh root@2.58.98.41
```

### **Сервер БД:**
```
IP: 31.128.36.81
User: root
Pass: U3S%fZ(D2cru
SSH: ssh root@31.128.36.81

PostgreSQL:
  Port: 5423
  User: postgres
  Pass: U3S%fZ(D2cru
  New DB: club_hranitel
  Old DB: postgres
```

---

## ✅ ЧЕКЛИСТ ГОТОВНОСТИ

- [x] БД club_hranitel создана
- [x] Доступ к БД настроен (порт 5423)
- [ ] Schema.ts расширена новыми таблицами
- [ ] Миграции применены
- [ ] Backend services созданы
- [ ] Frontend обновлен
- [ ] Docker Compose настроен на 2.58.98.41
- [ ] Миграция данных выполнена
- [ ] Тестирование пройдено
- [ ] Production deploy

---

**Документ создан:** 14 января 2026
**Автор:** Claude Code
