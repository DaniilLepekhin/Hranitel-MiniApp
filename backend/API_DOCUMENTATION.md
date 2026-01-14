# 📚 API DOCUMENTATION - КОД ДЕНЕГ 4.0

**Версия:** 2.0.0
**Дата:** 14 января 2026

---

## 🔗 Base URL

```
Production: https://api.kod-deneg.ru
Development: http://localhost:3001
```

---

## 📋 Table of Contents

1. [Energy Points API](#energy-points-api)
2. [Shop API](#shop-api)
3. [Teams API](#teams-api)
4. [Streams API](#streams-api)
5. [Reports API](#reports-api)

---

## ⚡ Energy Points API

### GET `/api/ep/balance`

Получить баланс Energy Points пользователя.

**Query Parameters:**
- `userId` (string, required) - ID пользователя

**Response:**
```json
{
  "success": true,
  "balance": 1500
}
```

---

### GET `/api/ep/history`

Получить историю транзакций Energy Points.

**Query Parameters:**
- `userId` (string, required) - ID пользователя
- `limit` (string, optional) - Количество записей (default: 50)

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "uuid",
      "userId": "uuid",
      "amount": 50,
      "type": "income",
      "reason": "Просмотр урока",
      "metadata": { "lessonId": "uuid" },
      "createdAt": "2026-01-14T10:00:00Z"
    }
  ]
}
```

---

### POST `/api/ep/award`

Начислить Energy Points (внутренний endpoint).

**Body:**
```json
{
  "userId": "uuid",
  "amount": 100,
  "reason": "Закрытие месяца",
  "metadata": { "monthNumber": 1 }
}
```

**Response:**
```json
{
  "success": true,
  "amount": 100,
  "reason": "Закрытие месяца"
}
```

---

### POST `/api/ep/spend`

Списать Energy Points (внутренний endpoint).

**Body:**
```json
{
  "userId": "uuid",
  "amount": 1000,
  "reason": "Покупка: Билет на розыгрыш",
  "metadata": { "itemId": "uuid" }
}
```

**Response:**
```json
{
  "success": true,
  "amount": 1000,
  "reason": "Покупка: Билет на розыгрыш",
  "newBalance": 500
}
```

---

### Триггеры начисления EP

#### POST `/api/ep/triggers/daily-login`

Ежедневный вход (+10 EP).

**Body:**
```json
{
  "userId": "uuid"
}
```

---

#### POST `/api/ep/triggers/lesson-view`

Просмотр урока (+50 EP).

**Body:**
```json
{
  "userId": "uuid",
  "lessonId": "uuid"
}
```

---

#### POST `/api/ep/triggers/sunday-practice`

Воскресная практика (+50 EP).

**Body:**
```json
{
  "userId": "uuid",
  "practiceId": "uuid"
}
```

---

## 🛍️ Shop API

### GET `/api/shop/items`

Получить все товары магазина.

**Query Parameters:**
- `category` (string, optional) - Категория: `elite`, `secret`, `savings`

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "uuid",
      "title": "Билет на розыгрыш разбора",
      "description": "Шанс выиграть разбор...",
      "category": "elite",
      "price": 1000,
      "itemType": "raffle_ticket",
      "imageUrl": "/images/shop/raffle.jpg",
      "isActive": true
    }
  ]
}
```

---

### GET `/api/shop/items/by-category`

Получить товары сгруппированные по категориям.

**Response:**
```json
{
  "success": true,
  "categories": {
    "elite": [...],
    "secret": [...],
    "savings": [...]
  }
}
```

---

### GET `/api/shop/items/:id`

Получить товар по ID.

**Response:**
```json
{
  "success": true,
  "item": { ... }
}
```

---

### POST `/api/shop/purchase`

Купить товар.

**Body:**
```json
{
  "userId": "uuid",
  "itemId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "item": { ... },
  "newBalance": 500
}
```

---

### GET `/api/shop/purchases`

Получить покупки пользователя.

**Query Parameters:**
- `userId` (string, required)
- `limit` (string, optional)

**Response:**
```json
{
  "success": true,
  "purchases": [
    {
      "id": "uuid",
      "itemTitle": "Билет на розыгрыш",
      "price": 1000,
      "status": "completed",
      "purchasedAt": "2026-01-14T10:00:00Z"
    }
  ]
}
```

---

### GET `/api/shop/purchases/unused`

Получить неиспользованные покупки.

**Query Parameters:**
- `userId` (string, required)

---

### GET `/api/shop/stats`

Получить статистику покупок пользователя.

**Query Parameters:**
- `userId` (string, required)

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 5,
    "totalSpent": 4000,
    "byCategory": {
      "elite": 2,
      "secret": 2,
      "savings": 1
    }
  }
}
```

---

### POST `/api/shop/purchases/:id/use`

Отметить покупку как использованную.

**Body:**
```json
{
  "userId": "uuid"
}
```

---

## 👥 Teams API

### GET `/api/teams/my`

Получить команду пользователя.

**Query Parameters:**
- `userId` (string, required)

**Response:**
```json
{
  "success": true,
  "team": {
    "id": "uuid",
    "name": "ART - Десятка 1",
    "metka": "art",
    "memberCount": 10,
    "maxMembers": 12,
    "userRole": "member",
    "joinedAt": "2026-01-01T00:00:00Z"
  }
}
```

---

### GET `/api/teams/:id`

Получить команду со всеми участниками.

**Response:**
```json
{
  "success": true,
  "team": {
    "id": "uuid",
    "name": "ART - Десятка 1",
    "members": [
      {
        "userId": "uuid",
        "username": "ivan_petrov",
        "firstName": "Иван",
        "level": 5,
        "energyPoints": 1500,
        "role": "member"
      }
    ]
  }
}
```

---

### GET `/api/teams/:id/members`

Получить участников команды.

---

### GET `/api/teams`

Получить все команды.

**Query Parameters:**
- `metka` (string, optional) - Фильтр по metka

---

### POST `/api/teams`

Создать новую команду (admin only).

**Body:**
```json
{
  "name": "ART - Десятка 1",
  "metka": "art",
  "cityChat": "https://t.me/...",
  "description": "...",
  "maxMembers": 12
}
```

---

### POST `/api/teams/:id/join`

Добавить пользователя в команду.

**Body:**
```json
{
  "userId": "uuid",
  "role": "member"
}
```

---

### POST `/api/teams/leave`

Удалить пользователя из команды.

**Body:**
```json
{
  "userId": "uuid"
}
```

---

### POST `/api/teams/distribute`

Распределить пользователей по командам (admin only).

**Response:**
```json
{
  "success": true,
  "teamsCreated": 450,
  "usersAssigned": 54409
}
```

---

### GET `/api/teams/stats`

Получить статистику по командам.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalTeams": 450,
    "totalMembers": 4500,
    "averageSize": 10,
    "byMetka": {
      "art": 50,
      "relationship": 100
    }
  }
}
```

