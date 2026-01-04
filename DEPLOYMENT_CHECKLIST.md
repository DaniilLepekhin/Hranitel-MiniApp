# ✅ Deployment Checklist

Полный чек-лист для деплоя Academy MiniApp 2.0 на production.

## 📋 Pre-Deployment (перед деплоем)

### 1. GitHub Repository
- [ ] Репозиторий создан: `https://github.com/DaniilLepekhin/Academy_MiniApp_2.0`
- [ ] Весь код закоммичен и запушен
- [ ] `.gitignore` настроен (не коммитим `.env`, `node_modules`)
- [ ] `main` ветка защищена (опционально)

### 2. Secrets Generation
Сгенерируйте секреты локально:

```bash
# DB_PASSWORD
openssl rand -base64 24

# TELEGRAM_WEBHOOK_SECRET
openssl rand -base64 32

# JWT_SECRET
openssl rand -base64 32
```

**Сохраните их в безопасном месте!** (password manager)

### 3. GitHub Secrets
Перейдите: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

Добавьте все 9 секретов:

- [ ] `SERVER_PASSWORD` = `6gNJOtZexhZG2nQwiamOYxUx`
- [ ] `DB_PASSWORD` = `<ваш сгенерированный пароль>`
- [ ] `TELEGRAM_BOT_TOKEN` = `5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM`
- [ ] `TELEGRAM_BOT_USERNAME` = `AcademyMiniApp2Bot`
- [ ] `TELEGRAM_WEBHOOK_SECRET` = `<ваш сгенерированный секрет>`
- [ ] `JWT_SECRET` = `<ваш сгенерированный секрет>`
- [ ] `OPENAI_API_KEY` = `sk-...` (получить на platform.openai.com)
- [ ] `WEBAPP_URL` = `https://yourdomain.com`
- [ ] `API_URL` = `https://yourdomain.com/api`

### 4. OpenAI API Key
- [ ] Аккаунт создан на https://platform.openai.com
- [ ] Добавлены средства (минимум $5)
- [ ] API ключ создан и добавлен в секреты
- [ ] Проверен лимит запросов (Rate Limits)

### 5. Telegram Bot
- [ ] Бот создан через @BotFather (или используем существующий)
- [ ] Token сохранён: `5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM`
- [ ] Username: `@AcademyMiniApp2Bot`
- [ ] Domain добавлен в Bot Settings → Web App Domain

### 6. Domain Setup
- [ ] Домен зарегистрирован (или используем IP)
- [ ] DNS A запись указывает на `2.58.98.41`
- [ ] Проверка: `ping yourdomain.com` → `2.58.98.41`

## 🖥️ Server Setup

### 1. Подключение к серверу
```bash
ssh root@2.58.98.41
# Пароль: 6gNJOtZexhZG2nQwiamOYxUx
```

- [ ] Успешное подключение

