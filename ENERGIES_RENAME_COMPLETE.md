# ✅ Переименование Energy Points в "Энергии" завершено

## 📝 Что изменилось

### База данных

| Было | Стало |
|------|-------|
| `energy_points` (колонка) | `energies` |
| `ep_transactions` (таблица) | `energy_transactions` |
| `ep_transaction_type` (enum) | `energy_transaction_type` |
| `ep_earned` (во всех таблицах) | `energies_earned` |
| `ep_transactions_*_idx` (индексы) | `energy_transactions_*_idx` |

### Backend API

#### Endpoints
- `/api/ep/*` → `/api/energies/*`
  - `/api/energies/balance`
  - `/api/energies/history`
  - `/api/energies/stats`

#### TypeScript Types
```typescript
// Было
EPTransaction
NewEPTransaction
EPStats

// Стало
EnergyTransaction
NewEnergyTransaction
EnergyStats
```

#### Schema
```typescript
// Было
energyPoints: integer('energy_points')
epTransactions
epEarned

// Стало
energies: integer('energies')
energyTransactions
energiesEarned
```

### Frontend

#### API Client
```typescript
// Было
epApi.getBalance()
EPTransaction
EPStats

// Стало
energiesApi.getBalance()
EnergyTransaction
EnergyStats
```

#### Тексты интерфейса
- "Energy Points" → "Энергии"
- "+50 EP" → "+50 Энергий"
- "Получите Energy Points" → "Получите Энергии"

### Затронутые файлы

#### Backend (5 файлов)
1. `backend/src/db/schema.ts` - схема БД
2. `backend/src/modules/energy-points/index.ts` - API routes
3. `backend/src/modules/energy-points/service.ts` - бизнес-логика
4. `backend/src/modules/content/index.ts` - контент API
5. `backend/drizzle/0003_rename_ep_to_energies.sql` - миграция

#### Frontend (2 файла)
1. `webapp/src/lib/api.ts` - API клиент
2. `webapp/src/app/(main)/video/[videoId]/page.tsx` - страница видео

## 🔄 Миграция базы данных

### Применена миграция `0003_rename_ep_to_energies.sql`

```sql
-- 1. Переименован enum
ALTER TYPE "ep_transaction_type" RENAME TO "energy_transaction_type";

-- 2. Переименована таблица
ALTER TABLE "ep_transactions" RENAME TO "energy_transactions";

-- 3. Переименованы индексы (3 шт)
ALTER INDEX "ep_transactions_user_id_idx" RENAME TO "energy_transactions_user_id_idx";
-- ...

-- 4. Переименована колонка в users
ALTER TABLE "users" RENAME COLUMN "energy_points" TO "energies";

-- 5-7. Переименованы колонки в других таблицах
ALTER TABLE "stream_attendance" RENAME COLUMN "ep_earned" TO "energies_earned";
ALTER TABLE "weekly_reports" RENAME COLUMN "ep_earned" TO "energies_earned";
ALTER TABLE "user_content_progress" RENAME COLUMN "ep_earned" TO "energies_earned";
```

**Статус:** ✅ Применена на production (31.128.36.81:5423)

## 🧪 Проверка

### База данных
```sql
-- Проверить таблицу
\dt energy_transactions

-- Проверить колонку
SELECT energies FROM users LIMIT 1;

-- Проверить транзакции
SELECT * FROM energy_transactions LIMIT 5;
```

### API
```bash
# Получить баланс
curl http://localhost:3001/api/energies/balance?userId=xxx

# Получить историю
curl http://localhost:3001/api/energies/history?userId=xxx

# Начислить энергии (internal)
curl -X POST http://localhost:3001/api/energies/award \
  -H "Content-Type: application/json" \
  -d '{"userId":"xxx","amount":50,"reason":"Просмотр урока"}'
```

### Frontend
1. Откройте любое видео
2. Просмотрите до конца
3. Нажмите "Я посмотрел(а)"
4. Увидите: "Вы получили +50 Энергий за просмотр этого видео!"

## 📊 Статистика изменений

- **Файлов изменено:** 7
- **Строк добавлено:** 98
- **Строк удалено:** 73
- **Таблиц переименовано:** 1
- **Колонок переименовано:** 4
- **Индексов переименовано:** 3
- **Enum переименовано:** 1
- **API endpoints изменено:** 4
- **TypeScript типов изменено:** 6

## 🎯 Обратная совместимость

⚠️ **BREAKING CHANGES:**

Старые API endpoints больше не работают:
- ❌ `/api/ep/*`
- ✅ `/api/energies/*` (новый)

Старые поля в ответах API изменились:
- ❌ `epEarned`
- ✅ `energiesEarned`

Клиенты должны обновить код!

## 📝 Для разработчиков

### Использование в коде

```typescript
// Backend
import { energyTransactions, users } from '@/db/schema';

// Начислить энергии
await db.insert(energyTransactions).values({
  userId,
  amount: 50,
  type: 'income',
  reason: 'Просмотр урока'
});

// Обновить баланс
await db
  .update(users)
  .set({ energies: user.energies + 50 })
  .where(eq(users.id, userId));
```

```typescript
// Frontend
import { energiesApi } from '@/lib/api';

// Получить баланс
const { data } = await energiesApi.getBalance(userId);
console.log(`Баланс: ${data.balance} Энергий`);

// Получить историю
const { data } = await energiesApi.getHistory(userId);
data.transactions.forEach(tx => {
  console.log(`${tx.type}: ${tx.amount} - ${tx.reason}`);
});
```

## ✅ Готово!

Все упоминания "Energy Points" и "EP" успешно заменены на "Энергии" во всей системе!

**Коммит:** `1806ba9 - ♻️ refactor: переименование Energy Points в Энергии`
