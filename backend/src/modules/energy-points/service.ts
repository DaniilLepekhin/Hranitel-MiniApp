import { db } from '@/db';
import { energyTransactions, users } from '@/db/schema';
import { eq, desc, and, gte } from 'drizzle-orm';
import { logger } from '@/utils/logger';

export class EnergyPointsService {
  /**
   * Начислить Энергии
   */
  async award(userId: string, amount: number, reason: string, metadata?: Record<string, any>) {
    try {
      // Начинаем транзакцию
      await db.transaction(async (tx) => {
        // Создаем запись о транзакции
        await tx.insert(energyTransactions).values({
          userId,
          amount,
          type: 'income',
          reason,
          metadata: metadata || {},
        });

        // Обновляем баланс пользователя
        const user = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user.length > 0) {
          const currentBalance = user[0].energies || 0;
          await tx
            .update(users)
            .set({ energies: currentBalance + amount })
            .where(eq(users.id, userId));
        }
      });

      logger.info(`[Energies] Awarded ${amount} Энергииto user ${userId} for: ${reason}`);

      return { success: true, amount, reason };
    } catch (error) {
      logger.error('[Energies] Error awarding points:', error);
      throw new Error('Failed to award energy points');
    }
  }

  /**
   * Списать Энергии
   */
  async spend(userId: string, amount: number, reason: string, metadata?: Record<string, any>) {
    try {
      // Проверяем баланс
      const balance = await this.getBalance(userId);
      if (balance < amount) {
        throw new Error('Insufficient energy points');
      }

      // Начинаем транзакцию
      await db.transaction(async (tx) => {
        // Создаем запись о транзакции
        await tx.insert(energyTransactions).values({
          userId,
          amount,
          type: 'expense',
          reason,
          metadata: metadata || {},
        });

        // Обновляем баланс пользователя
        await tx
          .update(users)
          .set({ energies: balance - amount })
          .where(eq(users.id, userId));
      });

      logger.info(`[Energies] Spent ${amount} Энергииfrom user ${userId} for: ${reason}`);

      return { success: true, amount, reason, newBalance: balance - amount };
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
   * Триггеры начисления Энергиипо ТЗ
   */

  // Ежедневный вход (+10 EP)
  async awardDailyLogin(userId: string) {
    // Проверяем, не начисляли ли уже сегодня
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTransactions = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, userId),
          eq(energyTransactions.reason, 'Ежедневный вход'),
          gte(energyTransactions.createdAt, today)
        )
      )
      .limit(1);

    if (todayTransactions.length > 0) {
      return { success: false, message: 'Already awarded today' };
    }

    return this.award(userId, 10, 'Ежедневный вход');
  }

  // Просмотр урока (+50 EP)
  async awardLessonView(userId: string, lessonId: string) {
    return this.award(userId, 50, 'Просмотр урока', { lessonId });
  }

  // Воскресная практика (+50 EP)
  async awardSundayPractice(userId: string, practiceId: string) {
    return this.award(userId, 50, 'Воскресная практика', { practiceId });
  }

  // Просмотр записи эфира (награда зависит от recording.energiesReward)
  async awardStreamRecording(userId: string, recordingId: string) {
    return this.award(userId, 100, 'Просмотр записи эфира', { recordingId });
  }

  // Прямой эфир - DEPRECATED (оставлено для обратной совместимости)
  async awardLiveStream(userId: string, streamId: string, watchedOnline: boolean) {
    return this.awardStreamRecording(userId, streamId);
  }

  // Отчет недели (+100 EP)
  async awardWeeklyReport(userId: string, weekNumber: number) {
    return this.award(userId, 100, 'Сдача отчета недели', { weekNumber });
  }

  // Продление подписки (+300 EP)
  async awardSubscriptionRenewal(userId: string) {
    return this.award(userId, 300, 'Продление подписки');
  }

  // Закрытие месяца (+500 EP)
  async awardMonthCompletion(userId: string, monthNumber: number) {
    return this.award(userId, 500, 'Закрытие месяца', { monthNumber });
  }
}

export const energiesService = new EnergyPointsService();