---

## 📺 Streams API

### GET `/api/streams/upcoming`

Получить предстоящие эфиры.

**Query Parameters:**
- `limit` (string, optional) - default: 10

**Response:**
```json
{
  "success": true,
  "streams": [
    {
      "id": "uuid",
      "title": "Воскресная практика",
      "description": "...",
      "scheduledAt": "2026-01-15T18:00:00Z",
      "host": "Кристина",
      "status": "scheduled",
      "epReward": 100
    }
  ]
}
```

---

### GET `/api/streams/next`

Получить ближайший эфир.

**Response:**
```json
{
  "success": true,
  "stream": { ... }
}
```

---

### GET `/api/streams`

Получить все эфиры.

**Query Parameters:**
- `status` (string, optional) - `scheduled`, `live`, `ended`

---

### GET `/api/streams/:id`

Получить эфир по ID.

---

### POST `/api/streams/:id/attend`

Отметить посещение эфира.

**Body:**
```json
{
  "userId": "uuid",
  "watchedOnline": true
}
```

**Response:**
```json
{
  "success": true,
  "epEarned": 100,
  "watchedOnline": true
}
```

---

### GET `/api/streams/:id/attendees`

Получить участников эфира.

---

### GET `/api/streams/:id/stats`

Получить статистику эфира.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalAttendees": 150,
    "onlineAttendees": 80,
    "offlineAttendees": 70,
    "totalEpAwarded": 8700
  }
}
```

---

### GET `/api/streams/attendance/my`

Получить историю посещений пользователя.

**Query Parameters:**
- `userId` (string, required)

---

### GET `/api/streams/attendance/stats`

Получить статистику посещений пользователя.

**Query Parameters:**
- `userId` (string, required)

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalStreams": 10,
    "onlineStreams": 7,
    "offlineStreams": 3,
    "totalEpEarned": 730
  }
}
```

