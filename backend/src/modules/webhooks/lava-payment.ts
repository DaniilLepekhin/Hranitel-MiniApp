import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { users, payments, paymentAnalytics } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { startOnboardingAfterPayment } from '@/modules/bot/post-payment-funnels';

export const lavaPaymentWebhook = new Elysia({ prefix: '/webhooks' })
  // Lava payment success webhook
  .post(
    '/lava-payment-success',
    async ({ body, set }) => {
      try {
        logger.info({ body }, 'Received Lava payment webhook');

        const {
          telegram_id,
          email,
          amount,
          currency,
          payment_method,
          contact_id, // Lava contact_id for subscription management
          external_payment_id,
          status,
          tariff,
          // UTM parameters
          utm_campaign,
          utm_medium,
          utm_source,
          utm_content,
          client_id,
          metka,
        } = body;

        // Validate required fields
        if (!telegram_id) {
          logger.error({ body }, 'Missing telegram_id in webhook');
          set.status = 400;
          return { success: false, error: 'Missing telegram_id' };
        }

        // Find or create user
        const existingUsers = await db
          .select()
          .from(users)
          .where(eq(users.telegramId, telegram_id.toString()))
          .limit(1);

        let user = existingUsers[0];

        if (!user) {
          logger.warn({ telegram_id }, 'User not found, creating new user');

          // Create new user
          const [newUser] = await db
            .insert(users)
            .values({
              telegramId: telegram_id.toString(),
              isPro: true,
              subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              lavaContactId: contact_id || null,
              firstPurchaseDate: new Date(),
              metadata: {
                email: email || null,
                utm_campaign: utm_campaign || null,
                utm_medium: utm_medium || null,
                utm_source: utm_source || null,
                metka: metka || null,
              },
            })
            .returning();

          user = newUser;
        } else {
          // Update existing user
          const updateData: any = {
            isPro: true,
            subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(),
          };

          // Store Lava contact_id if provided
          if (contact_id) {
            updateData.lavaContactId = contact_id;
          }

          // Set firstPurchaseDate if this is the first purchase
          if (!user.firstPurchaseDate) {
            updateData.firstPurchaseDate = new Date();
          }

          // Update metadata with email and UTM if not already set
          const currentMetadata = (user.metadata as Record<string, any>) || {};
          updateData.metadata = {
            ...currentMetadata,
            email: email || currentMetadata.email,
            utm_campaign: utm_campaign || currentMetadata.utm_campaign,
            utm_medium: utm_medium || currentMetadata.utm_medium,
            utm_source: utm_source || currentMetadata.utm_source,
            metka: metka || currentMetadata.metka,
          };

          const [updatedUser] = await db
            .update(users)
            .set(updateData)
            .where(eq(users.id, user.id))
            .returning();

          user = updatedUser;
        }

        // Create payment record
        const [payment] = await db
          .insert(payments)
          .values({
            userId: user.id,
            amount: amount ? amount.toString() : '0',
            currency: currency || payment_method || 'RUB',
            status: status === 'success' ? 'completed' : 'pending',
            paymentProvider: 'lava',
            externalPaymentId: external_payment_id || null,
            lavaContactId: contact_id || null,
            metadata: {
              tariff: tariff || 'club2000',
              email: email || null,
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
          .returning();

        // Track payment success in analytics
        const finalMetka = metka || [utm_campaign, utm_medium].filter(p => p).join('_');

        await db.insert(paymentAnalytics).values({
          telegramId: telegram_id.toString(),
          eventType: 'payment_success',
          paymentId: payment.id,
          paymentMethod: payment_method || currency || 'RUB',
          amount: amount ? amount.toString() : '0',
          currency: currency || payment_method || 'RUB',
          utmCampaign: utm_campaign || null,
          utmMedium: utm_medium || null,
          utmSource: utm_source || null,
          utmContent: utm_content || null,
          clientId: client_id || null,
          metka: finalMetka || null,
          metadata: {
            tariff: tariff || 'club2000',
            contact_id: contact_id || null,
          },
        });

        logger.info(
          {
            userId: user.id,
            telegramId: telegram_id,
            paymentId: payment.id,
            amount,
            currency,
            metka: finalMetka,
          },
          'Payment processed successfully'
        );

        // Start post-payment funnel
        try {
          const chatId = parseInt(telegram_id);
          await startOnboardingAfterPayment(user.id, chatId);
          logger.info({ userId: user.id, chatId }, 'Post-payment funnel started');
        } catch (error) {
          logger.error(
            { error, userId: user.id, telegramId: telegram_id },
            'Failed to start post-payment funnel'
          );
          // Don't fail the webhook - payment is already processed
        }

        return {
          success: true,
          message: 'Payment processed successfully',
          userId: user.id,
          paymentId: payment.id,
        };
      } catch (error) {
        logger.error({ error, body }, 'Failed to process Lava payment webhook');
        set.status = 500;
        return {
          success: false,
          error: 'Failed to process payment',
        };
      }
    },
    {
      body: t.Object({
        telegram_id: t.String(),
        email: t.Optional(t.String()),
        amount: t.Optional(t.Union([t.String(), t.Number()])),
        currency: t.Optional(t.String()),
        payment_method: t.Optional(t.String()),
        contact_id: t.Optional(t.String()), // Lava contact_id
        external_payment_id: t.Optional(t.String()),
        status: t.Optional(t.String()),
        tariff: t.Optional(t.String()),
        // UTM parameters
        utm_campaign: t.Optional(t.String()),
        utm_medium: t.Optional(t.String()),
        utm_source: t.Optional(t.String()),
        utm_content: t.Optional(t.String()),
        client_id: t.Optional(t.String()),
        metka: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Lava payment success webhook',
        description: 'Handles successful payment notifications from Lava payment provider',
      },
    }
  );
