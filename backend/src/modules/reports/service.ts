import { db } from '@/db';
import { weeklyReports, users } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { energiesService as energyPointsService } from '../energy-points/service';

export class ReportsService {
  /**
   * Получить номер текущей недели в году
   */
  private getWeekNumber(date: Date = new Date()): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Получить текущий год
   */
  private getCurrentYear(date: Date = new Date()): number {
    return date.getFullYear();
  }

  /**
   * Получить дедлайн текущей недели (воскресенье 23:59 МСК = воскресенье 20:59 UTC).
   * Вычисление ведётся в UTC с явным смещением +3 часа для МСК.
   */
  getWeekDeadline(): Date {
    const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3
    const nowUtc = new Date();
    const nowMsk = new Date(nowUtc.getTime() + MSK_OFFSET_MS);

    // getUTCDay() в пространстве МСК (0=вс, 1=пн, ..., 6=сб)
    const dayMsk = nowMsk.getUTCDay();
    const daysUntilSunday = dayMsk === 0 ? 0 : 7 - dayMsk;

    // Строим дедлайн: текущая МСК-дата + daysUntilSunday дней, время 23:59:59
    const deadlineMsk = new Date(nowMsk);
    deadlineMsk.setUTCDate(deadlineMsk.getUTCDate() + daysUntilSunday);
    deadlineMsk.setUTCHours(23, 59, 59, 999);

    // Возвращаем в UTC
    return new Date(deadlineMsk.getTime() - MSK_OFFSET_MS);
  }

  /**
   * Проверить, просрочен ли дедлайн
   */
  isDeadlinePassed(): boolean {
    return new Date() > this.getWeekDeadline();
  }

  /**
   * Получить количество часов до дедлайна
   */
  getHoursUntilDeadline(): number {
    const now = new Date();
    const deadline = this.getWeekDeadline();
    const diff = deadline.getTime() - now.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
  }

  /**
   * Сдать отчет недели
   */
  async submitReport(userId: string, content: string) {
    try {
      const weekNumber = this.getWeekNumber();
      const year = this.getCurrentYear();
      const deadline = this.getWeekDeadline();

      // Проверяем, не сдавал ли уже отчет на этой неделе этого года
      const existingReport = await db
        .select()
        .from(weeklyReports)
        .where(
          and(
            eq(weeklyReports.userId, userId),
            eq(weeklyReports.weekNumber, weekNumber),
            eq(weeklyReports.year, year)
          )
        )
        .limit(1);

      if (existingReport.length > 0) {
        throw new Error('Report already submitted for this week');
      }

      // Проверяем дедлайн
      if (this.isDeadlinePassed()) {
        throw new Error('Deadline has passed');
      }

      // Атомарно создаём отчёт и начисляем энергии в одной транзакции
      const newReport = await db.transaction(async (tx) => {
        const [report] = await tx
          .insert(weeklyReports)
          .values({
            userId,
            weekNumber,
            year,
            content,
            deadline,
            energiesEarned: 100, // По ТЗ: +100 Энергии за отчет
          })
          .returning();

        // Начисляем EP внутри транзакции
        await energyPointsService.awardWeeklyReport(userId, weekNumber);

        return report;
      });

      logger.info(`[Reports] User ${userId} submitted report for week ${weekNumber}/${year}`);

      return {
        success: true,
        report: newReport,
        energiesEarned: 100,
      };
    } catch (error) {
      logger.error('[Reports] Error submitting report:', error);
      throw error;
    }
  }

  /**
   * Получить отчеты пользователя
   */
  async getUserReports(userId: string, limit: number = 50) {
    try {
      const reports = await db
        .select()
        .from(weeklyReports)
        .where(eq(weeklyReports.userId, userId))
        .orderBy(desc(weeklyReports.weekNumber))
        .limit(limit);

      return reports;
    } catch (error) {
      logger.error('[Reports] Error getting user reports:', error);
      throw new Error('Failed to get user reports');
    }
  }

  /**
   * Получить отчет по ID
   */
  async getReportById(reportId: string) {
    try {
      const report = await db
        .select()
        .from(weeklyReports)
        .where(eq(weeklyReports.id, reportId))
        .limit(1);

      if (report.length === 0) {
        throw new Error('Report not found');
      }

      return report[0];
    } catch (error) {
      logger.error('[Reports] Error getting report by ID:', error);
      throw error;
    }
  }

  /**
   * Проверить, сдал ли пользователь отчет на текущей неделе
   */
  async hasSubmittedThisWeek(userId: string): Promise<boolean> {
    try {
      const weekNumber = this.getWeekNumber();
      const year = this.getCurrentYear();

      const report = await db
        .select()
        .from(weeklyReports)
        .where(
          and(
            eq(weeklyReports.userId, userId),
            eq(weeklyReports.weekNumber, weekNumber),
            eq(weeklyReports.year, year)
          )
        )
        .limit(1);

      return report.length > 0;
    } catch (error) {
      logger.error('[Reports] Error checking if user submitted this week:', error);
      throw error;
    }
  }

