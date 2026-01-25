# Admin API - Клуб Хранитель

Административный API для управления пользователями, подписками и платежами.

## Авторизация

Все запросы требуют заголовок `x-admin-secret` с секретным ключом.

```bash
curl -H "x-admin-secret: YOUR_SECRET" ...
```

Секрет задается в `.env`:
```
ADMIN_SECRET=your-secure-secret-here
```

---

## Endpoints

### 1. Генерация ссылки на оплату

Создает `payment_attempt` в базе и возвращает ссылку на виджет Lava с предзаполненными данными.

```http
POST /api/admin/generate-payment-link
```

**Тело запроса:**
```json
{
  "telegram_id": 123456789,
  "email": "user@example.com",
  "name": "Иван Петров",
  "phone": "+79001234567",
  "currency": "RUB",
  "amount": "2000"
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| telegram_id | number | ✅ | Telegram ID пользователя |
| email | string | ✅ | Email (обязателен для Lava) |
| name | string | ❌ | Имя пользователя |
| phone | string | ❌ | Телефон |
| currency | string | ❌ | Валюта: RUB, USD, EUR. По умолчанию RUB |
| amount | string | ❌ | Сумма. По умолчанию 2000 |

**Ответ:**
```json
{
  "success": true,
  "payment_url": "https://link.lava.ru/qEPKZ?email=user@example.com&name=...",
  "message": "Ссылка создана для user@example.com. После оплаты подписка активируется автоматически.",
  "data": {
    "telegram_id": 123456789,
    "email": "user@example.com",
    "name": "Иван Петров",
    "phone": "+79001234567",
    "amount": "2000",
    "currency": "RUB"
  }
}
```

**Пример:**
```bash
curl -X POST https://hranitel.daniillepekhin.com/api/admin/generate-payment-link \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_SECRET" \
  -d '{
    "telegram_id": 123456789,
    "email": "user@example.com",
    "name": "Иван Петров",
    "phone": "+79001234567"
  }'
```

---

### 2. Сброс воронки пользователя

Удаляет прогресс воронки, чтобы пользователь прошел её заново.

```http
POST /api/admin/reset-user-funnel
```

**Тело запроса:**
```json
{
  "telegram_id": 123456789
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Воронка сброшена для пользователя 123456789. Удалено записей: 1",
  "user": {
    "id": "uuid",
    "telegram_id": 123456789,
    "is_pro": true,
    "subscription_expires": "2026-02-25T00:00:00.000Z"
  }
}
```

**Пример:**
```bash
curl -X POST https://hranitel.daniillepekhin.com/api/admin/reset-user-funnel \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_SECRET" \
  -d '{"telegram_id": 123456789}'
```

---

### 3. Отзыв подписки

Устанавливает дату окончания подписки в прошлое. Пользователь будет удален из всех каналов и чатов.

```http
POST /api/admin/revoke-subscription
```

**Тело запроса:**
```json
{
  "telegram_id": 123456789,
  "kick_immediately": true
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| telegram_id | number | ✅ | Telegram ID пользователя |
| kick_immediately | boolean | ❌ | Удалить из каналов сразу. По умолчанию false (удалится в 6:00 МСК) |

**Ответ:**
```json
{
  "success": true,
  "message": "Подписка отозвана для 123456789. Пользователь удален из каналов.",
  "user": {
    "id": "uuid",
    "telegram_id": 123456789,
    "is_pro": true,
    "subscription_expires": "2026-01-23T00:00:00.000Z"
  }
}
```

**Пример:**
```bash
curl -X POST https://hranitel.daniillepekhin.com/api/admin/revoke-subscription \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_SECRET" \
  -d '{"telegram_id": 123456789, "kick_immediately": true}'
```

---

### 4. Выдача подписки вручную

Выдает подписку пользователю на указанное количество дней.

```http
POST /api/admin/grant-subscription
```

**Тело запроса:**
```json
{
  "telegram_id": 123456789,
  "days": 30,
  "source": "support_gift"
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| telegram_id | number | ✅ | Telegram ID пользователя |
| days | number | ❌ | Количество дней. По умолчанию 30 |
| source | string | ❌ | Источник выдачи для отчетности |

**Ответ:**
```json
{
  "success": true,
  "message": "Подписка выдана на 30 дней для 123456789",
  "user": {
    "id": "uuid",
    "telegram_id": 123456789,
    "is_pro": true,
    "subscription_expires": "2026-02-25T00:00:00.000Z"
  }
}
```

**Пример:**
```bash
curl -X POST https://hranitel.daniillepekhin.com/api/admin/grant-subscription \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_SECRET" \
  -d '{"telegram_id": 123456789, "days": 30}'
```

---

### 5. Информация о пользователе

Возвращает полную информацию о пользователе.

```http
GET /api/admin/user/:telegram_id
```

**Ответ:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "telegram_id": 123456789,
    "username": "user123",
    "first_name": "Иван",
    "last_name": "Петров",
    "email": "user@example.com",
    "phone": "+79001234567",
    "is_pro": true,
    "subscription_expires": "2026-02-25T00:00:00.000Z",
    "first_purchase_date": "2025-01-15T00:00:00.000Z",
    "created_at": "2025-01-01T00:00:00.000Z",
    "level": 5,
    "experience": 1250,
    "streak": 7
  },
  "funnel": {
    "current_step": "completed",
    "birth_date": "15.06.1990",
    "archetype": "Творец",
    "style": "Интуитивный",
    "updated_at": "2025-01-20T00:00:00.000Z"
  }
}
```

**Пример:**
```bash
curl https://hranitel.daniillepekhin.com/api/admin/user/123456789 \
  -H "x-admin-secret: YOUR_SECRET"
```

---

## Cron Jobs

### Проверка истекших подписок

Запускается автоматически каждый день в 6:00 МСК. Можно вызвать вручную:

```http
POST /api/webhooks/cron/check-expired-subscriptions
Headers: x-cron-secret: YOUR_CRON_SECRET
```

```bash
curl -X POST https://hranitel.daniillepekhin.com/api/webhooks/cron/check-expired-subscriptions \
  -H "x-cron-secret: hranitel-cron-secret-2026"
```

---

## Серверы

| Сервер | Назначение | Доступ |
|--------|-----------|--------|
| 2.58.98.41 | Backend (PM2: hranitel-backend) | SSH root |
| 31.128.36.81 | База данных (PostgreSQL:5423) | SSH root |

---

## .env переменные

```env
# Admin API
ADMIN_SECRET=your-secure-admin-secret

# Cron
CRON_SECRET=hranitel-cron-secret-2026

# Lava
LAVA_WIDGET_URL=https://link.lava.ru/qEPKZ
```
