import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { users, payments, paymentAnalytics } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { startOnboardingAfterPayment, handleGiftPaymentSuccess } from '@/modules/bot/post-payment-funnels';

export const lavaPaymentWebhook = new Elysia({ prefix: '/webhooks' })
  // Lava payment success webhook
  .post(
    '/lava-payment-success',
    async ({ body, set }) => {
      try {
        logger.info({ body }, 'Received Lava payment webhook');

        const {
          email,
          payment_method,
          amount,
          contact_id, // Lava contact_id for subscription management
        } = body;

        // Validate required fields
        if (!email) {
          logger.error({ body }, 'Missing email in webhook');
          set.status = 400;
          return { success: false, error: 'Missing email' };
        }

        // Normalize email
        const normalizedEmail = email.toLowerCase().trim();

        // ==========================================
        // GIFT PAYMENT HANDLING
        // ==========================================
        // Если email заканчивается на @gift.local - это подарочная подписка
        if (normalizedEmail.endsWith('@gift.local')) {
          // Парсим recipient_id из email (формат: {recipient_id}@gift.local)
          const recipientTgId = normalizedEmail.replace('@gift.local', '');

          if (!recipientTgId) {
            logger.error({ email: normalizedEmail }, 'Missing recipient_id for gift payment');
            set.status = 400;
            return { success: false, error: 'Missing recipient_id' };
          }

          // Найти gift_attempt чтобы узнать кто даритель
          const [giftAttempt] = await db
            .select()
            .from(paymentAnalytics)
            .where(eq(paymentAnalytics.eventType, 'gift_attempt'))
            .orderBy(desc(paymentAnalytics.createdAt))
            .limit(100); // Берем последние 100 и ищем нужный

          // Ищем gift_attempt с нужным recipient_id в metadata
          const allGiftAttempts = await db
            .select()
            .from(paymentAnalytics)
            .where(eq(paymentAnalytics.eventType, 'gift_attempt'))
            .orderBy(desc(paymentAnalytics.createdAt))
            .limit(100);

          const matchingAttempt = allGiftAttempts.find(attempt => {
            const metadata = attempt.metadata as Record<string, any>;
            return metadata?.recipient_id === recipientTgId;
          });

          if (!matchingAttempt) {
            logger.error({ recipientTgId }, 'No gift_attempt found for this recipient');
            set.status = 400;
            return { success: false, error: 'No gift attempt found for this recipient' };
          }

          const gifterTgId = (matchingAttempt.metadata as Record<string, any>)?.gifter_id;

          logger.info({ recipientTgId, gifterTgId, amount }, 'Processing gift payment');

          // Найти дарителя
          const [gifter] = await db
            .select()
            .from(users)
            .where(eq(users.telegramId, gifterTgId))
            .limit(1);

          if (!gifter) {
            logger.error({ gifterTgId }, 'Gifter not found');
            set.status = 400;
            return { success: false, error: 'Gifter not found' };
          }

          // Найти или создать получателя
          let [recipient] = await db
            .select()
            .from(users)
            .where(eq(users.telegramId, recipientTgId))
            .limit(1);

          if (!recipient) {
            // Создаем пользователя для получателя (он еще не взаимодействовал с ботом)
            const [newRecipient] = await db
              .insert(users)
              .values({
                telegramId: recipientTgId,
                isPro: true,
                subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                firstPurchaseDate: new Date(),
                metadata: {
                  gifted_by: gifterTgId,
                  gift_date: new Date().toISOString(),
                },
              })
              .returning();
            recipient = newRecipient;
            logger.info({ recipientTgId, recipientId: recipient.id }, 'Created new user for gift recipient');
          } else {
            // Обновляем существующего получателя
            const currentMetadata = (recipient.metadata as Record<string, any>) || {};
            const [updatedRecipient] = await db
              .update(users)
              .set({
                isPro: true,
                subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                updatedAt: new Date(),
                firstPurchaseDate: recipient.firstPurchaseDate || new Date(),
                metadata: {
                  ...currentMetadata,
                  gifted_by: gifterTgId,
                  gift_date: new Date().toISOString(),
                },
              })
              .where(eq(users.id, recipient.id))
              .returning();
            recipient = updatedRecipient;
          }

          // Создаем запись платежа (привязан к дарителю)
          const [payment] = await db
            .insert(payments)
            .values({
              userId: gifter.id,
              amount: amount ? amount.toString() : '2000',
              currency: payment_method || 'RUB',
              status: 'completed',
              paymentProvider: 'lava',
              metadata: {
                tariff: 'club2000_gift',
                gift_recipient_id: recipientTgId,
                gift_recipient_user_id: recipient.id,
                payment_method: payment_method || null,
              },
              completedAt: new Date(),
            })
            .returning();

          // Track в аналитике
          await db.insert(paymentAnalytics).values({
            telegramId: gifterTgId,
            eventType: 'gift_payment_success',
            paymentId: payment.id,
            paymentMethod: payment_method || 'RUB',
            amount: amount ? amount.toString() : '2000',
            currency: payment_method || 'RUB',
            metadata: {
              tariff: 'club2000_gift',
              recipient_tg_id: recipientTgId,
              recipient_user_id: recipient.id,
            },
          });

          logger.info(
            {
              gifterId: gifter.id,
              gifterTgId,
              recipientId: recipient.id,
              recipientTgId,
              paymentId: payment.id,
              amount,
            },
            'Gift payment processed successfully'
          );

          // Отправить уведомления (дарителю и получателю)
          try {
            await handleGiftPaymentSuccess(
              gifter.id,
              parseInt(recipientTgId),
              parseInt(gifterTgId),
              payment.id
            );
          } catch (error) {
            logger.error({ error }, 'Failed to send gift notifications');
          }

          return {
            success: true,
            message: 'Gift payment processed successfully',
            gifterId: gifter.id,
            recipientId: recipient.id,
            paymentId: payment.id,
          };
        }

        // ==========================================
        // REGULAR PAYMENT HANDLING (existing logic)
        // ==========================================

        // Find the last payment_attempt by this email
        const [lastAttempt] = await db
          .select()
          .from(paymentAnalytics)
          .where(
            and(
              eq(paymentAnalytics.email, normalizedEmail),
              eq(paymentAnalytics.eventType, 'payment_attempt')
            )
          )
          .orderBy(desc(paymentAnalytics.createdAt))
          .limit(1);

        if (!lastAttempt) {
          logger.error({ email: normalizedEmail }, 'No payment_attempt found for this email');
          set.status = 400;
          return { success: false, error: 'No payment attempt found for this email' };
        }

        // Extract data from payment_attempt
        const telegram_id = lastAttempt.telegramId;
        const name = lastAttempt.name;
        const phone = lastAttempt.phone;
        const utm_campaign = lastAttempt.utmCampaign;
        const utm_medium = lastAttempt.utmMedium;
        const utm_source = lastAttempt.utmSource;
        const utm_content = lastAttempt.utmContent;
        const client_id = lastAttempt.clientId;
        const metka = lastAttempt.metka;

        logger.info(
          {
            email: normalizedEmail,
            telegram_id,
            name,
            phone,
            metka
          },
          'Found payment_attempt data'
        );

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
              email: normalizedEmail || null,
              phone: phone || null,
              isPro: true,
              subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
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

          // Update email and phone if provided
          if (normalizedEmail && !user.email) {
            updateData.email = normalizedEmail;
          }
          if (phone && !user.phone) {
            updateData.phone = phone;
          }

          // Set firstPurchaseDate if this is the first purchase
          if (!user.firstPurchaseDate) {
            updateData.firstPurchaseDate = new Date();
          }

          // Update metadata with UTM if not already set
          const currentMetadata = (user.metadata as Record<string, any>) || {};
          updateData.metadata = {
            ...currentMetadata,
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
            currency: payment_method || 'RUB',
            status: 'completed',
            paymentProvider: 'lava',
            externalPaymentId: null,
            lavaContactId: contact_id || null,
            name: name || null,
            email: normalizedEmail || null,
            phone: phone || null,
            metadata: {
              tariff: 'club2000',
              payment_method: payment_method || null,
              utm_campaign: utm_campaign || null,
              utm_medium: utm_medium || null,
              utm_source: utm_source || null,
              utm_content: utm_content || null,
              client_id: client_id || null,
              metka: metka || null,
            },
            completedAt: new Date(),
          })
          .returning();

        // Track payment success in analytics
        await db.insert(paymentAnalytics).values({
          telegramId: telegram_id.toString(),
          eventType: 'payment_success',
          paymentId: payment.id,
          paymentMethod: payment_method || 'RUB',
          amount: amount ? amount.toString() : '0',
          currency: payment_method || 'RUB',
          name: name || null,
          email: normalizedEmail || null,
          phone: phone || null,
          utmCampaign: utm_campaign || null,
          utmMedium: utm_medium || null,
          utmSource: utm_source || null,
          utmContent: utm_content || null,
          clientId: client_id || null,
          metka: metka || null,
          metadata: {
            tariff: 'club2000',
            contact_id: contact_id || null,
          },
        });

        logger.info(
          {
            userId: user.id,
            telegramId: telegram_id,
            paymentId: payment.id,
            amount,
            email: normalizedEmail,
            metka,
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
        email: t.String(), // Email пользователя (ключ для поиска payment_attempt) или {recipient_id}@gift.local для подарков
        payment_method: t.Optional(t.String()), // RUB, USD, EUR
        amount: t.Optional(t.Union([t.String(), t.Number()])), // Сумма платежа
        contact_id: t.Optional(t.String()), // Lava contact_id для управления подпиской
      }),
      detail: {
        summary: 'Lava payment success webhook',
        description: 'Handles successful payment notifications from Lava payment provider. Uses email to find payment_attempt and get all user data. For gift payments, email should be {recipient_id}@gift.local - gifter is found from gift_attempt analytics.',
      },
    }
  );