  /**
   * Получить отчет текущей недели пользователя
   */
  async getCurrentWeekReport(userId: string) {
    try {
      const weekNumber = this.getWeekNumber();
      const year = this.getCurrentYear();

      const report = await db
        .select()
        .from(weeklyReports)
        .where(
          and(
            eq(weeklyReports.userId, userId),
            eq(weeklyReports.weekNumber, weekNumber),
            eq(weeklyReports.year, year)
          )
        )
        .limit(1);

      return report.length > 0 ? report[0] : null;
    } catch (error) {
      logger.error('[Reports] Error getting current week report:', error);
      throw error;
    }
  }

  /**
   * Получить статистику отчетов пользователя
   */
  async getUserReportStats(userId: string) {
    try {
      const reports = await this.getUserReports(userId);

      const stats = {
        totalReports: reports.length,
        totalEpEarned: reports.reduce((sum, r) => sum + r.energiesEarned, 0),
        currentStreak: await this.calculateStreak(userId),
        submittedThisWeek: await this.hasSubmittedThisWeek(userId),
        hoursUntilDeadline: this.getHoursUntilDeadline(),
      };

      return stats;
    } catch (error) {
      logger.error('[Reports] Error getting user report stats:', error);
      throw error;
    }
  }

  /**
   * Рассчитать текущую серию последовательных отчетов
   */
  private async calculateStreak(userId: string): Promise<number> {
    try {
      const reports = await this.getUserReports(userId, 100);

      if (reports.length === 0) {
        return 0;
      }

      // Сортируем по неделям в обратном порядке
      const sortedReports = reports.sort((a, b) => b.weekNumber - a.weekNumber);

      let streak = 0;
      const currentWeek = this.getWeekNumber();

      for (let i = 0; i < sortedReports.length; i++) {
        const expectedWeek = currentWeek - i;
        if (sortedReports[i].weekNumber === expectedWeek) {
          streak++;
        } else {
          break;
        }
      }

      return streak;
    } catch (error) {
      logger.error('[Reports] Error calculating streak:', error);
      return 0;
    }
  }

  /**
   * Получить все отчеты за конкретную неделю
   */
  async getReportsByWeek(weekNumber: number) {
    try {
      const reports = await db
        .select({
          id: weeklyReports.id,
          content: weeklyReports.content,
          submittedAt: weeklyReports.submittedAt,
          energiesEarned: weeklyReports.energiesEarned,
          // Данные пользователя
          userId: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          photoUrl: users.photoUrl,
        })
        .from(weeklyReports)
        .leftJoin(users, eq(weeklyReports.userId, users.id))
        .where(eq(weeklyReports.weekNumber, weekNumber))
        .orderBy(desc(weeklyReports.submittedAt));

      return reports;
    } catch (error) {
      logger.error('[Reports] Error getting reports by week:', error);
      throw new Error('Failed to get reports by week');
    }
  }

  /**
   * Получить статистику по всем отчетам
   */
  async getGlobalReportStats() {
    try {
      const currentWeek = this.getWeekNumber();
      const currentWeekReports = await this.getReportsByWeek(currentWeek);

      const stats = {
        currentWeek,
        submittedThisWeek: currentWeekReports.length,
        deadline: this.getWeekDeadline(),
        hoursRemaining: this.getHoursUntilDeadline(),
        deadlinePassed: this.isDeadlinePassed(),
      };

      return stats;
    } catch (error) {
      logger.error('[Reports] Error getting global report stats:', error);
      throw error;
    }
  }

  /**
   * Удалить отчет (только если не прошло 24 часа)
   */
  async deleteReport(reportId: string, userId: string) {
    try {
      const report = await this.getReportById(reportId);

      // Проверяем владельца
      if (report.userId !== userId) {
        throw new Error('Not authorized to delete this report');
      }

      // Проверяем, не прошло ли 24 часа
      const now = new Date();
      const submittedAt = new Date(report.submittedAt);
      const hoursSinceSubmission = (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceSubmission > 24) {
        throw new Error('Cannot delete report after 24 hours');
      }

      // Удаляем отчет
      await db
        .delete(weeklyReports)
        .where(eq(weeklyReports.id, reportId));

      // Возвращаем Энергии(списываем -100)
      await energyPointsService.spend(userId, 100, 'Возврат за удаленный отчет', { reportId });

      logger.info(`[Reports] Report ${reportId} deleted by user ${userId}`);

      return { success: true };
    } catch (error) {
      logger.error('[Reports] Error deleting report:', error);
      throw error;
    }
  }
}

export const reportsService = new ReportsService();
