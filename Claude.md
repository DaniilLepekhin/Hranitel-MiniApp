# КОД ДЕНЕГ 4.0 — Project Reference

> Этот файл — единый источник правды по инфраструктуре, доступам и архитектуре.
> Обновлять при любых изменениях credentials, конфигов или структуры.

---

## Продакшн

| Параметр | Значение |
|---|---|
| URL | `https://app.successkod.com` |
| API | `https://app.successkod.com/api` |
| Health | `https://app.successkod.com/health` |
| Health ready | `https://app.successkod.com/health/ready` |
| Redirect from | `https://hranitel.daniillepekhin.com` → 301 |
| Server IP | `31.128.36.81` |
| App dir (server) | `/var/www/hranitel/` |
| Backend port | `3002` |
| Frontend port | `3003` |
| Process manager | PM2 (`hranitel-backend`, `hranitel-frontend`) |
| Web server | Nginx |

---

## База данных

| Параметр | Значение |
|---|---|
| Host | `31.128.36.81:5423` |
| Database | `club_hranitel` |
| User | `postgres` |
| Password | `kH*kyrS&9z7K` |
| Full URL | `postgresql://postgres:kH*kyrS&9z7K@31.128.36.81:5423/club_hranitel` |
| Old DB (миграция) | `postgresql://postgres:kH*kyrS&9z7K@31.128.36.81:5423/postgres` |
| Тип | PostgreSQL 18 (в Docker-контейнере на сервере) |

Прямой SQL через Admin API:
```bash
curl -X POST https://app.successkod.com/api/admin/exec-sql \
  -H "x-admin-secret: <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) FROM users"}'
```

---

## Redis

| Параметр | Значение |
|---|---|
| URL | `redis://localhost:6379` |
| Назначение | Кеширование, rate limiting, dedup cron, scheduler queue |
| Ключи cron | `cron:decade-cleanup:YYYY-MM-DD`, `cron:decade-sync:YYYY-MM-DD` |

---

## Telegram

| Параметр | Значение |
|---|---|
| Bot | `@SuccessKODBot` |
| Token | `5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM` |
| Webhook URL | `https://app.successkod.com/api/v1/bot/webhook` |
| Webhook Secret | в GitHub Secrets: `TELEGRAM_WEBHOOK_SECRET` |
| Allowed updates | `message, inline_query, callback_query, my_chat_member, chat_member` |

Переустановка webhook вручную:
```bash
curl -X POST "https://api.telegram.org/bot5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://app.successkod.com/api/v1/bot/webhook", "allowed_updates": ["message","inline_query","callback_query","my_chat_member","chat_member"]}'
```

---

## LavaTop (новая платёжная система)

| Параметр | Значение |
|---|---|
| Base URL | `https://gate.lava.top` |
| API Key | `fkK6mtCkSqztdd4D6exg42XxTpFP5RQHu80yNuqsMJ1JY11E1uHBzGIE7oegTDf0` |
| Webhook Secret | `e618e788bf35fa4ad5736c3e867cfb8516716bc2880f66c119dc0c4b81532553` |
| Header | `X-Api-Key: <API_KEY>` |
| Payment webhook | `POST https://app.successkod.com/api/webhooks/lavatop/payment` |
| Recurring webhook | `POST https://app.successkod.com/api/webhooks/lavatop/recurring` |

**Офферы в БД** (таблица `lavatop_offers`):

| key | offer_id | label | periodicity |
|---|---|---|---|
| `monthly_rub_990` | `e795fcc7-cd01-4fd3-89db-b2d9a2bb5f3d` | Подписка 1 месяц (990 ₽) | MONTHLY |
| `monthly_rub_1111` | `d9566ea6-e434-47e0-a482-d8a6f06d6429` | Подписка 1 месяц (1111 ₽) | MONTHLY |
| `monthly_rub_2000` | `2ef82531-0bda-4c1d-822c-74ee941634f6` | Подписка 1 месяц (2000 ₽) | MONTHLY |
| `gift_rub_2000` | `b6dcf023-efb1-4255-9cbe-3529f39a7353` | Подарок другу (2000 ₽) | ONE_TIME |

**Нужно сделать в ЛК LavaTop** (один раз, вручную):
- Создать webhook тип «Результат платежа» → `https://app.successkod.com/api/webhooks/lavatop/payment`
- Создать webhook тип «Регулярный платёж» → `https://app.successkod.com/api/webhooks/lavatop/recurring`
- Секрет для обоих: `e618e788bf35fa4ad5736c3e867cfb8516716bc2880f66c119dc0c4b81532553`

---

## n8n (старая система Lava — работает параллельно)

| Параметр | Значение |
|---|---|
| Webhook | `https://n8n4.daniillepekhin.ru/webhook/lava_club2` |
| Статус | Активен, обрабатывает текущие платежи. Не трогать. |

---

## CloudPayments