### 2. Установка Docker
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
docker --version
docker compose version
```

- [ ] Docker установлен
- [ ] Docker Compose v2 установлен
- [ ] Версии отображаются корректно

### 3. Firewall
```bash
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable
ufw status
```

- [ ] Firewall настроен
- [ ] Порты открыты

### 4. Создание директории
```bash
mkdir -p /opt/academy-miniapp
cd /opt/academy-miniapp
```

- [ ] Директория создана

### 5. Проверка свободного места
```bash
df -h
```

- [ ] Минимум 20GB свободно
- [ ] Минимум 2GB RAM (`free -h`)

## 🚀 Deployment

### Вариант A: Автоматический деплой (рекомендуется)

1. **Запустить деплой:**
```bash
# На локальной машине
git add .
git commit -m "Deploy to production"
git push origin main
```

- [ ] Код запушен в `main`

2. **Проверить GitHub Actions:**
- [ ] Открыть: https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/actions
- [ ] Workflow запустился
- [ ] Шаг "Lint & Type Check" ✅
- [ ] Шаг "Build" ✅
- [ ] Шаг "Build Docker Images" ✅
- [ ] Шаг "Deploy to Production" ✅

3. **Проверить на сервере:**
```bash
ssh root@2.58.98.41
cd /opt/academy-miniapp
docker compose ps
```

- [ ] Все контейнеры в статусе "Up"
- [ ] Порты 3000, 3001 прослушиваются

### Вариант B: Ручной деплой

```bash
# На локальной машине
cd "Academy MiniApp 2.0"
./deploy.sh
```

- [ ] Скрипт выполнен без ошибок
- [ ] Деплой завершён успешно

## ✅ Post-Deployment Verification

### 1. Проверка контейнеров
```bash
ssh root@2.58.98.41
cd /opt/academy-miniapp
docker compose ps
```

Должны работать:
- [ ] `postgres` - Up
- [ ] `redis` - Up
- [ ] `backend` - Up (healthy)
- [ ] `webapp` - Up (healthy)
- [ ] `nginx` - Up

### 2. Проверка логов
```bash
# Проверить на ошибки
docker compose logs backend | grep -i error
docker compose logs webapp | grep -i error
```

- [ ] Нет критических ошибок
- [ ] Backend запущен на порту 3001
- [ ] Webapp запущен на порту 3000

### 3. Проверка базы данных
```bash
docker compose exec postgres psql -U postgres -d academy_miniapp -c "\dt"
```

- [ ] 11 таблиц созданы
- [ ] Таблицы: users, courses, course_days, meditations, achievements, и т.д.

```bash
# Проверить seed данные
docker compose exec postgres psql -U postgres -d academy_miniapp -c "SELECT COUNT(*) FROM courses;"
docker compose exec postgres psql -U postgres -d academy_miniapp -c "SELECT COUNT(*) FROM meditations;"
docker compose exec postgres psql -U postgres -d academy_miniapp -c "SELECT COUNT(*) FROM achievements;"
```

- [ ] Минимум 6 курсов
- [ ] Минимум 5 медитаций
- [ ] Минимум 8 достижений

### 4. Проверка Redis
```bash
docker compose exec redis redis-cli ping
```

- [ ] Ответ: `PONG`

### 5. Health Checks
```bash
# На сервере или локально
curl http://2.58.98.41/health
curl http://2.58.98.41/api/health
```

- [ ] HTTP 200 OK
- [ ] Ответ: "healthy"

### 6. Проверка API
```bash
# Swagger документация
curl http://2.58.98.41/api/docs
```

- [ ] Swagger UI доступен
- [ ] Все endpoints отображаются

### 7. Проверка WebApp
```bash
# В браузере
open http://2.58.98.41
# или
open https://yourdomain.com
```

- [ ] Страница загружается
- [ ] Нет ошибок в консоли браузера
- [ ] Telegram SDK инициализирован
- [ ] Навигация работает

### 8. Telegram Bot
```bash
# В Telegram
/start @AcademyMiniApp2Bot
```

- [ ] Бот отвечает
- [ ] Кнопка "Открыть приложение" работает
- [ ] WebApp открывается

### 9. Webhook
```bash
# Установить webhook
curl -X POST "https://api.telegram.org/bot5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://yourdomain.com/api/bot/webhook", "secret_token": "ВАШ_WEBHOOK_SECRET"}'

# Проверить webhook
curl "https://api.telegram.org/bot5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM/getWebhookInfo"
```

- [ ] Webhook установлен
- [ ] URL корректный
- [ ] Последняя ошибка = null

## 🔐 SSL/TLS (опционально, но рекомендуется)

### 1. Остановить nginx
```bash
docker compose stop nginx
```

### 2. Получить сертификат
```bash
apt install certbot
certbot certonly --standalone -d yourdomain.com
```

- [ ] Сертификат получен
- [ ] Файлы в `/etc/letsencrypt/live/yourdomain.com/`

### 3. Обновить nginx.conf
```bash
vim /opt/academy-miniapp/nginx/nginx.conf
# Указать пути к сертификатам
```

- [ ] Пути к сертификатам обновлены

### 4. Запустить nginx
```bash
docker compose start nginx
```

- [ ] HTTPS работает
- [ ] Редирект с HTTP на HTTPS

### 5. Автообновление
```bash
crontab -e
# Добавить:
# 0 3 * * * certbot renew --quiet && docker compose -f /opt/academy-miniapp/docker-compose.yml restart nginx
```

- [ ] Cron задача добавлена

## 📊 Monitoring Setup (опционально)

### 1. Логирование
```bash
# Настроить ротацию логов Docker
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

