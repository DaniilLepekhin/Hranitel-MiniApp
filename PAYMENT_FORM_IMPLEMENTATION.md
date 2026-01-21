# 💳 Новая форма оплаты с аналитикой - Реализация

## 📋 Что было сделано

### 1. 🗄️ База данных

#### Добавлено в схему ([schema.ts:54](backend/src/db/schema.ts#L54)):
- `users.lavaContactId` - для управления подписками через Lava
- `payments.lavaContactId` - связь платежа с контактом Lava

#### Новая таблица `payment_analytics` ([schema.ts:517](backend/src/db/schema.ts#L517)):
Отслеживает полную воронку оплаты:
- `form_open` - открытие формы оплаты
- `payment_attempt` - попытка оплаты (клик на кнопку)
- `payment_success` - успешная оплата

Поля для аналитики:
- UTM метки: `utm_campaign`, `utm_medium`, `utm_source`, `utm_content`
- `client_id` - идентификатор клиента
- `metka` - уникальная комбинация utm_campaign_utm_medium
- `payment_method` - способ оплаты (RUB/USD/EUR)
- `amount`, `currency` - сумма и валюта
- `telegram_id` - ID пользователя в Telegram

#### Миграция ([0008_add_lava_contact_and_analytics.sql](backend/drizzle/migrations/0008_add_lava_contact_and_analytics.sql)):
```sql
ALTER TABLE "users" ADD COLUMN "lava_contact_id" TEXT;
ALTER TABLE "payments" ADD COLUMN "lava_contact_id" TEXT;
CREATE TABLE "payment_analytics" (...);
```

### 2. 📝 Форма оплаты

**Файл:** [webapp/public/payment_form_club.html](webapp/public/payment_form_club.html)

**Доступ:** `https://hranitel.daniillepekhin.com/payment_form_club.html`

#### Цены:
- 💳 Карта РФ: **2.000₽**
- 💵 Foreign Bank USD: **26$**
- 💶 Foreign Bank EUR: **22€**

#### Функции:
1. **Автоматическая аналитика:**
   - Логирование открытия формы при загрузке
   - Логирование попытки оплаты при клике "Перейти к оплате"

2. **UTM трекинг:**
   - Парсинг параметров из `startapp` в формате: `app_campaign_medium_source_content_clientid_groupid`
   - Автоматическое создание метки: `utm_campaign_utm_medium`

3. **Интеграция с Telegram WebApp:**
   - Получение Telegram ID пользователя
   - Получение start параметров с UTM метками

4. **Генерация ссылки на оплату:**
   - POST запрос на `https://n8n4.daniillepekhin.ru/webhook/lava_club2`
   - Передача: email, name, phone, payment_method, telegram_id, tariff, UTM метки

### 3. 🔌 API Endpoints

#### Analytics Module ([modules/analytics/index.ts](backend/src/modules/analytics/index.ts))

**POST /api/analytics/form-open**
```json
{
  "telegram_id": "389209990",
  "utm_campaign": "telegram",
  "utm_medium": "bot",
  "utm_source": "direct",
  "utm_content": "message",
  "client_id": "12345",
  "metka": "telegram_bot"
}
```

**POST /api/analytics/payment-attempt**
```json
{
  "telegram_id": "389209990",
  "payment_method": "RUB",
  "amount": "2000",
  "currency": "RUB",
  "utm_campaign": "telegram",
  "utm_medium": "bot"
}
```

**POST /api/analytics/payment-success**
```json
{
  "telegram_id": "389209990",
  "payment_id": "uuid",
  "payment_method": "RUB",
  "amount": "2000",
  "currency": "RUB"
}
```

### 4. 🪝 Webhook Handler

**Файл:** [modules/webhooks/lava-payment.ts](backend/src/modules/webhooks/lava-payment.ts)

**Endpoint:** `POST /webhooks/lava-payment-success`

#### Что делает:
1. ✅ Находит или создает пользователя по `telegram_id`
2. ✅ Обновляет подписку:
   - `isPro = true`
   - `subscriptionExpires = NOW() + 30 days`
   - Сохраняет `lavaContactId` для управления подпиской
3. ✅ Создает запись в `payments` с полной информацией
4. ✅ Логирует `payment_success` в `payment_analytics`
5. ✅ Запускает воронку после оплаты: `startOnboardingAfterPayment(userId, chatId)`

#### Ожидаемый payload от n8n webhook:
```json
{
  "telegram_id": "389209990",
  "email": "user@example.com",
  "amount": "2000",
  "currency": "RUB",
  "payment_method": "RUB",
  "contact_id": "lava_contact_12345",
  "external_payment_id": "lava_payment_xyz",
  "status": "success",
  "tariff": "club2000",
  "utm_campaign": "telegram",
  "utm_medium": "bot",
  "utm_source": "direct",
  "utm_content": "message",
  "client_id": "12345",
  "metka": "telegram_bot"
}
```