| Параметр | Значение |
|---|---|
| API Secret | в GitHub Secrets: `CLOUDPAYMENTS_API_SECRET` |
| Webhook | `POST https://app.successkod.com/api/webhooks/cloudpayments/...` |

---

## GetCourse

| Параметр | Значение |
|---|---|
| Secret | в GitHub Secrets: `GETCOURSE_SECRET` |

---

## Admin API

**Header**: `x-admin-secret: <ADMIN_SECRET>`

**ADMIN_SECRET**: `hR4n1t3L-4dm1n-S3cr3t-2026-xK9pQ`

Ключевые endpoints:

| Endpoint | Описание |
|---|---|
| `POST /api/admin/exec-sql` | Выполнить произвольный SQL |
| `GET /api/admin/user/:telegram_id` | Информация о пользователе |
| `POST /api/admin/cleanup-inactive-decade-members` | Чистка неактивных участников десяток (`dry_run=true/false`) |
| `POST /api/admin/send-decade-reinvites` | Рассылка invite-ссылок восстановленным участникам (`dry_run=true/false`) |
| `POST /api/admin/generate-lavatop-payment-link` | Создать платёжную ссылку LavaTop |
| `GET /api/admin/lavatop-offers` | Список офферов LavaTop |
| `POST /api/admin/lavatop-offers` | Создать оффер |
| `PUT /api/admin/lavatop-offers/:id` | Обновить оффер |
| `DELETE /api/admin/lavatop-offers/:id` | Удалить оффер |

---

## GitHub

| Параметр | Значение |
|---|---|
| Repo | `https://github.com/DaniilLepekhin/Hranitel-MiniApp.git` |
| Branch | `main` |
| Деплой | `git push origin main` → GitHub Actions (~3-4 мин) |

**Все GitHub Secrets** (полный список):

| Secret | Известное значение |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:kH*kyrS&9z7K@31.128.36.81:5423/club_hranitel` |
| `OLD_DATABASE_URL` | `postgresql://postgres:kH*kyrS&9z7K@31.128.36.81:5423/postgres` |
| `REDIS_URL` | `redis://localhost:6379` |
| `TELEGRAM_BOT_TOKEN` | `5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM` |
| `TELEGRAM_BOT_USERNAME` | `SuccessKODBot` |
| `TELEGRAM_WEBHOOK_SECRET` | `d70097a1815099a29b1d89b53ae2ef8e5ed850e3a8c1d44f1d44a2145834b517` |
| `JWT_SECRET` | `hranitel_jwt_secret_key_production_2026` |
| `ADMIN_SECRET` | `hR4n1t3L-4dm1n-S3cr3t-2026-xK9pQ` |
| `OPENAI_API_KEY` | только в GitHub |
| `GETCOURSE_SECRET` | только в GitHub |
| `CLOUDPAYMENTS_API_SECRET` | только в GitHub |
| `LAVATOP_API_KEY` | `fkK6mtCkSqztdd4D6exg42XxTpFP5RQHu80yNuqsMJ1JY11E1uHBzGIE7oegTDf0` |
| `LAVATOP_WEBHOOK_SECRET` | `e618e788bf35fa4ad5736c3e867cfb8516716bc2880f66c119dc0c4b81532553` |
| `SERVER_HOST` | `31.128.36.81` (предположительно) |
| `SERVER_USER` | только в GitHub |
| `SSH_PRIVATE_KEY` | только в GitHub |
| `CORS_ORIGIN` | `https://hranitel.daniillepekhin.com,https://successkod.com,https://app.successkod.com,https://www.successkod.com` |

---

## Cron Jobs

### Внутри приложения (backend/src/index.ts)

| Job | Время МСК | Время UTC | Redis dedup key | Описание |
|---|---|---|---|---|
| `checkExpiredSubscriptionsDaily` | 00:00 | 21:00 (пред. день) | нет | Выгоняет пользователей с истекшей подпиской из каналов/чатов |
| `sendRenewalRemindersDaily` | 09:00 | 06:00 | нет | Напоминания за 2 дня / 1 день / в день истечения |
| `syncDecadeMembershipDaily` | 05:00 | 02:00 | `cron:decade-sync:YYYY-MM-DD` | Синхронизирует состав десяток с Telegram (ban check) |
| `cleanupInactiveDecadeMembersDaily` | 06:00 | 03:00 | `cron:decade-cleanup:YYYY-MM-DD` | Удаляет участников без `'Ежедневный отчет'` за 30 дней |

### OS cron (на сервере через crontab)

| Schedule | Script | Описание |
|---|---|---|
| `5 * * * *` | `refresh_ratings.sh` | Обновление кеша рейтингов (materialized views) |
| `0 3 * * *` | `process_expired_energies.sh` | Сгорание очков энергии (06:00 МСК) |
| `0 7 * * *` | `chat_open_morning.sh` | Открытие основного канала (10:00 МСК) |
| `0 19 * * *` | `chat_close_evening.sh` | Закрытие основного канала (22:00 МСК) |
| `0 7 * * 0` | `city_chats_close_sunday.sh` | Закрытие городских чатов (воскресенье 10:00 МСК) |
| `0 7 * * 1` | `city_chats_open_monday.sh` | Открытие городских чатов (понедельник 10:00 МСК) |

