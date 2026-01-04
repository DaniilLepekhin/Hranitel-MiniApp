# Academy MiniApp 2.0

Telegram Mini App для курсов, медитаций и AI помощника с геймификацией.

## 🚀 Технологии

### Backend
- **Runtime:** Bun 1.2+
- **Framework:** Elysia.js 1.4+
- **Database:** PostgreSQL 18 + Drizzle ORM
- **Cache:** Redis 7.4
- **Auth:** JWT + Telegram WebApp
- **AI:** OpenAI GPT-4 + Whisper
- **Bot:** Grammy (Telegram Bot API)

### Frontend
- **Framework:** Next.js 15.1 (App Router)
- **React:** 19.0
- **State:** Zustand + TanStack Query
- **Styling:** Tailwind CSS 4.0 (YourBest design)
- **Telegram:** @twa-dev/sdk 8.0
- **Animations:** Framer Motion 12.0

### Infrastructure
- **Containers:** Docker + Docker Compose
- **Reverse Proxy:** Nginx
- **CI/CD:** GitHub Actions
- **Server:** Ubuntu 22.04+ (2.58.98.41)

## 📦 Установка

### Локальная разработка

1. **Клонировать репозиторий:**
```bash
git clone https://github.com/DaniilLepekhin/Academy_MiniApp_2.0.git
cd Academy_MiniApp_2.0
```

2. **Создать .env файл:**
```bash
cp .env.example .env
# Отредактируйте .env и добавьте ваши ключи
```

3. **Запустить Docker:**
```bash
docker compose up -d
```

4. **Запустить миграции:**
```bash
cd backend
bun install
bun run db:push
```

5. **Загрузить начальные данные:**
```bash
bun run db:seed
```

6. **Установить зависимости webapp:**
```bash
cd ../webapp
npm install
```

7. **Запустить в dev режиме:**
```bash
# Terminal 1: Backend
cd backend
bun run dev

# Terminal 2: Frontend
cd webapp
npm run dev
```

Откройте http://localhost:3000

## 🔧 Переменные окружения

### Backend (.env)
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/academy_miniapp
REDIS_URL=redis://localhost:6379
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=YourBotUsername
TELEGRAM_WEBHOOK_SECRET=random_secret_string
JWT_SECRET=your_jwt_secret_min_32_chars
OPENAI_API_KEY=sk-your-openai-key
NODE_ENV=development
PORT=3001
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotUsername
```

## 🚢 Деплой на сервер

### Настройка GitHub Secrets

Перейдите в Settings → Secrets and variables → Actions и добавьте:

1. **SERVER_PASSWORD:** `6gNJOtZexhZG2nQwiamOYxUx`
2. **DB_PASSWORD:** Пароль для PostgreSQL
3. **TELEGRAM_BOT_TOKEN:** `5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM`
4. **TELEGRAM_BOT_USERNAME:** `AcademyMiniApp2Bot`
5. **TELEGRAM_WEBHOOK_SECRET:** Случайная строка
6. **JWT_SECRET:** Случайная строка (минимум 32 символа)
7. **OPENAI_API_KEY:** Ваш OpenAI API ключ
8. **WEBAPP_URL:** `https://yourdomain.com`
9. **API_URL:** `https://yourdomain.com/api`

### Автоматический деплой

При пуше в ветку `main` автоматически запускается:

1. ✅ Линтинг и проверка типов
2. 📦 Сборка проекта
3. 🐳 Создание Docker образов
4. 🚀 Деплой на сервер 2.58.98.41

### Ручной деплой

```bash
# На сервере
ssh root@2.58.98.41

# Создать директорию
mkdir -p /opt/academy-miniapp
cd /opt/academy-miniapp

# Скопировать файлы через scp
scp -r docker-compose.prod.yml root@2.58.98.41:/opt/academy-miniapp/docker-compose.yml
scp -r nginx root@2.58.98.41:/opt/academy-miniapp/

# Создать .env на сервере
nano .env
# Вставить production переменные

# Запустить
docker compose up -d

# Проверить логи
docker compose logs -f
```

## 📊 База данных

### Структура таблиц:

- **users** - пользователи Telegram
- **courses** - курсы
- **course_days** - уроки курсов
- **course_progress** - прогресс пользователей
- **favorites** - избранные курсы
- **meditations** - медитации
- **meditation_history** - история медитаций
- **achievements** - достижения
- **user_achievements** - разблокированные достижения
- **xp_history** - история опыта
- **chat_messages** - сообщения с AI

### Миграции:

```bash
# Создать миграцию
bun run db:generate

# Применить миграции
bun run db:push

# Drizzle Studio (GUI)
bun run db:studio
```

## 🎮 Геймификация

- **XP система:** За каждое действие начисляются очки опыта
- **Уровни:** 1-100 (каждый уровень требует больше XP)
- **Стрики:** Ежедневная активность увеличивает стрик
- **Достижения:** Разблокируются за выполнение задач

## 🤖 Telegram Bot

### Команды:

- `/start` - Приветствие и запуск WebApp
- `/app` - Открыть приложение
- `/today` - Урок на сегодня
- `/progress` - Ваш прогресс
- `/meditate` - Случайная медитация
- `/help` - Помощь

## 📱 Структура проекта

```
Academy_MiniApp_2.0/
├── backend/                # Bun + Elysia backend
│   ├── src/
│   │   ├── modules/       # Модули (auth, courses, meditations, etc.)
│   │   ├── db/            # Drizzle схемы и миграции
│   │   ├── middlewares/   # Middleware
│   │   ├── utils/         # Утилиты
│   │   └── config/        # Конфигурация
│   ├── Dockerfile
│   └── package.json
├── webapp/                 # Next.js 15 frontend
│   ├── src/
│   │   ├── app/           # App Router
│   │   ├── components/    # React компоненты
│   │   ├── hooks/         # Custom hooks
│   │   ├── lib/           # API клиент
│   │   └── store/         # Zustand store
│   ├── Dockerfile
│   └── package.json
├── nginx/                  # Nginx конфигурация
├── .github/workflows/      # CI/CD
├── docker-compose.yml      # Dev окружение
└── docker-compose.prod.yml # Production окружение
```

## 🔐 Безопасность

- JWT токены с httpOnly cookies
- Telegram initData валидация
- Rate limiting на API endpoints
- CORS защита
- SSL/TLS шифрование
- Секреты в GitHub Secrets

## 📈 Мониторинг

```bash
# Логи
docker compose logs -f backend
docker compose logs -f webapp

# Статус
docker compose ps

# Ресурсы
docker stats

# PostgreSQL
docker compose exec postgres psql -U postgres -d academy_miniapp

# Redis
docker compose exec redis redis-cli
```

## 🛠️ Полезные команды

```bash
# Перезапуск сервисов
docker compose restart backend webapp

# Обновить образы
docker compose pull
docker compose up -d

# Очистить всё
docker compose down -v
docker system prune -a

# Бэкап базы данных
docker compose exec postgres pg_dump -U postgres academy_miniapp > backup.sql

# Восстановление
cat backup.sql | docker compose exec -T postgres psql -U postgres academy_miniapp
```

## 📝 Лицензия

MIT

## 👨‍💻 Автор

Daniil Lepekhin

---

**Сервер:** root@2.58.98.41
**Telegram Bot Token:** `5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM`
