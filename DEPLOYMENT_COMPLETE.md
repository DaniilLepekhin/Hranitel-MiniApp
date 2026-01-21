# ✅ Развёртывание завершено - Новая форма оплаты

## 🎉 Что сделано

### 1. ✅ База данных
**Сервер:** root@31.128.36.81 (порт 5423)
**База:** club_hranitel

- Добавлено поле `lava_contact_id` в таблицы `users` и `payments`
- Создана таблица `payment_analytics` с индексами
- Миграция выполнена успешно

### 2. ✅ Backend
**Сервер:** root@2.58.98.41
**Путь:** /var/www/hranitel/backend
**PM2:** hranitel-backend (перезапущен)

Загружены файлы:
- `src/db/schema.ts` - обновлённая схема БД
- `src/index.ts` - подключение новых модулей
- `src/modules/analytics/` - новый модуль аналитики
- `src/modules/webhooks/lava-payment.ts` - webhook handler
- `src/modules/bot/` - обновлённые ссылки на форму

### 3. ✅ Frontend
**Путь:** /var/www/hranitel/webapp/public
**Файл:** payment_form_club.html

**URL:** https://hranitel.daniillepekhin.com/payment_form_club.html

### 4. ✅ Обновлён бот
Все кнопки "Оформить подписку" теперь ведут на новую форму:
- Обычная воронка до покупки
- Воронка после оплаты
- Воронка клуба (нумерология)

**Старая ссылка:** `https://ishodnyi-kod.com/webappclubik`
**Новая ссылка:** `https://hranitel.daniillepekhin.com/payment_form_club.html`

## 📊 Доступные API Endpoints

### Analytics API (без авторизации):

1. **POST /api/analytics/form-open**
   - Логирует открытие формы оплаты
   - Параметры: telegram_id, UTM метки

2. **POST /api/analytics/payment-attempt**
   - Логирует попытку оплаты
   - Параметры: telegram_id, payment_method, amount, UTM метки

3. **POST /api/analytics/payment-success**
   - Логирует успешную оплату
   - Параметры: telegram_id, payment_id, payment_method, amount

### Webhook API (для n8n):

**POST /webhooks/lava-payment-success**
- Обрабатывает успешные платежи от Lava
- Создаёт/обновляет пользователя
- Активирует подписку на 30 дней
- Сохраняет contact_id от Lava
- Запускает воронку после оплаты

## 🎯 Как работает полный флоу

### 1. Пользователь открывает форму
```
https://hranitel.daniillepekhin.com/payment_form_club.html
```

**Происходит:**
- Автоматически логируется `form_open` в payment_analytics
- Парсятся UTM метки из startapp параметра
- Получается Telegram ID пользователя

### 2. Пользователь выбирает способ оплаты и нажимает "Перейти к оплате"

**Происходит:**
- Логируется `payment_attempt` в payment_analytics
- POST запрос на `https://n8n4.daniillepekhin.ru/webhook/lava_club2`
- n8n генерирует ссылку на оплату в Lava
- Пользователь перенаправляется на Lava

### 3. Пользователь оплачивает в Lava

**Lava отправляет webhook на n8n, n8n вызывает:**
```
POST https://hranitel.daniillepekhin.com/webhooks/lava-payment-success
```

**Происходит:**
- Создаётся/обновляется пользователь в БД
- `isPro = true`, `subscriptionExpires = +30 days`
- Сохраняется `lavaContactId` для управления подпиской
- Создаётся запись в таблице `payments`
- Логируется `payment_success` в payment_analytics
- **Автоматически запускается воронка после оплаты** (`startOnboardingAfterPayment`)

### 4. Воронка после оплаты

Пользователь получает:
1. Приветственное сообщение с кодовым словом "УСПЕХ"
2. Догревы через 20, 80, 200 минут (если не ввёл слово)
3. После ввода слова - полный онбординг

## 🔧 Настройка n8n webhook

**URL:** `https://n8n4.daniillepekhin.ru/webhook/lava_club2`

**Должен принимать:**
```json
{
  "email": "user@example.com",
  "name": "Имя",
  "phone": "+79991234567",
  "payment_method": "RUB|USD|EUR",
  "telegram_id": "389209990",
  "source": "telegram_webapp",
  "tariff": "club2000",
  "utm_campaign": "...",
  "utm_medium": "...",
  "utm_source": "...",
  "utm_content": "...",
  "client_id": "...",
  "metka": "..."
}
```

**Должен вернуть:**
```json
{
  "paymentUrl": "https://acquiring.lava.top/invoice/..."
}
```

**После успешной оплаты в Lava, n8n должен вызвать:**
```
POST https://hranitel.daniillepekhin.com/webhooks/lava-payment-success
```

С payload:
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
  "utm_campaign": "...",
  "utm_medium": "...",
  "utm_source": "...",
  "utm_content": "...",
  "client_id": "...",
  "metka": "..."
}
```

## 📊 SQL запросы для аналитики

### Открытия формы по меткам:
```sql
SELECT metka, COUNT(*) as opens
FROM payment_analytics
WHERE event_type = 'form_open'
GROUP BY metka
ORDER BY opens DESC;
```

### Попытки оплаты по методам:
```sql
SELECT metka, payment_method, COUNT(*) as attempts
FROM payment_analytics
WHERE event_type = 'payment_attempt'
GROUP BY metka, payment_method
ORDER BY attempts DESC;
```

### Успешные оплаты и выручка:
```sql
SELECT
  metka,
  payment_method,
  COUNT(*) as conversions,
  SUM(amount::numeric) as revenue
FROM payment_analytics
WHERE event_type = 'payment_success'
GROUP BY metka, payment_method
ORDER BY revenue DESC;
```

### Полная воронка конверсии:
```sql
WITH funnel AS (
  SELECT
    metka,
    SUM(CASE WHEN event_type = 'form_open' THEN 1 ELSE 0 END) as opens,
    SUM(CASE WHEN event_type = 'payment_attempt' THEN 1 ELSE 0 END) as attempts,
    SUM(CASE WHEN event_type = 'payment_success' THEN 1 ELSE 0 END) as conversions,
    SUM(CASE WHEN event_type = 'payment_success' THEN amount::numeric ELSE 0 END) as revenue
  FROM payment_analytics
  WHERE metka IS NOT NULL
  GROUP BY metka
)
SELECT
  metka,
  opens,
  attempts,
  conversions,
  revenue,
  ROUND((attempts::numeric / NULLIF(opens, 0) * 100), 2) as attempt_rate,
  ROUND((conversions::numeric / NULLIF(opens, 0) * 100), 2) as conversion_rate
FROM funnel
ORDER BY conversions DESC;
```

## 🎯 Git commits

1. `50da560` - ✨ feat: добавлена новая форма оплаты с полной системой аналитики
2. `a0e89e2` - 🔗 feat: обновлены ссылки на новую форму оплаты

## ✅ Чек-лист развёртывания

- [x] Миграция базы данных выполнена
- [x] Backend обновлён и перезапущен
- [x] Frontend (форма) загружена
- [x] Ссылки в боте обновлены
- [x] Backend перезапущен с новыми ссылками
- [x] Все изменения закоммичены в git

## 🚀 Готово к использованию!

Форма доступна: **https://hranitel.daniillepekhin.com/payment_form_club.html**

Все API endpoints работают, воронка после оплаты запускается автоматически.

Осталось только настроить n8n webhook для генерации ссылок на оплату.
