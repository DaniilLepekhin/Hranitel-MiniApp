# 🔧 Post-Deploy Setup

Инструкции по настройке после успешного деплоя.

## ✅ Проверка деплоя

Сначала убедитесь, что деплой прошёл успешно:

1. **GitHub Actions:** https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/actions
   - Все шаги должны быть ✅ зелёными

2. **Проверка на сервере:**
```bash
ssh root@2.58.98.41
cd /opt/academy-miniapp
docker compose ps
```

Все контейнеры должны быть в статусе **Up**:
- postgres
- redis
- backend
- webapp
- nginx

---

## 🌐 Настройка DNS (если ещё не сделано)

### Проверьте DNS запись:
```bash
ping mindandsoul_academy_webapp.daniillepekhin.com
```

Должен отвечать IP: **2.58.98.41**

### Если нет, добавьте A запись у вашего DNS провайдера:
```
Type: A
Name: mindandsoul_academy_webapp
Value: 2.58.98.41
TTL: 3600
```

Подождите 5-10 минут для распространения DNS.

---

## 🔐 Настройка SSL сертификата (Let's Encrypt)

### 1. Подключитесь к серверу:
```bash
ssh root@2.58.98.41
```

### 2. Остановите nginx:
```bash
cd /opt/academy-miniapp
docker compose stop nginx
```

### 3. Установите Certbot (если не установлен):
```bash
apt update
apt install certbot -y
```

### 4. Получите SSL сертификат:
```bash
certbot certonly --standalone \
  -d mindandsoul_academy_webapp.daniillepekhin.com \
  --non-interactive \
  --agree-tos \
  --email your@email.com
```

Замените `your@email.com` на ваш реальный email.

### 5. Проверьте сертификаты:
```bash
ls -la /etc/letsencrypt/live/mindandsoul_academy_webapp.daniillepekhin.com/
```

Должны быть файлы:
- `fullchain.pem`
- `privkey.pem`

### 6. Обновите nginx конфигурацию:
```bash
nano /opt/academy-miniapp/nginx/nginx.conf
```

Найдите строки:
```nginx
ssl_certificate /etc/nginx/ssl/fullchain.pem;
ssl_certificate_key /etc/nginx/ssl/privkey.pem;
```

Замените на:
```nginx
ssl_certificate /etc/letsencrypt/live/mindandsoul_academy_webapp.daniillepekhin.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/mindandsoul_academy_webapp.daniillepekhin.com/privkey.pem;
```

Сохраните: `Ctrl+X`, `Y`, `Enter`

### 7. Обновите docker-compose.prod.yml для монтирования сертификатов:
```bash
nano /opt/academy-miniapp/docker-compose.yml
```

Найдите секцию nginx volumes и добавьте:
```yaml
volumes:
  - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 8. Запустите nginx:
```bash
docker compose up -d nginx
```

### 9. Проверьте HTTPS:
```bash
curl -I https://mindandsoul_academy_webapp.daniillepekhin.com
```

Должно вернуть `200 OK` и `Strict-Transport-Security` header.

### 10. Настройте автообновление сертификата:
```bash
crontab -e
```

Добавьте:
```
0 3 * * * certbot renew --quiet && docker compose -f /opt/academy-miniapp/docker-compose.yml restart nginx
```

---

## 🤖 Настройка Telegram Webhook

### 1. Установите webhook:
```bash
curl -X POST "https://api.telegram.org/bot5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://mindandsoul_academy_webapp.daniillepekhin.com/api/bot/webhook",
    "secret_token": "IQ2gSSoTkk5XepAEl9kRq4dVFC0SsKgNBfGr/jUrEnI=",
    "allowed_updates": ["message", "callback_query", "inline_query"],
    "drop_pending_updates": true
  }'
