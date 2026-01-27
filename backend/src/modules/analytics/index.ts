import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { paymentAnalytics, payments, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger';

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

        // Create metka if not provided
        const finalMetka = metka || [utm_campaign, utm_medium].filter(p => p).join('_');

        await db.insert(paymentAnalytics).values({
          telegramId: telegram_id,
          eventType: 'form_open',
          utmCampaign: utm_campaign || null,
          utmMedium: utm_medium || null,
          utmSource: utm_source || null,
          utmContent: utm_content || null,
          clientId: client_id || null,
          metka: finalMetka || null,
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
        } = body;

        // Create metka if not provided
        const finalMetka = metka || [utm_campaign, utm_medium].filter(p => p).join('_');

        await db.insert(paymentAnalytics).values({
          telegramId: telegram_id,
          eventType: 'payment_attempt',
          paymentMethod: payment_method,
          amount: amount,
          currency: currency || payment_method, // Use payment_method as currency if not provided
          utmCampaign: utm_campaign || null,
          utmMedium: utm_medium || null,
          utmSource: utm_source || null,
          utmContent: utm_content || null,
          clientId: client_id || null,
          metka: finalMetka || null,
          name: name || null,
          email: email ? email.toLowerCase().trim() : null,
          phone: phone || null,
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

        return {
          success: true,
          message: 'Payment attempt tracked',
        };
      } catch (error) {
        logger.error({ error, body }, 'Failed to track payment attempt');
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

        await db.insert(paymentAnalytics).values({
          telegramId: telegram_id,
          eventType: 'payment_success',
          paymentId: payment_id || null,
          paymentMethod: payment_method,
          amount: amount,
          currency: currency || payment_method,
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

        await db.insert(paymentAnalytics).values({
          telegramId: gifter_id,
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
  );