systemctl restart docker
```

- [ ] Ротация логов настроена

### 2. Мониторинг ресурсов
```bash
# Установить htop
apt install htop

# Установить docker stats
# (уже включено в Docker)
```

- [ ] htop установлен
- [ ] `docker stats` работает

### 3. Алерты (опционально)
- [ ] Настроить Sentry для ошибок
- [ ] Настроить UptimeRobot для мониторинга
- [ ] Настроить Slack/Telegram уведомления

## 🎉 Final Checks

### Функциональное тестирование:

1. **Регистрация:**
- [ ] Открыть бота в Telegram
- [ ] Нажать /start
- [ ] Открыть WebApp
- [ ] Пользователь создаётся в БД

2. **Курсы:**
- [ ] Список курсов загружается
- [ ] Поиск работает
- [ ] Категории фильтруют
- [ ] Можно открыть курс
- [ ] Можно добавить в избранное

3. **Медитации:**
- [ ] Список медитаций загружается
- [ ] Можно запустить медитацию
- [ ] Аудио плеер работает
- [ ] Прогресс сохраняется

4. **Чат с AI:**
- [ ] Можно отправить сообщение
- [ ] AI отвечает (стриминг)
- [ ] История сохраняется
- [ ] Голосовой ввод работает (опционально)

5. **Профиль:**
- [ ] Статистика отображается
- [ ] XP начисляется
- [ ] Уровень обновляется
- [ ] Достижения разблокируются
- [ ] Таблица лидеров работает

6. **Геймификация:**
- [ ] За урок начисляется 50 XP
- [ ] За медитацию начисляется 30 XP
- [ ] Стрик увеличивается при ежедневной активности
- [ ] Достижения разблокируются

### Performance:

- [ ] Страницы загружаются < 3 сек
- [ ] API отвечает < 500ms
- [ ] WebApp плавно работает
- [ ] Нет утечек памяти

### Security:

- [ ] HTTPS включен (если есть домен)
- [ ] JWT токены в httpOnly cookies
- [ ] Rate limiting работает
- [ ] CORS настроен правильно
- [ ] Секреты не в коде

## 📝 Post-Launch Tasks

### Сразу после запуска:
- [ ] Создать backup базы данных
- [ ] Протестировать восстановление из backup
- [ ] Документировать процесс обновления
- [ ] Создать runbook для типовых проблем

### В течение недели:
- [ ] Мониторить логи на ошибки
- [ ] Проверить использование ресурсов
- [ ] Собрать обратную связь от пользователей
- [ ] Оптимизировать медленные запросы

### Долгосрочно:
- [ ] Настроить регулярные бэкапы (cron)
- [ ] Настроить мониторинг (Grafana/Prometheus)
- [ ] Добавить аналитику (Mixpanel/Amplitude)
- [ ] Настроить error tracking (Sentry)

---

## 🆘 Troubleshooting

### Если что-то пошло не так:

1. **Проверить логи:**
```bash
docker compose logs -f
```

2. **Перезапустить:**
```bash
docker compose restart
```

3. **Пересоздать:**
```bash
docker compose down
docker compose up -d
```

4. **Проверить переменные:**
```bash
docker compose exec backend env
```

5. **Связаться:**
- GitHub Issues: https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/issues
- Email: your@email.com

---

**Успешного деплоя! 🚀**