```

### 2. Проверьте webhook:
```bash
curl "https://api.telegram.org/bot5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM/getWebhookInfo"
```

Ответ должен содержать:
```json
{
  "ok": true,
  "result": {
    "url": "https://mindandsoul_academy_webapp.daniillepekhin.com/api/bot/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "max_connections": 40
  }
}
```

### 3. Протестируйте бота:
1. Откройте Telegram: https://t.me/AcademyMiniApp2Bot
2. Отправьте `/start`
3. Бот должен ответить и показать кнопку "Открыть приложение"

---

## 🌐 Настройка Telegram WebApp Domain

### 1. Откройте BotFather:
https://t.me/BotFather

### 2. Отправьте команду:
```
/mybots
```

### 3. Выберите: `@AcademyMiniApp2Bot`

### 4. Выберите: `Bot Settings` → `Menu Button` → `Configure menu button`

### 5. Отправьте URL:
```
https://mindandsoul_academy_webapp.daniillepekhin.com
```

### 6. Проверьте в Telegram:
Откройте бота и нажмите кнопку Menu (≡) - должен открыться WebApp

---

## ✅ Финальные проверки

### 1. WebApp:
```bash
curl -I https://mindandsoul_academy_webapp.daniillepekhin.com
```
✅ 200 OK

### 2. API:
```bash
curl https://mindandsoul_academy_webapp.daniillepekhin.com/api/health
```
✅ "healthy"

### 3. Swagger:
Откройте: https://mindandsoul_academy_webapp.daniillepekhin.com/api/docs
✅ Swagger UI загружается

### 4. Telegram Bot:
- Отправьте `/start` → получите приветствие
- Нажмите "Открыть приложение" → WebApp открывается
- Нажмите Menu (≡) → WebApp открывается

### 5. WebApp функции:
- ✅ Авторизация через Telegram работает
- ✅ Загружаются курсы
- ✅ Загружаются медитации
- ✅ AI чат работает (если добавлен OPENAI_API_KEY)
- ✅ Профиль показывает статистику

---

## 📊 Мониторинг

### Логи в реальном времени:
```bash
ssh root@2.58.98.41
cd /opt/academy-miniapp

# Все логи
docker compose logs -f

# Только backend
docker compose logs -f backend

# Только webapp
docker compose logs -f webapp

# Только ошибки
docker compose logs -f | grep -i error
```

### Статус сервисов:
```bash
docker compose ps
docker stats
```

### База данных:
```bash
# Подключиться
docker compose exec postgres psql -U postgres -d academy_miniapp

# Проверить пользователей
SELECT COUNT(*) FROM users;

# Проверить курсы
SELECT id, title FROM courses;

# Выйти
\q
```

---

## 🔄 Обновление приложения

### Автоматическое (через GitHub):
```bash
git add .
git commit -m "Update application"
git push origin main
```

GitHub Actions автоматически задеплоит обновление.

### Ручное на сервере:
```bash
ssh root@2.58.98.41
cd /opt/academy-miniapp

docker compose pull
docker compose up -d --force-recreate
docker compose exec backend bun run db:push
```

---

## 🆘 Troubleshooting

### WebApp не открывается:
```bash
# Проверить nginx
docker compose logs nginx

# Перезапустить
docker compose restart nginx webapp
```

### Бот не отвечает:
```bash
# Проверить webhook
curl "https://api.telegram.org/bot5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM/getWebhookInfo"

# Проверить логи
docker compose logs backend | grep bot

# Переустановить webhook
curl -X POST "https://api.telegram.org/bot5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mindandsoul_academy_webapp.daniillepekhin.com/api/bot/webhook"}'
```

### SSL не работает:
```bash
# Проверить сертификат
certbot certificates

# Обновить сертификат
certbot renew --force-renewal

# Перезапустить nginx
docker compose restart nginx
```

---

## 🎉 Готово!

Ваше приложение полностью настроено и работает на:

**🌐 WebApp:** https://mindandsoul_academy_webapp.daniillepekhin.com

**🔌 API:** https://mindandsoul_academy_webapp.daniillepekhin.com/api

**🤖 Bot:** https://t.me/AcademyMiniApp2Bot

---

**Сервер:** root@2.58.98.41 (пароль: 6gNJOtZexhZG2nQwiamOYxUx)
