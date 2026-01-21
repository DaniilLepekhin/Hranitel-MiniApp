# 📝 Миграция: Добавление контактных данных в users и payments

## Что добавлено:

### В таблицу `users`:
- `email` - email из формы оплаты
- `phone` - телефон из формы оплаты

### В таблицу `payments`:
- `name` - имя из формы оплаты
- `email` - email из формы оплаты
- `phone` - телефон из формы оплаты

## Как запустить миграцию:

### Вариант 1: Автоматически (через GitHub Actions)
Миграция должна выполниться автоматически при деплое.

### Вариант 2: Вручную на сервере
```bash
ssh root@2.58.98.41
cd /var/www/hranitel/backend
bun run migrate
```

### Вариант 3: Напрямую в БД
```bash
ssh root@2.58.98.41
psql -h 31.128.36.81 -U postgres -d club_hranitel -p 5423 -W
```

Пароль: `kH*kyrS&9z7K`

Затем выполнить:
```sql
-- Users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Payments table
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "phone" TEXT;
```

## Проверка:

```sql
-- Проверить users
\d users

-- Проверить payments
\d payments
```

Должны появиться новые поля.

## Что изменилось в коде:

### 1. Schema (`backend/src/db/schema.ts`)

#### Users table (строки 42-43):
```typescript
// Contact information
email: text('email'), // Email из формы оплаты
phone: text('phone'), // Телефон из формы оплаты
```

#### Payments table (строки 531-534):
```typescript
// Contact information (из формы оплаты)
name: text('name'), // Имя из формы
email: text('email'), // Email из формы
phone: text('phone'), // Телефон из формы
```

### 2. Webhook (`backend/src/modules/webhooks/lava-payment.ts`)

Теперь при успешной оплате:

#### Создание нового пользователя (строки 57-74):
```typescript
const [newUser] = await db
  .insert(users)
  .values({
    telegramId: telegram_id.toString(),
    email: email || null,        // ⭐ сохраняем напрямую
    phone: phone || null,        // ⭐ сохраняем напрямую
    isPro: true,
    subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lavaContactId: contact_id || null,
    firstPurchaseDate: new Date(),
    metadata: {
      utm_campaign: utm_campaign || null,
      utm_medium: utm_medium || null,
      utm_source: utm_source || null,
      metka: metka || null,
    },
  })
  .returning();
```

#### Обновление существующего пользователя (строки 87-94):
```typescript
// Update email and phone if provided
if (email && !user.email) {
  updateData.email = email;
}
if (phone && !user.phone) {
  updateData.phone = phone;
}
```

#### Создание записи платежа (строки 124-127):
```typescript
await db.insert(payments).values({
  userId: user.id,
  amount: amount ? amount.toString() : '0',
  currency: currency || payment_method || 'RUB',
  status: status === 'success' ? 'completed' : 'pending',
  paymentProvider: 'lava',
  externalPaymentId: external_payment_id || null,
  lavaContactId: contact_id || null,
  name: name || null,      // ⭐ новое
  email: email || null,    // ⭐ новое
  phone: phone || null,    // ⭐ новое
  metadata: {
    tariff: tariff || 'club2000',
    payment_method: payment_method || null,
    utm_campaign: utm_campaign || null,
    utm_medium: utm_medium || null,
    utm_source: utm_source || null,
    utm_content: utm_content || null,
    client_id: client_id || null,
    metka: metka || null,
  },
  completedAt: status === 'success' ? new Date() : null,
})
```

#### Валидация webhook (строки 205-208):
```typescript
body: t.Object({
  telegram_id: t.String(),
  name: t.Optional(t.String()),    // ⭐ новое
  email: t.Optional(t.String()),
  phone: t.Optional(t.String()),   // ⭐ новое
  amount: t.Optional(t.Union([t.String(), t.Number()])),
  // ... rest
}),
```

## Результат:

Теперь контактные данные пользователя сохраняются:
- ✅ В `users` - email и phone (только если их ещё нет)
- ✅ В `payments` - name, email, phone для каждого платежа
- ✅ В `payment_analytics` - name, email, phone для каждого события (было добавлено ранее)

Это позволяет:
- ✅ Иметь полную контактную информацию о пользователе
- ✅ Видеть контактные данные для каждой транзакции
- ✅ Анализировать качество лидов и ROI по меткам
- ✅ Строить отчёты по контактным данным на всех этапах воронки