## 🚀 Как использовать

### 1. Запуск миграции базы данных:

```bash
cd /Users/daniillepekhin/My\ Python/egiazarova/club_webapp/backend
npm run migrate
# или
bun run migrate
```

### 2. Перезапуск backend:

```bash
cd /Users/daniillepekhin/My\ Python/egiazarova/club_webapp/backend
npm run dev
# или в продакшене
pm2 restart club-backend
```

### 3. Использование формы:

**Вариант 1: Прямая ссылка**
```
https://hranitel.daniillepekhin.com/payment_form_club.html
```

**Вариант 2: Через Telegram WebApp с UTM метками**
```
https://t.me/your_bot?startapp=app_telegram_bot_direct_message_12345_hranitel
```
Формат: `app_{campaign}_{medium}_{source}_{content}_{clientid}_{groupid}`

### 4. Настройка n8n webhook:

URL: `https://n8n4.daniillepekhin.ru/webhook/lava_club2`

Должен принять POST запрос с формы и:
1. Сгенерировать ссылку на оплату в Lava
2. Вернуть `{ paymentUrl: "https://..." }`
3. При успешной оплате вызвать `POST /webhooks/lava-payment-success` с данными

## 📊 Аналитика и отчеты

### Доступные метрики:

1. **Открытия формы по меткам:**
```sql
SELECT metka, COUNT(*) as opens
FROM payment_analytics
WHERE event_type = 'form_open'
GROUP BY metka;
```

2. **Попытки оплаты:**
```sql
SELECT metka, payment_method, COUNT(*) as attempts
FROM payment_analytics
WHERE event_type = 'payment_attempt'
GROUP BY metka, payment_method;
```

3. **Успешные оплаты:**
```sql
SELECT metka, payment_method, COUNT(*) as conversions, SUM(amount::numeric) as revenue
FROM payment_analytics
WHERE event_type = 'payment_success'
GROUP BY metka, payment_method;
```

4. **Воронка конверсии:**
```sql
WITH funnel AS (
  SELECT
    metka,
    SUM(CASE WHEN event_type = 'form_open' THEN 1 ELSE 0 END) as opens,
    SUM(CASE WHEN event_type = 'payment_attempt' THEN 1 ELSE 0 END) as attempts,
    SUM(CASE WHEN event_type = 'payment_success' THEN 1 ELSE 0 END) as conversions
  FROM payment_analytics
  WHERE metka IS NOT NULL
  GROUP BY metka
)
SELECT
  metka,
  opens,
  attempts,
  conversions,
  ROUND((attempts::numeric / opens * 100), 2) as attempt_rate,
  ROUND((conversions::numeric / opens * 100), 2) as conversion_rate
FROM funnel
ORDER BY conversions DESC;
```

## 🔄 Интеграция с существующим ботом

Замените ссылку на покупку в боте с:
```
https://ishodnyi-kod.com/webappclubik
```

На:
```
https://hranitel.daniillepekhin.com/payment_form_club.html
```

Или используйте WebApp button с UTM метками:
```typescript
const keyboard = new InlineKeyboard()
  .webApp(
    'Оформить подписку ❤️',
    `https://hranitel.daniillepekhin.com/payment_form_club.html?startapp=app_${campaign}_${medium}_${source}_${content}_${clientId}_${groupId}`
  );
```

## 🎯 Управление подписками через Lava

После оплаты `contact_id` сохраняется в `users.lavaContactId` и `payments.lavaContactId`.

Это позволяет:
- ✅ Включать/отключать подписки через Lava API
- ✅ Получать уведомления о продлении
- ✅ Управлять рекуррентными платежами

## ⚠️ Важно

1. **Безопасность webhook:** Убедитесь, что n8n webhook защищен (например, секретным токеном в header)
2. **Тестирование:** Протестируйте полный флоу перед запуском в продакшен
3. **Мониторинг:** Следите за логами webhook в production для отладки проблем с оплатой

## 📝 Изменения в файлах

- ✅ [backend/src/db/schema.ts](backend/src/db/schema.ts) - добавлены поля и таблица
- ✅ [backend/drizzle/migrations/0008_add_lava_contact_and_analytics.sql](backend/drizzle/migrations/0008_add_lava_contact_and_analytics.sql) - миграция
- ✅ [webapp/public/payment_form_club.html](webapp/public/payment_form_club.html) - форма оплаты
- ✅ [backend/src/modules/analytics/index.ts](backend/src/modules/analytics/index.ts) - API аналитики
- ✅ [backend/src/modules/webhooks/lava-payment.ts](backend/src/modules/webhooks/lava-payment.ts) - webhook handler
- ✅ [backend/src/index.ts](backend/src/index.ts) - подключение модулей

## 🎉 Готово!

Система полностью готова к использованию. После запуска миграции и перезапуска backend все endpoints будут доступны.
