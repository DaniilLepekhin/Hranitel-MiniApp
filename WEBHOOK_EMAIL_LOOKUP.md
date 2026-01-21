# 🎯 Упрощённый Webhook через Email Lookup

## Концепция

Вместо передачи всех данных пользователя в webhook, теперь используется **email как ключ** для поиска последнего `payment_attempt` в аналитике.

## Преимущества

✅ **Проще интеграция** - Lava передаёт только 4 параметра вместо 20+
✅ **Надёжнее** - Все данные уже сохранены в `payment_attempt` до вызова webhook
✅ **Меньше ошибок** - Один источник правды (payment_analytics)
✅ **Лучше трекинг** - Email всегда в lowercase, корректный матчинг

## Как это работает

### 1. Пользователь заполняет форму
```javascript
// payment_form_club.html
const email = document.getElementById('email').value.trim().toLowerCase();
```

### 2. Отправляется payment-attempt
```javascript
POST /api/analytics/payment-attempt
{
  "telegram_id": "389209990",
  "payment_method": "RUB",
  "amount": "2000",
  "currency": "RUB",
  "name": "Иван Петров",
  "email": "user@example.com",  // ⬅️ lowercase
  "phone": "+79991234567",
  "utm_campaign": "club_jan",
  "utm_medium": "telegram",
  ...
}
```

### 3. Пользователь оплачивает через Lava

### 4. Lava вызывает webhook (упрощённый)
```bash
POST /api/webhooks/lava-payment-success
{
  "email": "user@example.com",
  "payment_method": "RUB",
  "amount": 2000,
  "contact_id": "lava_contact_12345"
}
```

### 5. Webhook находит payment_attempt
```typescript
// backend/src/modules/webhooks/lava-payment.ts
const [lastAttempt] = await db
  .select()
  .from(paymentAnalytics)
  .where(
    and(
      eq(paymentAnalytics.email, email.toLowerCase().trim()),
      eq(paymentAnalytics.eventType, 'payment_attempt')
    )
  )
  .orderBy(desc(paymentAnalytics.createdAt))
  .limit(1);

// Извлекает все данные из payment_attempt:
const telegram_id = lastAttempt.telegramId;
const name = lastAttempt.name;
const phone = lastAttempt.phone;
const utm_campaign = lastAttempt.utmCampaign;
const utm_medium = lastAttempt.utmMedium;
const utm_source = lastAttempt.utmSource;
const metka = lastAttempt.metka;
// и т.д.
```

### 6. Webhook создаёт/обновляет пользователя и платёж
Все данные берутся из найденного `payment_attempt`.

## Изменения в коде

### 1. Analytics API - email в lowercase
**Файл:** `backend/src/modules/analytics/index.ts`

```typescript
// form-open
email: email ? email.toLowerCase().trim() : null,

// payment-attempt
email: email ? email.toLowerCase().trim() : null,
```

### 2. Форма оплаты - email в lowercase
**Файл:** `webapp/public/payment_form_club.html`

```javascript
const email = document.getElementById('email').value.trim().toLowerCase();
```

### 3. Webhook - упрощённая валидация
**Файл:** `backend/src/modules/webhooks/lava-payment.ts`

**Было:**
```typescript
body: t.Object({
  telegram_id: t.String(),
  name: t.Optional(t.String()),
  email: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  amount: t.Optional(t.Union([t.String(), t.Number()])),
  currency: t.Optional(t.String()),
  payment_method: t.Optional(t.String()),
  contact_id: t.Optional(t.String()),
  // ... 10+ полей UTM и т.д.
})
```

**Стало:**
```typescript
body: t.Object({
  email: t.String(),                              // Обязательно
  payment_method: t.Optional(t.String()),         // RUB, USD, EUR
  amount: t.Optional(t.Union([t.String(), t.Number()])),
  contact_id: t.Optional(t.String()),             // Lava contact_id
})
```

## Настройка Lava Webhook

В настройках Lava укажите:

**URL:** `https://hranitel.daniillepekhin.com/api/webhooks/lava-payment-success`

**Payload:**
```json
{
  "email": "{{customer_email}}",
  "payment_method": "{{payment_method}}",
  "amount": {{amount}},
  "contact_id": "{{contact_id}}"
}
```

## Пример полного flow

1. **Пользователь открывает форму:**
   ```
   payment_analytics: { event_type: 'form_open', email: 'user@example.com', ... }
   ```

2. **Пользователь нажимает "Оплатить":**
   ```
   payment_analytics: { event_type: 'payment_attempt', email: 'user@example.com', telegram_id: '389209990', name: 'Иван', ... }
   ```

3. **Lava вызывает webhook:**
   ```json
   POST /api/webhooks/lava-payment-success
   { "email": "user@example.com", "payment_method": "RUB", "amount": 2000 }
   ```

4. **Webhook ищет payment_attempt:**
   ```sql
   SELECT * FROM payment_analytics
   WHERE email = 'user@example.com'
     AND event_type = 'payment_attempt'
   ORDER BY created_at DESC
   LIMIT 1
   ```

5. **Webhook создаёт записи:**
   ```
   users: { telegram_id: '389209990', email: 'user@example.com', phone: '+79991234567', ... }
   payments: { user_id: ..., amount: '2000', email: 'user@example.com', name: 'Иван', ... }
   payment_analytics: { event_type: 'payment_success', email: 'user@example.com', ... }
   ```

## Важные моменты

⚠️ **Email всегда в lowercase** - обеспечивает корректный матчинг
⚠️ **payment_attempt обязателен** - webhook вернёт ошибку если не найден
⚠️ **Последний payment_attempt** - если пользователь несколько раз нажал "Оплатить", берётся последняя попытка

## Обработка ошибок

### Email не найден
```json
HTTP 400
{
  "success": false,
  "error": "No payment attempt found for this email"
}
```

### Email отсутствует в webhook
```json
HTTP 400
{
  "success": false,
  "error": "Missing email"
}
```

## Миграция существующих интеграций

Если у вас уже работает webhook с старыми параметрами, вам нужно:

1. Обновить код на сервере (уже сделано)
2. Изменить настройки в Lava согласно разделу "Настройка Lava Webhook"
3. Протестировать тестовым платежом
4. Проверить что все данные корректно сохраняются в БД

## SQL для проверки

```sql
-- Проверить что payment_attempt создался
SELECT * FROM payment_analytics
WHERE email = 'user@example.com'
  AND event_type = 'payment_attempt'
ORDER BY created_at DESC LIMIT 1;

-- Проверить что payment_success создался
SELECT * FROM payment_analytics
WHERE email = 'user@example.com'
  AND event_type = 'payment_success'
ORDER BY created_at DESC LIMIT 1;

-- Проверить что пользователь создался
SELECT * FROM users
WHERE email = 'user@example.com';

-- Проверить что платёж создался
SELECT * FROM payments
WHERE email = 'user@example.com';
```