---

## Архитектура

```
app.successkod.com
        │
      Nginx
      ├── /        → Frontend Next.js   (port 3003)
      └── /api/    → Backend Elysia     (port 3002)
                           │
                     ┌─────┴──────┐
               PostgreSQL       Redis
            (31.128.36.81:5423) (localhost:6379)
```

**Стек:**
- Backend: Bun + Elysia + Drizzle ORM + TypeScript
- Frontend: Next.js 14 (standalone mode)
- Database: PostgreSQL 18
- Cache/Queue: Redis
- Bot: Grammy (Telegram Bot API)

---

## Ключевые таблицы БД

| Таблица | Назначение |
|---|---|
| `users` | Пользователи. `is_pro=true` = активная подписка |
| `decades` | Десятки. `invite_link`, `tg_chat_id`, `is_active`, `current_members` |
| `decade_members` | Участники десяток. `left_at IS NULL` = активный. `telegram_id`, `joined_at` |
| `payments` | История платежей |
| `payment_analytics` | Аналитика платежей, `email` для поиска после LavaTop webhook |
| `energy_transactions` | Очки энергии. `reason='Ежедневный отчет'` = ежедневный отчёт |
| `lavatop_offers` | Офферы LavaTop (управляются через Admin API) |
| `city_ratings_cache` | Materialized view рейтинга городов |

---

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `backend/src/index.ts` | Entry point, cron setup |
| `backend/src/config/index.ts` | Валидация env переменных |
| `backend/src/db/schema.ts` | Схема БД (Drizzle) |
| `backend/src/services/subscription-guard.service.ts` | Проверка подписок, чистка десяток |
| `backend/src/services/decades.service.ts` | Вся бизнес-логика десяток |
| `backend/src/services/lavatop.service.ts` | LavaTop API client |
| `backend/src/modules/admin/index.ts` | Admin API endpoints |
| `backend/src/modules/webhooks/lavatop.ts` | LavaTop webhook handler |
| `backend/src/modules/webhooks/lava-payment.ts` | Старый Lava (n8n) webhook |
| `backend/src/modules/webhooks/cloudpayments.ts` | CloudPayments webhook |
| `backend/src/modules/bot/index.ts` | Telegram bot (~6000 строк) |
| `backend/drizzle/migrations/` | SQL миграции (0001–0019) |
| `.github/workflows/deploy.yml` | CI/CD pipeline |

---

## Логика десяток — важное

- Участник считается неактивным если: в десятке **30+ дней** И нет `energy_transactions` с `reason='Ежедневный отчет'` за последние 30 дней
- Лидеры (`is_leader=true`) не выгоняются cron'ом
- Амбассадоры (`is_ambassador=true`) не учитываются в счётчике `current_members`
- `removeUserFromDecade(telegramId)` делает: `left_at=NOW()` + уменьшает счётчик + ban+unban в Telegram-чате (ban позволяет повторно зайти по invite-ссылке)
- Invite-ссылка доступна через miniapp → вкладка "Чаты"

**Критический баг (исправлен 11.03.2026):**
- `subscription-guard.service.ts` искал `reason='Сдача отчета недели'` вместо `'Ежедневный отчет'`
- Следствие: cron ежедневно выкидывал ВСЕХ участников старше 30 дней
- 11.03.2026 в 06:25 МСК выкинуто 573 человека → восстановлены вручную через SQL

---

## Платёжные системы — статус

| Система | Статус | Использование |
|---|---|---|
| Lava (через n8n) | Активна | Текущие подписки. НЕ трогать. |
| CloudPayments | Активна | Параллельная система |
| LavaTop | Разработана, НЕ переключена | Только `/admin/generate-lavatop-payment-link`. Webhook'и нужно настроить в ЛК LavaTop. |

---

## Деплой

```bash
git add .
git commit -m "feat: описание"
git push origin main
# GitHub Actions: ~3-4 минуты
# Логи: https://github.com/DaniilLepekhin/Hranitel-MiniApp/actions
```

**Откат:** если health check упал после деплоя — PM2 автоматически делает `pm2 resurrect`.

**Миграции:** применяются автоматически при каждом деплое через psql в deploy.yml.
Новую миграцию добавлять в `backend/drizzle/migrations/` и прописывать в deploy.yml.

---

## Локальная разработка

```bash
# Backend
cd backend
bun install
bun run dev  # port 3001

# Frontend
cd webapp
npm install
npm run dev  # port 3000
```

Локальный `.env` (`backend/.env`) — DATABASE_URL указывает на продакшн БД напрямую.  
**Осторожно**: любые изменения данных сразу попадают в продакшн.
