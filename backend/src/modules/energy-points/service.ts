import { db } from '@/db';
import { energyTransactions, users, decadeMembers } from '@/db/schema';
import { eq, desc, and, gte, lt, sql, inArray, isNull } from 'drizzle-orm';
import { logger } from '@/utils/logger';

const ENERGY_LIFETIME_MONTHS = 6; // Срок жизни баллов по документу "Геймификация"
const LEADER_MULTIPLIER = 2; // x2 множитель для лидеров десяток (бадди)

/** Получить текущую полночь по Москве (начало сегодняшнего дня МСК) */
function getMoscowMidnight(): Date {
  const now = new Date();
  // МСК = UTC+3
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  // Обнуляем время до полуночи в МСК
  moscowNow.setUTCHours(0, 0, 0, 0);
  // Переводим обратно в UTC (вычитаем 3 часа) — это 21:00 UTC предыдущего дня
  return new Date(moscowNow.getTime() - 3 * 60 * 60 * 1000);
}

export class EnergyPointsService {
  /**
   * Начислить Энергии (АТОМАРНО)
   * Income-транзакции получают expires_at = created_at + 6 месяцев
   * Используем SELECT ... FOR UPDATE для блокировки строки пользователя
   */
  /**
   * Проверить, является ли пользователь лидером (бадди) активной десятки
   * Результат кэшируется на 5 минут для производительности
   */
  private leaderCache = new Map<string, { isLeader: boolean; cachedAt: number }>();
  private static LEADER_CACHE_TTL = 5 * 60 * 1000; // 5 минут

  async isDecadeLeader(userId: string): Promise<boolean> {
    const cached = this.leaderCache.get(userId);
    if (cached && (Date.now() - cached.cachedAt) < EnergyPointsService.LEADER_CACHE_TTL) {
      return cached.isLeader;
    }

    const [membership] = await db
      .select({ isLeader: decadeMembers.isLeader })
      .from(decadeMembers)
      .where(
        and(
          eq(decadeMembers.userId, userId),
          eq(decadeMembers.isLeader, true),
          isNull(decadeMembers.leftAt)
        )
      )
      .limit(1);

    const isLeader = !!membership;
    this.leaderCache.set(userId, { isLeader, cachedAt: Date.now() });
    return isLeader;
  }

  /**
   * Сбросить кэш статуса лидера для конкретного пользователя
   * Вызывается при смене лидера десятки через admin endpoint
   */
  clearLeaderCache(userId: string): void {
    this.leaderCache.delete(userId);
    logger.info(`[Energies] Leader cache cleared for user ${userId}`);
  }

  /**
   * Сбросить весь кэш лидеров
   */
  clearAllLeaderCache(): void {
    this.leaderCache.clear();
    logger.info('[Energies] All leader cache cleared');
  }

