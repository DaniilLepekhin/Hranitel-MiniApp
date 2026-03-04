import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { users, payments, paymentAnalytics, giftSubscriptions, decadeMembers } from '@/db/schema';
import { eq, and, desc, isNull, ilike } from 'drizzle-orm';
import { decadesService } from '@/services/decades.service';
import { logger } from '@/utils/logger';
import { startOnboardingAfterPayment, handleGiftPaymentSuccess, sendDecadeInviteNotification, activateGiftSubscription } from '@/modules/bot/post-payment-funnels';
import { processReferralBonus } from '@/modules/bot/referral-funnel';
import { subscriptionGuardService } from '@/services/subscription-guard.service';
import { withLock } from '@/utils/distributed-lock';
import { getcourseService } from '@/services/getcourse.service';
import { energiesService } from '@/modules/energy-points/service';
import { nanoid } from 'nanoid';

export const lavaPaymentWebhook = new Elysia({ prefix: '/webhooks' })
  // Lava payment success webhook
  .post(
    '/lava-payment-success',
    async ({ body, set }) => {
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

      // Use distributed lock to prevent duplicate payment processing
      const lockKey = `payment:lava:${normalizedEmail}`;
      try {
        const result = await withLock(lockKey, async () => {
          logger.info({ body }, 'Received Lava payment webhook (lock acquired)');

        // ==========================================
        // GIFT PAYMENT HANDLING
        // ==========================================
        // Если email содержит _giftclub@mail.ru - это подарочная подписка
        // Формат: {recipient_id}_giftclub@mail.ru
        if (normalizedEmail.includes('_giftclub@mail.ru')) {
          // Парсим recipient_id из email
          const recipientTgId = normalizedEmail.replace('_giftclub@mail.ru', '');

          if (!recipientTgId) {
            logger.error({ email: normalizedEmail }, 'Missing recipient_id for gift payment');
            set.status = 400;
            return { success: false, error: 'Missing recipient_id' };
          }

          // Найти payment_attempt по email чтобы узнать кто даритель
          const [paymentAttempt] = await db
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

          if (!paymentAttempt) {
            // Fallback: payment_attempt не найден — даритель неизвестен.
            // Всё равно сохраняем gift_subscriptions чтобы получатель мог активировать подарок.
            logger.warn({ email: normalizedEmail }, 'No payment_attempt found for gift payment — creating gift record without gifter');

            const [fallbackPayment] = await db
              .insert(payments)
              .values({
                userId: null,
                amount: amount ? amount.toString() : '2000',
                currency: payment_method || 'RUB',
                status: 'completed',
                paymentProvider: 'lava',
                email: normalizedEmail,
                metadata: {
                  tariff: 'club2000_gift',
                  gift_recipient_id: recipientTgId,
                  payment_method: payment_method || null,
                  no_gifter_found: true,
                },
                completedAt: new Date(),
              })
              .returning();

            const fallbackToken = nanoid(16);
            await db.insert(giftSubscriptions).values({
              gifterUserId: null,
              recipientTgId: parseInt(recipientTgId),
              paymentId: fallbackPayment.id,
              activated: false,
              activationToken: fallbackToken,
            });

            logger.warn(
              { recipientTgId, fallbackToken, paymentId: fallbackPayment.id },
              'Gift subscription created without gifter (fallback). Recipient can still activate.'
            );

            // 🚀 Умная активация для fallback (без дарителя)
            const [recipientExists1] = await db.select({ id: users.id }).from(users)
              .where(eq(users.telegramId, parseInt(recipientTgId))).limit(1);
            if (recipientExists1) {
              try {
                await activateGiftSubscription(parseInt(recipientTgId), parseInt(recipientTgId));
                logger.info({ recipientTgId }, 'Gift auto-activated (no gifter fallback, recipient in bot)');
              } catch (error) {
                logger.error({ error, recipientTgId }, 'Failed to auto-activate gift (no gifter fallback)');
              }
            } else {
              logger.info({ recipientTgId }, 'Recipient not in bot (no gifter fallback) — will activate on link click');
            }

            return {
              success: true,
              message: 'Gift payment recorded (no gifter found)',
              recipientTgId,
              paymentId: fallbackPayment.id,
            };
          }

          const gifterTgId = paymentAttempt.telegramId;

          logger.info({ recipientTgId, gifterTgId, amount }, 'Processing gift payment');

          // Найти дарителя
          const [gifter] = await db
            .select()
            .from(users)
            .where(eq(users.telegramId, gifterTgId))
            .limit(1);

          if (!gifter) {
            // Даритель есть в аналитике но нет в users — создаём gift_subscriptions без gifterUserId
            logger.warn({ gifterTgId }, 'Gifter found in analytics but not in users — creating gift record without gifter');

            const [noGifterPayment] = await db
              .insert(payments)
              .values({
                userId: null,
                amount: amount ? amount.toString() : '2000',
                currency: payment_method || 'RUB',
                status: 'completed',
                paymentProvider: 'lava',
                email: normalizedEmail,
                metadata: {
                  tariff: 'club2000_gift',
                  gift_recipient_id: recipientTgId,
                  gifter_tg_id: gifterTgId,
                  payment_method: payment_method || null,
                  gifter_not_in_users: true,
                },
                completedAt: new Date(),
              })
              .returning();

            const noGifterToken = nanoid(16);
            await db.insert(giftSubscriptions).values({
              gifterUserId: null,
              recipientTgId: parseInt(recipientTgId),
              paymentId: noGifterPayment.id,
              activated: false,
              activationToken: noGifterToken,
            });

            logger.warn(
              { recipientTgId, noGifterToken, gifterTgId, paymentId: noGifterPayment.id },
              'Gift subscription created without gifter user (gifter_tg_id logged). Recipient can still activate.'
            );

            // 🚀 Умная активация для fallback (даритель не в users)
            const [recipientExists2] = await db.select({ id: users.id }).from(users)
              .where(eq(users.telegramId, parseInt(recipientTgId))).limit(1);
            if (recipientExists2) {
              try {
                await activateGiftSubscription(parseInt(recipientTgId), parseInt(recipientTgId));
                logger.info({ recipientTgId }, 'Gift auto-activated (gifter not in users fallback, recipient in bot)');
              } catch (error) {
                logger.error({ error, recipientTgId }, 'Failed to auto-activate gift (gifter not in users fallback)');
              }
            } else {
              logger.info({ recipientTgId }, 'Recipient not in bot (gifter not in users fallback) — will activate on link click');
            }

            return {
              success: true,
              message: 'Gift payment recorded (gifter not in users)',
              recipientTgId,
              paymentId: noGifterPayment.id,
            };
          }

          // НЕ активируем подписку получателю сразу!
          // Подписка активируется когда получатель перейдет по ссылке /start=present_{tg_id}

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
                payment_method: payment_method || null,
              },
              completedAt: new Date(),
            })
            .returning();

          // Track в аналитике (activated: false - активируется когда получатель перейдет по ссылке)
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
              gifter_tg_id: gifterTgId,
              activated: false,
            },
          });

          // 🆕 Создаём запись в gift_subscriptions для надёжной активации
          const activationToken = nanoid(16);
          await db.insert(giftSubscriptions).values({
            gifterUserId: gifter.id,
            recipientTgId: parseInt(recipientTgId),
            paymentId: payment.id,
            activated: false,
            activationToken,
          });

          logger.info({ recipientTgId, activationToken }, 'Gift subscription record created');

          logger.info(
            {
              gifterId: gifter.id,
              gifterTgId,
              recipientTgId,
              paymentId: payment.id,
              amount,
            },
            'Gift payment processed successfully'
          );

          // 🚀 Умная активация:
          // - Если получатель уже в боте → активируем сразу + онбординг
          // - Если нет → шлём дарителю ссылку для пересылки → активируется по клику
          const [existingRecipient] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.telegramId, parseInt(recipientTgId)))
            .limit(1);

          if (existingRecipient) {
            // Получатель в боте — авто-активируем
            try {
              await activateGiftSubscription(parseInt(recipientTgId), parseInt(recipientTgId));
              logger.info({ recipientTgId }, 'Gift subscription auto-activated (recipient in bot)');
              // Уведомить дарителя — всё готово
              try {
                await handleGiftPaymentSuccess(gifter.id, parseInt(recipientTgId), gifterTgId, payment.id, true);
              } catch (err) {
                logger.error({ err }, 'Failed to notify gifter after auto-activation');
              }
            } catch (error) {
              logger.error({ error, recipientTgId }, 'Auto-activation failed despite recipient in bot — falling back to link');
              // Fallback: шлём ссылку дарителю
              try {
                await handleGiftPaymentSuccess(gifter.id, parseInt(recipientTgId), gifterTgId, payment.id, false);
              } catch (err) {
                logger.error({ err }, 'Failed to send fallback gift link to gifter');
              }
            }
          } else {
            // Получатель ещё не в боте — шлём дарителю ссылку для пересылки
            // Когда получатель перейдёт по ссылке — активируется автоматически
            logger.info({ recipientTgId }, 'Recipient not in bot — sending forward link to gifter');
            try {
              await handleGiftPaymentSuccess(gifter.id, parseInt(recipientTgId), gifterTgId, payment.id, false);
            } catch (err) {
              logger.error({ err }, 'Failed to send gift link to gifter');
            }
          }

          return {
            success: true,
            message: 'Gift payment processed successfully',
            gifterId: gifter.id,
            recipientTgId,
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

        // ==========================================
        // AUTO-RENEWAL HANDLING
        // ==========================================
        // Если payment_attempt не найден — это автоматическое продление (auto-renewal) от Lava.
        // Пользователь не открывал форму оплаты, поэтому payment_attempt отсутствует.
        // Ищем пользователя напрямую по email в таблице users.
        if (!lastAttempt) {
          logger.info({ email: normalizedEmail }, 'No payment_attempt found — treating as auto-renewal, looking up user by email');

          const [autoRenewalUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, normalizedEmail))
            .limit(1);

          if (!autoRenewalUser) {
            logger.error({ email: normalizedEmail }, 'No user found by email for auto-renewal');
            set.status = 400;
            return { success: false, error: 'No user found for auto-renewal' };
          }

          const autoTgId = autoRenewalUser.telegramId;
          logger.info({ email: normalizedEmail, telegramId: autoTgId }, 'Processing auto-renewal for user');

          // Продлить подписку на 30 дней от текущего значения (или от сейчас, если истекла)
          const currentExpiry = autoRenewalUser.subscriptionExpires
            ? new Date(autoRenewalUser.subscriptionExpires)
            : new Date();
          const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()) + 30 * 24 * 60 * 60 * 1000);

          const [updatedAutoUser] = await db
            .update(users)
            .set({
              isPro: true,
              subscriptionExpires: newExpiry,
              updatedAt: new Date(),
              ...(contact_id ? { lavaContactId: contact_id } : {}),
            })
            .where(eq(users.id, autoRenewalUser.id))
            .returning();

          // Создать запись платежа
          const [autoPayment] = await db
            .insert(payments)
            .values({
              userId: autoRenewalUser.id,
              amount: amount ? amount.toString() : '0',
              currency: payment_method || 'RUB',
              status: 'completed',
              paymentProvider: 'lava',
              lavaContactId: contact_id || null,
              email: normalizedEmail,
              metadata: {
                tariff: 'club2000',
                payment_method: payment_method || null,
                auto_renewal: true,
              },
              completedAt: new Date(),
            })
            .returning();

          // Track в аналитике
          await db.insert(paymentAnalytics).values({
            telegramId: autoTgId,
            eventType: 'payment_success',
            paymentId: autoPayment.id,
            paymentMethod: payment_method || 'RUB',
            amount: amount ? amount.toString() : '0',
            currency: payment_method || 'RUB',
            email: normalizedEmail,
            metadata: {
              tariff: 'club2000',
              auto_renewal: true,
              contact_id: contact_id || null,
            },
          });

          // Начислить 500 Энергии за продление
          try {
            await energiesService.award(autoRenewalUser.id, 500, 'Продление подписки', {
              source: 'payment',
              paymentId: autoPayment.id,
            });
            logger.info({ userId: autoRenewalUser.id, telegramId: autoTgId }, 'Awarded 500 energy for auto-renewal');
          } catch (error) {
            logger.error({ error, telegramId: autoTgId }, 'Failed to award energy for auto-renewal');
          }

          // Разбанить пользователя если нужно
          try {
            await subscriptionGuardService.unbanUserFromAllChats(autoTgId);
          } catch (error) {
            logger.error({ error, telegramId: autoTgId }, 'Failed to unban user after auto-renewal');
          }

          // 🔄 Восстановить в десятку если была исключена
          try {
            const restoreResult = await decadesService.restoreUserToDecade(autoRenewalUser.id, autoTgId);
            if (restoreResult.restored) {
              logger.info({ telegramId: autoTgId, userId: autoRenewalUser.id, decadeName: restoreResult.decadeName }, 'Restored user to decade after auto-renewal');
              // Отправить ссылку-приглашение если есть
              if (restoreResult.inviteLink && restoreResult.decadeName) {
                await sendDecadeInviteNotification(autoTgId, restoreResult.decadeName, restoreResult.inviteLink);
              }
            } else {
              logger.info({ telegramId: autoTgId, userId: autoRenewalUser.id, reason: restoreResult.error }, 'No decade restored after auto-renewal');
            }
          } catch (error) {
            logger.error({ error, telegramId: autoTgId }, 'Failed to restore user to decade after auto-renewal');
          }

          logger.info(
            { userId: autoRenewalUser.id, telegramId: autoTgId, paymentId: autoPayment.id, newExpiry },
            'Auto-renewal processed successfully'
          );

          return {
            success: true,
            message: 'Auto-renewal processed successfully',
            userId: autoRenewalUser.id,
            paymentId: autoPayment.id,
          };
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
        const attemptMetadata = lastAttempt.metadata as Record<string, any> | null;
        const code_word = attemptMetadata?.code_word || null;

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
          .where(eq(users.telegramId, telegram_id))
          .limit(1);

        let user = existingUsers[0];

        if (!user) {
          logger.warn({ telegram_id }, 'User not found, creating new user');

          // Create new user
          const [newUser] = await db
            .insert(users)
            .values({
              telegramId: telegram_id,
              email: normalizedEmail || null,
              phone: phone || null,
              isPro: true,
              subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              lavaContactId: contact_id || null,
              firstPurchaseDate: new Date(),
              codeWord: code_word || null,
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
          // Продлеваем от текущей даты истечения (если ещё активна) или от сейчас
          const currentExpiry = user.subscriptionExpires ? new Date(user.subscriptionExpires) : new Date();
          const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()) + 30 * 24 * 60 * 60 * 1000);
          const updateData: any = {
            isPro: true,
            subscriptionExpires: newExpiry,
            updatedAt: new Date(),
          };

          // Store Lava contact_id if provided
          if (contact_id) {
            updateData.lavaContactId = contact_id;
          }

          // Update code_word only if provided (don't erase on renewal)
          if (code_word) {
            updateData.codeWord = code_word;
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

        // 🔗 Link orphaned payments: если email пользователя совпадает с unlinked completed payment
        // (такое бывает, когда человек заплатил, но webhook не нашёл его в системе — e.g. не запускал бот)
        const emailToCheck = normalizedEmail || user.email;
        if (emailToCheck) {
          try {
            const orphanedPayments = await db
              .select()
              .from(payments)
              .where(
                and(
                  isNull(payments.userId),
                  eq(payments.status, 'completed'),
                  ilike(payments.email, emailToCheck)
                )
              );

            if (orphanedPayments.length > 0) {
              for (const orphan of orphanedPayments) {
                await db
                  .update(payments)
                  .set({ userId: user.id })
                  .where(eq(payments.id, orphan.id));
              }
              logger.info(
                { userId: user.id, telegramId: telegram_id, email: emailToCheck, count: orphanedPayments.length },
                'Linked orphaned payments to user'
              );
            }
          } catch (error) {
            logger.error({ error, telegramId: telegram_id }, 'Failed to link orphaned payments');
            // Не фейлим webhook — основной платёж уже обработан
          }
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
          telegramId: telegram_id,
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

        // ⚡ Начислить +500 Энергии за оплату/продление клуба (по документу "Геймификация")
        try {
          await energiesService.award(user.id, 500, 'Продление подписки', {
            source: 'payment',
            paymentId: payment.id,
          });
          logger.info({ userId: user.id, telegramId: telegram_id }, 'Awarded 500 energy for payment');
        } catch (error) {
          logger.error({ error, telegramId: telegram_id }, 'Failed to award energy for payment');
          // Don't fail the webhook - payment is already processed
        }

        // 🤝 Referral bonus: if the user came via a referral link, credit the agent
        try {
          const userMeta = (user.metadata as Record<string, any>) || {};
          const refCode = userMeta.ref_code || attemptMetadata?.ref_code || null;
          if (refCode) {
            await processReferralBonus(telegram_id, user.id, payment.id, refCode);
            logger.info({ telegramId: telegram_id, refCode }, 'Referral bonus processed');
          }
        } catch (error) {
          logger.error({ error, telegramId: telegram_id }, 'Failed to process referral bonus');
          // Don't fail the webhook
        }

        // 🛡️ Unban user from all protected chats (in case they were banned for expired subscription)
        try {
          await subscriptionGuardService.unbanUserFromAllChats(telegram_id);
          logger.info({ telegramId: telegram_id }, 'User unbanned from all chats after payment');
        } catch (error) {
          logger.error({ error, telegramId: telegram_id }, 'Failed to unban user from chats');
          // Don't fail the webhook - payment is already processed
        }

        // 🔄 Restore user to decade if they were removed (with capacity check)
        try {
          const restoreResult = await decadesService.restoreUserToDecade(user.id, telegram_id);
          if (restoreResult.restored) {
            logger.info({ telegramId: telegram_id, userId: user.id, decadeName: restoreResult.decadeName }, 'Restored user to decade after payment');
            // Отправить ссылку-приглашение если есть
            if (restoreResult.inviteLink && restoreResult.decadeName) {
              await sendDecadeInviteNotification(telegram_id, restoreResult.decadeName, restoreResult.inviteLink);
            }
          } else {
            logger.info({ telegramId: telegram_id, userId: user.id, reason: restoreResult.error }, 'No decade restored after payment');
          }
        } catch (error) {
          logger.error({ error, telegramId: telegram_id }, 'Failed to restore user to decade');
          // Don't fail the webhook - payment is already processed
        }

        // 🎓 Send deal to GetCourse
        try {
          const gcResult = await getcourseService.sendClubSubscription(
            normalizedEmail,
            phone,
            name,
            telegram_id,
            {
              utm_source: utm_source || undefined,
              utm_medium: utm_medium || undefined,
              utm_campaign: utm_campaign || undefined,
              utm_content: utm_content || undefined,
              platform_id: client_id || undefined,
            }
          );
          if (gcResult.success) {
            logger.info(
              { telegramId: telegram_id, gcUserId: gcResult.user_id, gcDealId: gcResult.deal_id },
              'Deal created in GetCourse'
            );
          } else {
            logger.warn(
              { telegramId: telegram_id, error: gcResult.error },
              'Failed to create deal in GetCourse'
            );
          }
        } catch (error) {
          logger.error({ error, telegramId: telegram_id }, 'Error sending to GetCourse');
          // Don't fail the webhook - payment is already processed
        }

        // Start post-payment funnel
        try {
          await startOnboardingAfterPayment(user.id, telegram_id);
          logger.info({ userId: user.id, chatId: telegram_id }, 'Post-payment funnel started');
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
        }, { ttl: 60000 }); // 60 second lock

        // Handle lock acquisition failure
        if (result === null) {
          logger.warn({ email: normalizedEmail }, 'Payment webhook skipped - already processing');
          set.status = 409; // Conflict
          return {
            success: false,
            error: 'Payment already being processed',
          };
        }

        return result;
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
  )
  // 🛡️ Cron job для проверки истекших подписок
  // Вызывается ежедневно через GitHub Actions или cron сервис
  .post(
    '/cron/check-expired-subscriptions',
    async ({ headers, set }) => {
      // Простая проверка авторизации через секретный заголовок
      const cronSecret = headers['x-cron-secret'];
      if (cronSecret !== process.env.CRON_SECRET && cronSecret !== 'local-dev-secret') {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      try {
        logger.info('Running expired subscriptions check via cron...');
        const result = await subscriptionGuardService.checkExpiredSubscriptions();

        return {
          success: true,
          message: 'Expired subscriptions check completed',
          processed: result.processed,
          removed: result.removed,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to run expired subscriptions check');
        set.status = 500;
        return {
          success: false,
          error: 'Failed to check expired subscriptions',
        };
      }
    },
    {
      detail: {
        summary: 'Check expired subscriptions (cron)',
        description: 'Removes users with expired subscriptions from channel and city chats. Should be called daily via cron job.',
      },
    }
  )
  // ⚡ Cron job для списания просроченных Энергий (6 месяцев)
  // Вызывается ежедневно через cron
  .post(
    '/cron/process-expired-energies',
    async ({ headers, set }) => {
      const cronSecret = headers['x-cron-secret'];
      if (cronSecret !== process.env.CRON_SECRET && cronSecret !== 'local-dev-secret') {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      try {
        const { energiesService } = await import('@/modules/energy-points/service');
        logger.info('Running expired energies check via cron...');
        const result = await energiesService.processExpiredEnergies();

        return {
          success: true,
          message: 'Expired energies check completed',
          expiredCount: result.expiredCount,
          usersAffected: result.usersAffected,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to process expired energies');
        set.status = 500;
        return {
          success: false,
          error: 'Failed to process expired energies',
        };
      }
    },
    {
      detail: {
        summary: 'Process expired energy points (cron)',
        description: 'Marks energy transactions older than 6 months as expired and decrements user balances. Should be called daily via cron job.',
      },
    }
  );
