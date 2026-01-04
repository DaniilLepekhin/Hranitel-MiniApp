# Server Setup Guide

Инструкция по настройке сервера **2.58.98.41** для Academy MiniApp 2.0.

## 📋 Требования

- Ubuntu 22.04+ (или Debian 11+)
- Docker 24.0+
- Docker Compose v2.20+
- 2GB RAM минимум (4GB рекомендуется)
- 20GB свободного места

## 🔧 Первоначальная настройка сервера

### 1. Подключение к серверу

```bash
ssh root@2.58.98.41
# Пароль: 6gNJOtZexhZG2nQwiamOYxUx
```

### 2. Обновление системы

```bash
apt update && apt upgrade -y
```

### 3. Установка Docker

```bash
# Удалить старые версии (если есть)
apt remove docker docker-engine docker.io containerd runc

# Установить зависимости
apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Добавить официальный GPG ключ Docker
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Добавить репозиторий Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установить Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Проверить установку
docker --version
docker compose version
```

### 4. Настройка Docker

```bash
# Включить автозапуск
systemctl enable docker
systemctl start docker

# Проверить статус
systemctl status docker
```

### 5. Установка дополнительных инструментов

```bash
# Git (для клонирования репозитория)
apt install -y git

# Certbot (для SSL сертификатов)
apt install -y certbot

# Htop (мониторинг)
apt install -y htop

# Vim (редактор)
apt install -y vim
```

### 6. Настройка Firewall

```bash
# Разрешить SSH
ufw allow 22/tcp

# Разрешить HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Включить firewall
ufw --force enable

# Проверить статус
ufw status
```

### 7. Создание директории для проекта

```bash
mkdir -p /opt/academy-miniapp
cd /opt/academy-miniapp
```

## 🚀 Первый деплой

### Вариант 1: Через GitHub Actions (рекомендуется)

1. Настройте GitHub Secrets (см. README.md)
2. Сделайте push в ветку `main`
3. GitHub Actions автоматически задеплоит на сервер

### Вариант 2: Ручной деплой

```bash
# На локальной машине
cd "Academy MiniApp 2.0"

# Запустить скрипт деплоя
./deploy.sh
```

### Вариант 3: Прямо на сервере

```bash
# На сервере
cd /opt/academy-miniapp

# Клонировать репозиторий
git clone https://github.com/DaniilLepekhin/Academy_MiniApp_2.0.git .

# Создать .env файл
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@postgres:5432/academy_miniapp
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YOUR_DB_PASSWORD
POSTGRES_DB=academy_miniapp
REDIS_URL=redis://redis:6379
TELEGRAM_BOT_TOKEN=5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM
TELEGRAM_BOT_USERNAME=AcademyMiniApp2Bot
TELEGRAM_WEBHOOK_SECRET=your_random_webhook_secret_here
JWT_SECRET=your_super_secret_jwt_key_min_32_characters
OPENAI_API_KEY=your_openai_api_key_here
NODE_ENV=production
PORT=3001
WEBAPP_URL=https://yourdomain.com
API_URL=https://yourdomain.com/api
CORS_ORIGIN=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=AcademyMiniApp2Bot
EOF

# Запустить
docker compose -f docker-compose.prod.yml up -d

# Применить миграции
docker compose exec backend bun run db:push

# Загрузить начальные данные
docker compose exec backend bun run db:seed
```

## 🔐 SSL сертификаты (Let's Encrypt)

### Для доменного имени:

```bash
# Остановить nginx в Docker
docker compose stop nginx

# Получить сертификат
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Сертификаты будут в:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem

# Обновить nginx.conf, указав пути к сертификатам
vim /opt/academy-miniapp/nginx/nginx.conf

# Запустить nginx
docker compose start nginx

# Автообновление сертификатов
crontab -e
# Добавить:
# 0 3 * * * certbot renew --quiet && docker compose -f /opt/academy-miniapp/docker-compose.yml restart nginx
```

## 📊 Мониторинг

### Просмотр логов

```bash
cd /opt/academy-miniapp

# Все логи
docker compose logs -f

# Логи backend
docker compose logs -f backend

# Логи webapp
docker compose logs -f webapp

# Логи базы данных
docker compose logs -f postgres
```

### Статус сервисов

```bash
# Список контейнеров
docker compose ps

# Использование ресурсов
docker stats

# Системные ресурсы
htop
```

### Проверка базы данных

```bash
# Подключиться к PostgreSQL
docker compose exec postgres psql -U postgres -d academy_miniapp

# Проверить таблицы
\dt

# Проверить количество пользователей
SELECT COUNT(*) FROM users;

# Выйти
\q
```

## 🔄 Обновление приложения

### Автоматическое (GitHub Actions)

```bash
# Просто сделайте push в main
git push origin main
```

### Ручное

```bash
cd /opt/academy-miniapp

# Получить изменения
git pull

# Пересобрать и перезапустить
docker compose pull
docker compose up -d --force-recreate

# Применить миграции
docker compose exec backend bun run db:push
```

## 🛠️ Troubleshooting

### Контейнеры не запускаются

```bash
# Проверить логи
docker compose logs

# Пересоздать контейнеры
docker compose down
docker compose up -d
```

### Ошибка подключения к базе данных

```bash
# Проверить, запущен ли PostgreSQL
docker compose ps postgres

# Перезапустить
docker compose restart postgres

# Проверить переменные окружения
docker compose exec backend env | grep DATABASE_URL
```

### Очистка места на диске

```bash
# Удалить неиспользуемые образы и контейнеры
docker system prune -a

# Удалить неиспользуемые volumes
docker volume prune
```

### Сбросить базу данных

```bash
# ВНИМАНИЕ: Это удалит все данные!
docker compose down -v
docker compose up -d
docker compose exec backend bun run db:push
docker compose exec backend bun run db:seed
```

## 📈 Оптимизация

### Настройка Swap (если мало RAM)

```bash
# Создать swap файл 2GB
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Добавить в fstab для автозагрузки
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Проверить
free -h
```

### Автоматическая очистка

```bash
# Создать cron задачу
crontab -e

# Добавить (очистка каждую неделю в 3:00)
0 3 * * 0 docker system prune -f
```

## 🔒 Безопасность

### Изменить SSH порт

```bash
# Редактировать конфиг SSH
vim /etc/ssh/sshd_config

# Изменить Port 22 на другой (например, 2222)
# Сохранить и перезапустить
systemctl restart sshd

# Не забыть открыть новый порт в firewall!
ufw allow 2222/tcp
```

### Отключить root вход по паролю (рекомендуется)

```bash
# Сначала настройте SSH ключи!
# Затем в /etc/ssh/sshd_config:
# PermitRootLogin prohibit-password
# PasswordAuthentication no

systemctl restart sshd
```

## 📞 Поддержка

При проблемах проверьте:

1. Логи контейнеров: `docker compose logs -f`
2. Статус сервисов: `docker compose ps`
3. Системные ресурсы: `htop`
4. Свободное место: `df -h`

---

**Сервер:** 2.58.98.41
**Пароль:** 6gNJOtZexhZG2nQwiamOYxUx