---

### POST `/api/streams`

Создать новый эфир (admin only).

**Body:**
```json
{
  "title": "Воскресная практика",
  "scheduledAt": "2026-01-15T18:00:00Z",
  "host": "Кристина",
  "description": "...",
  "streamUrl": "https://...",
  "epReward": 100
}
```

---

### PATCH `/api/streams/:id/status`

Обновить статус эфира (admin only).

**Body:**
```json
{
  "status": "live"
}
```

---

## 📝 Reports API

### POST `/api/reports/submit`

Сдать отчет недели.

**Body:**
```json
{
  "userId": "uuid",
  "content": "На этой неделе я..."
}
```

**Response:**
```json
{
  "success": true,
  "report": {
    "id": "uuid",
    "weekNumber": 3,
    "epEarned": 100
  },
  "epEarned": 100
}
```

---

### GET `/api/reports/my`

Получить отчеты пользователя.

**Query Parameters:**
- `userId` (string, required)
- `limit` (string, optional)

---

### GET `/api/reports/:id`

Получить отчет по ID.

---

### GET `/api/reports/deadline`

Получить дедлайн текущей недели.

**Response:**
```json
{
  "success": true,
  "deadline": "2026-01-19T23:59:59Z",
  "hoursRemaining": 48,
  "isDeadlinePassed": false
}
```

---

### GET `/api/reports/current`

Получить отчет текущей недели пользователя.

**Query Parameters:**
- `userId` (string, required)

---

### GET `/api/reports/stats/my`

Получить статистику отчетов пользователя.

**Query Parameters:**
- `userId` (string, required)

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalReports": 12,
    "totalEpEarned": 1200,
    "currentStreak": 3,
    "submittedThisWeek": false,
    "hoursUntilDeadline": 48
  }
}
```

---

### GET `/api/reports/week/:weekNumber`

Получить все отчеты за конкретную неделю (admin only).

---

### GET `/api/reports/stats/global`

Получить глобальную статистику по отчетам (admin only).

**Response:**
```json
{
  "success": true,
  "stats": {
    "currentWeek": 3,
    "submittedThisWeek": 120,
    "deadline": "2026-01-19T23:59:59Z",
    "hoursRemaining": 48,
    "deadlinePassed": false
  }
}
```

---

### DELETE `/api/reports/:id`

Удалить отчет (только если не прошло 24 часа).

**Body:**
```json
{
  "userId": "uuid"
}
```

---

## 🔒 Error Responses

Все endpoints возвращают ошибки в едином формате:

```json
{
  "success": false,
  "error": "Error message"
}
```

---

## 📊 Триггеры начисления EP (по ТЗ)

| Действие | EP | Endpoint |
|----------|-----|----------|
| Ежедневный вход | +10 | `POST /api/ep/triggers/daily-login` |
| Просмотр урока | +50 | `POST /api/ep/triggers/lesson-view` |
| Воскресная практика | +50 | `POST /api/ep/triggers/sunday-practice` |
| Прямой эфир (онлайн) | +100 | `POST /api/streams/:id/attend` |
| Прямой эфир (запись) | +10 | `POST /api/streams/:id/attend` |
| Отчет недели | +100 | `POST /api/reports/submit` |
| Продление подписки | +300 | (внутренний триггер) |
| Закрытие месяца | +500 | (внутренний триггер) |

---

**Документация обновлена:** 14 января 2026
**Версия API:** 2.0.0