  async award(userId: string, amount: number, reason: string, metadata?: Record<string, any>) {
    try {
      // Проверяем, является ли пользователь лидером десятки (бадди) — x2 множитель
      const isLeader = await this.isDecadeLeader(userId);
      const finalAmount = isLeader ? amount * LEADER_MULTIPLIER : amount;

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + ENERGY_LIFETIME_MONTHS);

      await db.transaction(async (tx) => {
        // Блокируем строку пользователя (FOR UPDATE) — предотвращает параллельные изменения
        const result = await tx.execute(
          sql`SELECT id, energies FROM users WHERE id = ${userId} FOR UPDATE`
        );
        const row = (result.rows?.[0] ?? result[0]) as any;

        if (!row) {
          throw new Error(`User ${userId} not found`);
        }

        const currentBalance = row.energies || 0;

        // Создаем запись о транзакции с expires_at
        await tx.insert(energyTransactions).values({
          userId,
          amount: finalAmount,
          type: 'income',
          reason,
          metadata: {
            ...(metadata || {}),
            ...(isLeader ? { leaderBonus: true, originalAmount: amount, multiplier: LEADER_MULTIPLIER } : {}),
          },
          expiresAt,
          isExpired: false,
        });

        // Атомарно обновляем баланс
        await tx
          .update(users)
          .set({ energies: currentBalance + finalAmount })
          .where(eq(users.id, userId));
      });

      if (isLeader) {
        logger.info(`[Energies] Awarded ${finalAmount} (x${LEADER_MULTIPLIER} leader bonus, base ${amount}) to user ${userId} for: ${reason}`);
      } else {
        logger.info(`[Energies] Awarded ${finalAmount} to user ${userId} for: ${reason} (expires: ${expiresAt.toISOString()})`);
      }

      return { success: true, amount: finalAmount, reason };
    } catch (error) {
      logger.error('[Energies] Error awarding points:', error);
      throw new Error('Failed to award energy points');
    }
  }

  /**
   * Списать Энергии (АТОМАРНО)
   * Expense-транзакции не имеют expires_at (списание не истекает)
   * Используем SELECT ... FOR UPDATE + проверку баланса внутри транзакции
   * Исключает уход баланса в минус при параллельных запросах
   */
  async spend(userId: string, amount: number, reason: string, metadata?: Record<string, any>) {
    try {
      let newBalance: number;

      await db.transaction(async (tx) => {
        // Блокируем строку пользователя (FOR UPDATE) — предотвращает параллельные списания
        const result = await tx.execute(
          sql`SELECT id, energies FROM users WHERE id = ${userId} FOR UPDATE`
        );
        const row = (result.rows?.[0] ?? result[0]) as any;

        if (!row) {
          throw new Error(`User ${userId} not found`);
        }

        const currentBalance = row.energies || 0;

        // Проверка баланса ВНУТРИ транзакции (после блокировки)
        if (currentBalance < amount) {
          throw new Error('Insufficient energy points');
        }

        newBalance = currentBalance - amount;

        await tx.insert(energyTransactions).values({
          userId,
          amount,
          type: 'expense',
          reason,
          metadata: metadata || {},
          // expense не истекает
          expiresAt: null,
          isExpired: false,
        });

        // Атомарно обновляем баланс
        await tx
          .update(users)
          .set({ energies: newBalance })
          .where(eq(users.id, userId));
      });

      logger.info(`[Energies] Spent ${amount} from user ${userId} for: ${reason}`);

      return { success: true, amount, reason, newBalance: newBalance! };
    } catch (error) {
      logger.error('[Energies] Error spending points:', error);
      throw error;
    }
  }

  /**
   * Получить баланс Энергии
   */
  async getBalance(userId: string): Promise<number> {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return user.length > 0 ? user[0].energies || 0 : 0;
    } catch (error) {
      logger.error('[Energies] Error getting balance:', error);
      throw new Error('Failed to get energy points balance');
    }
  }

  /**
   * Получить историю транзакций
   */
  async getHistory(userId: string, limit: number = 50) {
    try {
      const transactions = await db
        .select()
        .from(energyTransactions)
        .where(eq(energyTransactions.userId, userId))
        .orderBy(desc(energyTransactions.createdAt))
        .limit(limit);

      return transactions;
    } catch (error) {
      logger.error('[Energies] Error getting history:', error);
      throw new Error('Failed to get transaction history');
    }
  }

  /**
   * 🕐 Пометить просроченные транзакции как is_expired и пересчитать балансы
   * Вызывается по CRON раз в час/день
   * Записи НЕ удаляются — только помечаются. Можно восстановить вручную.
   */
  async processExpiredEnergies(): Promise<{ expiredCount: number; usersAffected: number }> {
    try {
      const now = new Date();

      // 1. Найти все просроченные, но ещё не помеченные транзакции
      const expired = await db
        .select({
          id: energyTransactions.id,
          userId: energyTransactions.userId,
          amount: energyTransactions.amount,
        })
        .from(energyTransactions)
        .where(
          and(
            eq(energyTransactions.type, 'income'),
            eq(energyTransactions.isExpired, false),
            lt(energyTransactions.expiresAt, now)
          )
        );

      if (expired.length === 0) {
        return { expiredCount: 0, usersAffected: 0 };
      }

      // 2. Группируем по userId для пересчёта балансов
      const userAmounts = new Map<string, number>();
      for (const tx of expired) {
        userAmounts.set(tx.userId, (userAmounts.get(tx.userId) || 0) + tx.amount);
      }

      // 3. Помечаем транзакции как expired и уменьшаем балансы атомарно
      await db.transaction(async (dbTx) => {
        // Пометить все просроченные одним UPDATE
        const expiredIds = expired.map((tx) => tx.id);
        await dbTx
          .update(energyTransactions)
          .set({ isExpired: true })
          .where(inArray(energyTransactions.id, expiredIds));

        // Уменьшить балансы пользователей одним SQL-выражением на пользователя
        // GREATEST(..., 0) предотвращает отрицательный баланс без SELECT FOR UPDATE
        for (const [userId, expiredAmount] of userAmounts) {
          await dbTx.execute(
            sql`UPDATE users SET energies = GREATEST(energies - ${expiredAmount}, 0) WHERE id = ${userId}`
          );
        }
      });

      logger.info(
        `[Energies] Expired ${expired.length} transactions for ${userAmounts.size} users`
      );

      return { expiredCount: expired.length, usersAffected: userAmounts.size };
    } catch (error) {
      logger.error('[Energies] Error processing expired energies:', error);
      throw error;
    }
  }

  /**
   * Триггеры начисления Энергии по ТЗ
   */

  // Ежедневный вход (+10 EP) — использует московское время (UTC+3)
  async awardDailyLogin(userId: string) {
    const todayMidnightMSK = getMoscowMidnight();

    const todayTransactions = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, userId),
          eq(energyTransactions.reason, 'Ежедневный вход'),
          gte(energyTransactions.createdAt, todayMidnightMSK)
        )
      )
      .limit(1);

    if (todayTransactions.length > 0) {
      return { success: false, message: 'Already awarded today' };
    }

    return this.award(userId, 10, 'Ежедневный вход');
  }

  // Просмотр урока (+20 EP по документу "Геймификация")
  // Защита от повторного начисления за один урок (дедупликация по lessonId в metadata)
  async awardLessonView(userId: string, lessonId: string, lessonTitle?: string) {
    // Проверяем, не начисляли ли уже за этот урок
    // Ищем по lessonId в metadata (reason мог измениться)
    const existing = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, userId),
          sql`metadata->>'lessonId' = ${lessonId}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      logger.info(`[Energies] Lesson ${lessonId} already awarded for user ${userId}`);
      return { success: false, message: 'Already awarded for this lesson' };
    }

    const reason = lessonTitle ? `Просмотр урока: ${lessonTitle}` : 'Просмотр урока';
    return this.award(userId, 20, reason, { lessonId, lessonTitle });
  }

  // Воскресная практика (+50 EP) — дедупликация по practiceId
  async awardSundayPractice(userId: string, practiceId: string) {
    const existing = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, userId),
          eq(energyTransactions.reason, 'Воскресная практика'),
          sql`metadata->>'practiceId' = ${practiceId}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      logger.info(`[Energies] Sunday practice ${practiceId} already awarded for user ${userId}`);
      return { success: false, message: 'Already awarded for this practice' };
    }

    return this.award(userId, 50, 'Воскресная практика', { practiceId });
  }

  // Просмотр записи эфира — дедупликация по recordingId
  async awardStreamRecording(userId: string, recordingId: string) {
    const existing = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, userId),
          eq(energyTransactions.reason, 'Просмотр записи эфира'),
          sql`metadata->>'recordingId' = ${recordingId}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      logger.info(`[Energies] Stream recording ${recordingId} already awarded for user ${userId}`);
      return { success: false, message: 'Already awarded for this recording' };
    }

    return this.award(userId, 20, 'Просмотр записи эфира', { recordingId });
  }

  // Прямой эфир - DEPRECATED
  async awardLiveStream(userId: string, streamId: string, watchedOnline: boolean) {
    return this.awardStreamRecording(userId, streamId);
  }

  // Отчет недели (+100 EP) — дедупликация по weekNumber
  async awardWeeklyReport(userId: string, weekNumber: number) {
    const existing = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, userId),
          eq(energyTransactions.reason, 'Сдача отчета недели'),
          sql`(metadata->>'weekNumber')::int = ${weekNumber}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      logger.info(`[Energies] Weekly report week ${weekNumber} already awarded for user ${userId}`);
      return { success: false, message: 'Already awarded for this week' };
    }

    return this.award(userId, 100, 'Сдача отчета недели', { weekNumber });
  }

  // Продление подписки (+500 EP по документу "Геймификация") — дедупликация: макс 1 раз в 25 дней
  async awardSubscriptionRenewal(userId: string) {
    // Проверяем что за последние 25 дней не было начисления за продление
    const twentyFiveDaysAgo = new Date();
    twentyFiveDaysAgo.setDate(twentyFiveDaysAgo.getDate() - 25);

    const existing = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, userId),
          eq(energyTransactions.reason, 'Продление подписки'),
          gte(energyTransactions.createdAt, twentyFiveDaysAgo)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      logger.info(`[Energies] Subscription renewal already awarded recently for user ${userId}`);
      return { success: false, message: 'Already awarded for subscription renewal recently' };
    }

    return this.award(userId, 500, 'Продление подписки');
  }

  // Закрытие месяца (+500 EP) — дедупликация по monthNumber
  async awardMonthCompletion(userId: string, monthNumber: number) {
    const existing = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, userId),
          eq(energyTransactions.reason, 'Закрытие месяца'),
          sql`(metadata->>'monthNumber')::int = ${monthNumber}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      logger.info(`[Energies] Month ${monthNumber} completion already awarded for user ${userId}`);
      return { success: false, message: 'Already awarded for this month' };
    }

    return this.award(userId, 500, 'Закрытие месяца', { monthNumber });
  }
}

export const energiesService = new EnergyPointsService();
