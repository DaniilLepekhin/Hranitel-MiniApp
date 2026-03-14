import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { users, payments, paymentAnalytics } from '@/db/schema';
import { eq, or, ilike } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { energiesService } from '@/modules/energy-points/service';
import { subscriptionGuardService } from '@/services/subscription-guard.service';
import { decadesService } from '@/services/decades.service';
import { invalidateUserCache } from '@/utils/cache-invalidation';

// GetCourse передаёт дату в формате "13 марта" (день + месяц по-русски в родительном падеже)
const MONTHS: Record<string, string> = {
  'января': '01', 'февраля': '02', 'марта': '03',
  'апреля': '04', 'мая': '05', 'июня': '06',
  'июля': '07', 'августа': '08', 'сентября': '09',
  'октября': '10', 'ноября': '11', 'декабря': '12',
};

function parseGetCourseDate(raw: string): Date | null {
  try {
    const parts = raw.trim().split(' ');
    if (parts.length !== 2) return null;
    const [day, monthName] = parts;
    const month = MONTHS[monthName.toLowerCase()];
    if (!month) return null;
    const year = new Date().getFullYear();
    return new Date(`${year}-${month}-${day.padStart(2, '0')}T00:00:00Z`);
  } catch {
    return null;
  }
}

export const getcourseWebhook = new Elysia({ prefix: '/webhooks' })
  /**
   * POST /api/webhooks/getcourse/payment
   *
   * Входящий хук от GetCourse после успешной оплаты.
   * Параметры передаются в query string: hash, order_id, email, phone, tarif, period, current_date
   * current_date формат: "13 марта" (URL-encoded)
   *
   * Новый URL для GetCourse: https://app.successkod.com/api/webhooks/getcourse/payment
   */
  .post(
    '/getcourse/payment',
    async ({ query, set }) => {
      const { hash, order_id, email, phone, tarif, period, current_date } = query;

      // 1. Валидация хеша (фиксированный shared secret из URL GetCourse)
      const GETCOURSE_WEBHOOK_HASH = '8170c6c60274414632db7a';
      if (hash !== GETCOURSE_WEBHOOK_HASH) {
        logger.warn({ hash }, '[GetCourse] Invalid hash — rejected');
        set.status = 403;
        return { success: false, error: 'Invalid hash' };
      }

      logger.info({ order_id, email, phone, tarif, period, current_date }, '[GetCourse] Incoming payment hook');

      // 2. Парсим период
      const periodDays = parseInt(period || '30', 10);
      if (isNaN(periodDays) || periodDays <= 0) {
        set.status = 400;
        return { success: false, error: 'Invalid period' };
      }

      // 3. Парсим current_date (логирование / запись)
      const parsedDate = current_date ? parseGetCourseDate(decodeURIComponent(current_date)) : null;
      if (current_date && !parsedDate) {
        logger.warn({ current_date }, '[GetCourse] Could not parse current_date, proceeding anyway');
      }

      // 4. Ищем пользователя по email или телефону
      const normalizedEmail = email?.trim().toLowerCase() || null;
      const normalizedPhone = phone?.trim().replace(/\D/g, '') || null;

      const [user] = await db
        .select()
        .from(users)
        .where(
          or(
            normalizedEmail ? ilike(users.email, normalizedEmail) : undefined,
            normalizedPhone ? ilike(users.phone, `%${normalizedPhone.slice(-10)}%`) : undefined,
          )
        )
        .limit(1);

      if (!user) {
        logger.error({ email: normalizedEmail, phone: normalizedPhone }, '[GetCourse] User not found');
        set.status = 404;
        return { success: false, error: 'User not found' };
      }

      const telegramId = user.telegramId;
      logger.info({ userId: user.id, telegramId, email: normalizedEmail }, '[GetCourse] User found');

      // 5. Продлеваем подписку
      const currentExpiry = user.subscriptionExpires ? new Date(user.subscriptionExpires) : new Date();
      const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()) + periodDays * 24 * 60 * 60 * 1000);

      await db
        .update(users)
        .set({ isPro: true, subscriptionExpires: newExpiry, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      // 6. Записываем платёж
      const [payment] = await db
        .insert(payments)
        .values({
          userId: user.id,
          amount: '0',
          currency: 'RUB',
          status: 'completed',
          paymentProvider: 'getcourse',
          email: normalizedEmail,
          metadata: {
            order_id: order_id || null,
            tarif: tarif || null,
            period: periodDays,
            current_date: current_date || null,
          },
        })
        .returning();

      // 7. Аналитика
      await db.insert(paymentAnalytics).values({
        telegramId: telegramId,
        eventType: 'payment_success',
        paymentId: payment.id,
        paymentProvider: 'getcourse',
        amount: '0',
        currency: 'RUB',
        email: normalizedEmail,
        metadata: { order_id, tarif, period: periodDays, current_date },
      });

      // 8. Начисляем энергию (+500)
      try {
        await energiesService.award(user.id, 500, 'Продление подписки', {
          source: 'getcourse',
          orderId: order_id,
        });
        logger.info({ userId: user.id }, '[GetCourse] 500 energy awarded');
      } catch (e) {
        logger.warn({ e }, '[GetCourse] Failed to award energy');
      }

      // 9. Разбаниваем из защищённых чатов
      try {
        await subscriptionGuardService.unbanUserFromAllChats(telegramId, user.id);
      } catch (e) {
        logger.warn({ e }, '[GetCourse] Failed to unban user');
      }

      // 10. Восстанавливаем в десятку
      try {
        await decadesService.restoreUserToDecade(user.id, telegramId);
      } catch (e) {
        logger.warn({ e }, '[GetCourse] Failed to restore decade');
      }

      // 11. Инвалидируем кеш
      try {
        await invalidateUserCache(telegramId, user.id);
      } catch (e) {
        logger.warn({ e }, '[GetCourse] Failed to invalidate cache');
      }

      logger.info(
        { userId: user.id, telegramId, newExpiry, periodDays, orderId: order_id },
        '[GetCourse] Payment processed successfully'
      );

      return {
        success: true,
        user_id: user.id,
        telegram_id: telegramId,
        subscription_expires: newExpiry.toISOString(),
        period_days: periodDays,
      };
    },
    {
      query: t.Object({
        hash: t.String(),
        order_id: t.Optional(t.String()),
        email: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        tarif: t.Optional(t.String()),
        period: t.Optional(t.String()),
        current_date: t.Optional(t.String()),
      }),
    }
  );
