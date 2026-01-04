# 🚀 Quick Start Guide

Быстрый старт для Academy MiniApp 2.0

## ⚡ Деплой за 5 минут

### Шаг 1: Настройте GitHub Secrets (2 мин)

1. Откройте: https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/settings/secrets/actions
2. Добавьте 9 секретов из файла [GITHUB_SECRETS.md](GITHUB_SECRETS.md)

**Минимальный набор:**
```
SERVER_PASSWORD = 6gNJOtZexhZG2nQwiamOYxUx
DB_PASSWORD = <сгенерируйте: openssl rand -base64 24>
TELEGRAM_BOT_TOKEN = 5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM
TELEGRAM_BOT_USERNAME = AcademyMiniApp2Bot
TELEGRAM_WEBHOOK_SECRET = <сгенерируйте: openssl rand -base64 32>
JWT_SECRET = <сгенерируйте: openssl rand -base64 32>
OPENAI_API_KEY = sk-ваш-ключ
WEBAPP_URL = https://ваш-домен.com
API_URL = https://ваш-домен.com/api
```

### Шаг 2: Подготовьте сервер (2 мин)

```bash
# Подключитесь к серверу
ssh root@2.58.98.41
# Пароль: 6gNJOtZexhZG2nQwiamOYxUx

# Установите Docker (если не установлен)
curl -fsSL https://get.docker.com | sh

# Создайте директорию
mkdir -p /opt/academy-miniapp

# Готово!
exit
```

### Шаг 3: Запустите деплой (1 мин)

```bash
# На вашей машине
git add .
git commit -m "Deploy to production"
git push origin main

# Откройте: https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/actions
# Дождитесь зелёной галочки ✅
```

## 🎉 Готово!

Ваше приложение развернуто на сервере!

**Проверьте:**
- 🌐 WebApp: `https://ваш-домен.com`
- 🔌 API: `https://ваш-домен.com/api/health`
- 🤖 Telegram Bot: `@AcademyMiniApp2Bot`

---

## 🛠️ Локальная разработка

### Вариант 1: Docker (рекомендуется)

```bash
# Клонировать
git clone https://github.com/DaniilLepekhin/Academy_MiniApp_2.0.git
cd Academy_MiniApp_2.0

# Создать .env
cp .env.example .env
# Отредактируйте .env и добавьте ключи

# Запустить всё
docker compose up -d

# Миграции и seed
cd backend
bun install
bun run db:push
bun run db:seed

# Готово! Откройте http://localhost:3000
```

### Вариант 2: Без Docker

```bash
# Установить PostgreSQL и Redis
# macOS:
brew install postgresql@18 redis
brew services start postgresql@18
brew services start redis

# Ubuntu:
sudo apt install postgresql-18 redis-server

# Клонировать и настроить
git clone https://github.com/DaniilLepekhin/Academy_MiniApp_2.0.git
cd Academy_MiniApp_2.0

# Backend
cd backend
bun install
cp .env.example .env
# Отредактируйте .env
bun run db:push
bun run db:seed
bun run dev

# Webapp (в новом терминале)
cd ../webapp
npm install
npm run dev

# Откройте http://localhost:3000
```

---

## 🔑 Получение ключей

### OpenAI API Key
1. Откройте: https://platform.openai.com/api-keys
2. Нажмите **Create new secret key**
3. Скопируйте ключ (начинается с `sk-`)

### Telegram Bot Token
1. Откройте Telegram → [@BotFather](https://t.me/BotFather)
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте токен

**Или используйте существующий:**
- Token: `5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM`
- Username: `@AcademyMiniApp2Bot`

---

## 📊 Полезные команды

### Проверка статуса на сервере
```bash
ssh root@2.58.98.41
cd /opt/academy-miniapp
docker compose ps
```

### Просмотр логов
```bash
docker compose logs -f backend
docker compose logs -f webapp
```

### Перезапуск
```bash
docker compose restart
```

### Обновление
```bash
# Просто запушьте в main:
git push origin main
# GitHub Actions автоматически задеплоит
```

---

## 🆘 Проблемы?

### Деплой не работает
1. Проверьте GitHub Actions: https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/actions
2. Проверьте все 9 секретов добавлены
3. Проверьте логи на сервере: `ssh root@2.58.98.41` → `docker compose logs -f`

### База данных не работает
```bash
ssh root@2.58.98.41
cd /opt/academy-miniapp
docker compose restart postgres
docker compose exec backend bun run db:push
```

### Приложение не открывается
```bash
# Проверьте статус
docker compose ps

# Перезапустите
docker compose down
docker compose up -d
```

---

## 📚 Дополнительная документация

- [README.md](README.md) - Полная документация
- [SERVER_SETUP.md](SERVER_SETUP.md) - Настройка сервера
- [GITHUB_SECRETS.md](GITHUB_SECRETS.md) - Настройка секретов
- [.env.example](.env.example) - Пример переменных окружения

---

**Сервер:** root@2.58.98.41 (пароль: 6gNJOtZexhZG2nQwiamOYxUx)

**Bot:** @AcademyMiniApp2Bot (5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM)

**Репозиторий:** https://github.com/DaniilLepekhin/Academy_MiniApp_2.0
