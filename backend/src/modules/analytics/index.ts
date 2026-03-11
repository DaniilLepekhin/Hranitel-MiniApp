import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { paymentAnalytics, payments, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { alertsService } from '@/services/alerts.service';
import { schedulerService } from '@/services/scheduler.service';

export const analyticsModule = new Elysia({ prefix: '/analytics', tags: ['Analytics'] })
  // Track form open event
  .post(
    '/form-open',
    async ({ body, set }) => {
      try {
        const {
          telegram_id,
          utm_campaign,
          utm_medium,
          utm_source,
          utm_content,
          client_id,
          metka,
          name,
          email,
          phone,
        } = body;

        // 🆕 Создаём пользователя если его нет в базе (на случай если он открыл форму оплаты минуя /start)
        const telegramIdNum = parseInt(telegram_id, 10);
        if (!isNaN(telegramIdNum)) {
          const existingUser = await db.query.users.findFirst({
            where: eq(users.telegramId, telegramIdNum),
          });

          if (!existingUser) {
            const metadata: Record<string, string | null> = {};
            if (utm_campaign) metadata.utmCampaign = utm_campaign;
            if (utm_medium) metadata.utmMedium = utm_medium;
            if (utm_source) metadata.utmSource = utm_source;
            if (utm_content) metadata.utmContent = utm_content;

            await db.insert(users).values({
              telegramId: telegramIdNum,
              username: null,
              firstName: name || null,
              lastName: null,
              metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            });
            logger.info({ telegramId: telegramIdNum, utm_campaign }, 'Created new user from payment form open');
          }
        }

        // Конвертируем telegram_id в число для bigint поля
        const tgIdNum = parseInt(telegram_id, 10);
        if (isNaN(tgIdNum)) {
          throw new Error('Invalid telegram_id');
        }

        // Fallback: если webapp не передал UTM — берём из users.metadata (start-параметр бота)
        const nullify = (v: string | null | undefined) => (!v || v === 'null' || v === 'undefined') ? null : v;

        let finalCampaign = nullify(utm_campaign);
        let finalMedium   = nullify(utm_medium);
        let finalSource   = nullify(utm_source);
        let finalMetka    = nullify(metka);

        if (!finalCampaign && !finalMedium) {
          const userRecord = await db.query.users.findFirst({
            where: eq(users.telegramId, tgIdNum),
            columns: { metadata: true },
          });
          if (userRecord?.metadata) {
            const meta = userRecord.metadata as Record<string, unknown>;
            const rawPayload = meta.raw_payload as string | undefined;
            if (rawPayload) {
              const parts = rawPayload.split('_');
              finalCampaign = parts[0] || null;
              finalMedium   = parts[1] || null;
              finalSource   = parts[2] || null;
            } else {
              finalCampaign = nullify(meta.utm_campaign as string);
              finalMedium   = nullify(meta.utm_medium   as string);
              finalSource   = nullify(meta.utm_source   as string);
            }
          }
        }

        finalMetka = finalMetka || [finalCampaign, finalMedium, finalSource].filter(p => p).join('_') || null;

        await db.insert(paymentAnalytics).values({
          telegramId: tgIdNum,
          eventType: 'form_open',
          utmCampaign: finalCampaign,
          utmMedium: finalMedium,
          utmSource: finalSource,
          utmContent: utm_content || null,
          clientId: client_id || null,
          metka: finalMetka,
          name: name || null,
          email: email ? email.toLowerCase().trim() : null,
          phone: phone || null,
        });

        logger.info(
          { telegram_id, metka: finalMetka, event: 'form_open' },
          'Payment form opened'
        );

        return {
          success: true,
          message: 'Form open tracked',
        };
      } catch (error) {
        logger.error({ error, body }, 'Failed to track form open');
        set.status = 500;
        return {
          success: false,
          error: 'Failed to track form open',
        };
      }
    },
    {
      body: t.Object({
        telegram_id: t.String(),
        utm_campaign: t.Optional(t.String()),
        utm_medium: t.Optional(t.String()),
        utm_source: t.Optional(t.String()),
        utm_content: t.Optional(t.String()),
        client_id: t.Optional(t.String()),
        metka: t.Optional(t.String()),
        name: t.Optional(t.String()),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Track payment form open event',
        description: 'Logs when a user opens the payment form with UTM parameters',
      },
    }
  )
  // Track payment attempt event
  .post(
    '/payment-attempt',
    async ({ body, set }) => {
      try {
        const {
          telegram_id,
          payment_method,
          amount,
          currency,
          utm_campaign,
          utm_medium,
          utm_source,
          utm_content,
          client_id,
          metka,
          name,
          email,
          phone,
          code_word,
        } = body;

        // Конвертируем telegram_id в число для bigint поля
        const tgIdNum = parseInt(telegram_id, 10);
        if (isNaN(tgIdNum)) {
          throw new Error('Invalid telegram_id');
        }

        // 🆕 Проверка 3-месячного кулдауна (подстраховка на бэкенде)
        const existingUser = await db.query.users.findFirst({
          where: eq(users.telegramId, tgIdNum),
        });
        if (existingUser && !existingUser.isPro && existingUser.subscriptionExpires) {
          const expiryDate = new Date(existingUser.subscriptionExpires);
          const now = new Date();
          const gracePeriodEnd = new Date(expiryDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          const cooldownEnd = new Date(expiryDate.getTime() + 90 * 24 * 60 * 60 * 1000);
          // Кулдаун активен только если прошло больше 7 дней с момента истечения
          if (now > gracePeriodEnd && now < cooldownEnd) {
            logger.warn({ telegram_id: tgIdNum, cooldownEnd }, '🚫 Payment attempt blocked: 3-month cooldown active');
            set.status = 403;
            return {
              success: false,
              error: 'cooldown_active',
              message: 'Повторная оплата недоступна. С момента отмены подписки ещё не прошло 3 месяца.',
            };
          }
        }

        // Fallback: если webapp не передал UTM — берём из users.metadata (start-параметр бота)
        const nullify2 = (v: string | null | undefined) => (!v || v === 'null' || v === 'undefined') ? null : v;

        let finalCampaign = nullify2(utm_campaign);
        let finalMedium   = nullify2(utm_medium);
        let finalSource   = nullify2(utm_source);
        let finalMetka    = nullify2(metka);

        if (!finalCampaign && !finalMedium) {
          const meta = existingUser?.metadata as Record<string, unknown> | null | undefined;
          if (meta) {
            const rawPayload = meta.raw_payload as string | undefined;
            if (rawPayload) {
              const parts = rawPayload.split('_');
              finalCampaign = parts[0] || null;
              finalMedium   = parts[1] || null;
              finalSource   = parts[2] || null;
            } else {
              finalCampaign = nullify2(meta.utm_campaign as string);
              finalMedium   = nullify2(meta.utm_medium   as string);
              finalSource   = nullify2(meta.utm_source   as string);
            }
          }
        }

        finalMetka = finalMetka || [finalCampaign, finalMedium, finalSource].filter(p => p).join('_') || null;

        await db.insert(paymentAnalytics).values({
          telegramId: tgIdNum,
          eventType: 'payment_attempt',
          paymentMethod: payment_method,
          amount: amount,
          currency: currency ? currency.substring(0, 3).toUpperCase() : null, // varchar(3) limit
          utmCampaign: finalCampaign,
          utmMedium: finalMedium,
          utmSource: finalSource,
          utmContent: utm_content || null,
          clientId: client_id || null,
          metka: finalMetka,
          name: name || null,
          email: email ? email.toLowerCase().trim() : null,
          phone: phone || null,
          metadata: code_word ? { code_word } : null,
        });

        logger.info(
          {
            telegram_id,
            payment_method,
            amount,
            metka: finalMetka,
            event: 'payment_attempt',
          },
          'Payment attempt tracked'
        );

        // 🆕 Планируем проверку "оплата не завершена" через 10 мин
        // Отменяем предыдущую такую задачу (если пользователь нажал "оплатить" несколько раз)
        await schedulerService.cancelUserTasksByType(tgIdNum, 'payment_not_completed');
        await schedulerService.schedule(
          {
            type: 'payment_not_completed',
            userId: tgIdNum,
            chatId: tgIdNum, // В личных чатах chatId = telegramId
          },
          3 * 60 * 1000 // 3 минуты
        );
        logger.info({ telegram_id: tgIdNum }, 'Scheduled payment_not_completed check in 3 min');

        return {
          success: true,
          message: 'Payment attempt tracked',
        };
      } catch (error) {
        logger.error({ error, body }, 'Failed to track payment attempt');

        // 🚨 КРИТИЧЕСКИЙ АЛЕРТ: данные оплаты не сохранились
        await alertsService.paymentError(body.telegram_id, error, {
          payment_method: body.payment_method,
          amount: body.amount,
          name: body.name,
          email: body.email,
          phone: body.phone,
        });

        set.status = 500;
        return {
          success: false,
          error: 'Failed to track payment attempt',
        };
      }
    },
    {
      body: t.Object({
        telegram_id: t.String(),
        payment_method: t.String(),
        amount: t.String(),
        currency: t.Optional(t.String()),
        utm_campaign: t.Optional(t.String()),
        utm_medium: t.Optional(t.String()),
        utm_source: t.Optional(t.String()),
        utm_content: t.Optional(t.String()),
        client_id: t.Optional(t.String()),
        metka: t.Optional(t.String()),
        name: t.Optional(t.String()),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        code_word: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Track payment attempt event',
        description: 'Logs when a user attempts to make a payment',
      },
    }
  )
  // Track payment success event (called from webhook handler)
  .post(
    '/payment-success',
    async ({ body, set }) => {
      try {
        const {
          telegram_id,
          payment_id,
          payment_method,
          amount,
          currency,
          utm_campaign,
          utm_medium,
          utm_source,
          utm_content,
          client_id,
          metka,
        } = body;

        // Create metka if not provided
        const finalMetka = metka || [utm_campaign, utm_medium].filter(p => p).join('_');

        // Конвертируем telegram_id в число для bigint поля
        const tgIdNum = parseInt(telegram_id, 10);
        if (isNaN(tgIdNum)) {
          throw new Error('Invalid telegram_id');
        }

        await db.insert(paymentAnalytics).values({
          telegramId: tgIdNum,
          eventType: 'payment_success',
          paymentId: payment_id || null,
          paymentMethod: payment_method,
          amount: amount,
          currency: currency ? currency.substring(0, 3).toUpperCase() : null, // varchar(3) limit
          utmCampaign: utm_campaign || null,
          utmMedium: utm_medium || null,
          utmSource: utm_source || null,
          utmContent: utm_content || null,
          clientId: client_id || null,
          metka: finalMetka || null,
        });

        logger.info(
          {
            telegram_id,
            payment_id,
            payment_method,
            amount,
            metka: finalMetka,
            event: 'payment_success',
          },
          'Payment success tracked'
        );

        return {
          success: true,
          message: 'Payment success tracked',
        };
      } catch (error) {
        logger.error({ error, body }, 'Failed to track payment success');
        set.status = 500;
        return {
          success: false,
          error: 'Failed to track payment success',
        };
      }
    },
    {
      body: t.Object({
        telegram_id: t.String(),
        payment_id: t.Optional(t.String()),
        payment_method: t.String(),
        amount: t.String(),
        currency: t.Optional(t.String()),
        utm_campaign: t.Optional(t.String()),
        utm_medium: t.Optional(t.String()),
        utm_source: t.Optional(t.String()),
        utm_content: t.Optional(t.String()),
        client_id: t.Optional(t.String()),
        metka: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Track payment success event',
        description: 'Logs when a payment is successfully completed',
      },
    }
  )
  // Track gift attempt event (links gifter to recipient for gift payments)
  .post(
    '/gift-attempt',
    async ({ body, set }) => {
      try {
        const { gifter_id, recipient_id } = body;

        // Конвертируем gifter_id в число для bigint поля
        const gifterIdNum = parseInt(gifter_id, 10);
        if (isNaN(gifterIdNum)) {
          throw new Error('Invalid gifter_id');
        }

        await db.insert(paymentAnalytics).values({
          telegramId: gifterIdNum,
          eventType: 'gift_attempt',
          metadata: {
            recipient_id,
            gifter_id,
          },
        });

        logger.info(
          {
            gifter_id,
            recipient_id,
            event: 'gift_attempt',
          },
          'Gift attempt tracked'
        );

        return {
          success: true,
          message: 'Gift attempt tracked',
        };
      } catch (error) {
        logger.error({ error, body }, 'Failed to track gift attempt');
        set.status = 500;
        return {
          success: false,
          error: 'Failed to track gift attempt',
        };
      }
    },
    {
      body: t.Object({
        gifter_id: t.String(),
        recipient_id: t.String(),
      }),
      detail: {
        summary: 'Track gift attempt event',
        description: 'Logs when a user opens the gift payment form, linking gifter to recipient',
      },
    }
  )
  // 🆕 Check 3-month cooldown for ex-subscribers
  .get(
    '/check-cooldown',
    async ({ query, set }) => {
      try {
        const telegramId = parseInt(query.telegram_id, 10);
        if (isNaN(telegramId)) {
          set.status = 400;
          return { success: false, error: 'Invalid telegram_id' };
        }

        const user = await db.query.users.findFirst({
          where: eq(users.telegramId, telegramId),
        });

        // Нет пользователя или никогда не платил — кулдауна нет
        if (!user || !user.subscriptionExpires) {
          return { success: true, blocked: false };
        }

        // Активная подписка — кулдауна нет
        if (user.isPro) {
          return { success: true, blocked: false };
        }

        // isPro = false + subscriptionExpires существует = бывший подписчик
        // Кулдаун: 90 дней с момента истечения, но только если прошло больше 7 дней (grace period)
        const expiryDate = new Date(user.subscriptionExpires);
        const gracePeriodEnd = new Date(expiryDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        const cooldownEnd = new Date(expiryDate.getTime() + 90 * 24 * 60 * 60 * 1000);
        const now = new Date();

        if (now > gracePeriodEnd && now < cooldownEnd) {
          // Форматируем дату для отображения: DD.MM.YYYY
          const day = String(cooldownEnd.getDate()).padStart(2, '0');
          const month = String(cooldownEnd.getMonth() + 1).padStart(2, '0');
          const year = cooldownEnd.getFullYear();
          const unlockDate = `${day}.${month}.${year}`;

          return {
            success: true,
            blocked: true,
            unlock_date: unlockDate,
            first_name: user.firstName || null,
          };
        }

        // Кулдаун прошёл
        return { success: true, blocked: false };
      } catch (error) {
        logger.error({ error, query }, 'Failed to check cooldown');
        set.status = 500;
        return { success: false, error: 'Failed to check cooldown' };
      }
    },
    {
      query: t.Object({
        telegram_id: t.String(),
      }),
      detail: {
        summary: 'Check 3-month cooldown for ex-subscribers',
        description: 'Returns whether the user is blocked from re-subscribing due to 3-month cooldown after subscription expiry',
      },
    }
  );

