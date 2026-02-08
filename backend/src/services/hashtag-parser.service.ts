import { db } from '@/db';
import { users, energyTransactions } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { energiesService } from '@/modules/energy-points/service';

/**
 * Сервис для парсинга хештегов в чатах и начисления Энергии
 * По документу "Геймификация для дани.pdf"
 */

interface HashtagRule {
  hashtags: string[]; // Список хештегов (например, ['#отчет', '#дз'])
  reward: number; // Награда в Энергии
  requiresMedia?: boolean; // Требуется ли медиафайл (фото/видео)
  limitType: 'daily' | 'weekly' | 'weekly_max'; // Тип лимита
  limitValue?: number; // Значение лимита (для weekly_max)
  cooldownHours?: number; // Кулдаун в часах (для daily с 20-часовым лимитом)
  description: string; // Описание действия
}

// Правила начисления для чатов десяток
const DECADE_RULES: HashtagRule[] = [
  {
    hashtags: ['#отчет', '#дз'],
    reward: 50,
    limitType: 'daily',
    cooldownHours: 20, // Строго 1 раз в 20 часов
    description: 'Ежедневный отчет',
  },
];

// Правила начисления для чатов городов
const CITY_RULES: HashtagRule[] = [
  {
    hashtags: ['#практика'],
    reward: 50,
    requiresMedia: true,
    limitType: 'weekly',
    description: 'Субботняя практика',
  },
  {
    hashtags: ['#инсайт'],
    reward: 40,
    limitType: 'weekly_max',
    limitValue: 3,
    description: 'Инсайт / Отзыв',
  },
  {
    hashtags: ['#созвон'],
    reward: 100,
    requiresMedia: true,
    limitType: 'weekly',
    description: 'Участие в Созвоне',
  },
  {
    hashtags: ['#сторис'],
    reward: 200,
    requiresMedia: true,
    limitType: 'weekly',
    description: 'Отметка в Stories',
  },
];

export class HashtagParserService {
  /**
   * Проверить cooldown для действия
   */
  private async checkCooldown(
    userId: string,
    reason: string,
    cooldownHours: number
  ): Promise<boolean> {
    try {
      const cooldownDate = new Date();
      cooldownDate.setHours(cooldownDate.getHours() - cooldownHours);

      const recentTransactions = await db
        .select()
        .from(energyTransactions)
        .where(
          and(
            eq(energyTransactions.userId, userId),
            eq(energyTransactions.reason, reason),
            gte(energyTransactions.createdAt, cooldownDate)
          )
        )
        .limit(1);

      return recentTransactions.length === 0;
    } catch (error) {
      logger.error('[HashtagParser] Error checking cooldown:', error);
      return false;
    }
  }

  /**
   * Проверить дневной лимит
   */
  private async checkDailyLimit(userId: string, reason: string): Promise<boolean> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayTransactions = await db
        .select()
        .from(energyTransactions)
        .where(
          and(
            eq(energyTransactions.userId, userId),
            eq(energyTransactions.reason, reason),
            gte(energyTransactions.createdAt, today)
          )
        )
        .limit(1);

      return todayTransactions.length === 0;
    } catch (error) {
      logger.error('[HashtagParser] Error checking daily limit:', error);
      return false;
    }
  }

  /**
   * Проверить недельный лимит
   */
  private async checkWeeklyLimit(
    userId: string,
    reason: string,
    maxCount?: number
  ): Promise<boolean> {
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const weekTransactions = await db
        .select()
        .from(energyTransactions)
        .where(
          and(
            eq(energyTransactions.userId, userId),
            eq(energyTransactions.reason, reason),
            gte(energyTransactions.createdAt, weekAgo)
          )
        );

      if (maxCount) {
        return weekTransactions.length < maxCount;
      } else {
        return weekTransactions.length === 0;
      }
    } catch (error) {
      logger.error('[HashtagParser] Error checking weekly limit:', error);
      return false;
    }
  }

  /**
   * Извлечь уникальные хештеги из текста
   */
  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[а-яА-Яa-zA-Z0-9_]+/g;
    const matches = text.match(hashtagRegex) || [];
    // Убираем дубли и приводим к нижнему регистру
    return [...new Set(matches.map((tag) => tag.toLowerCase()))];
  }

  /**
   * Проверить наличие медиафайла в сообщении
   */
  private hasMedia(ctx: any): boolean {
    return !!(ctx.message?.photo || ctx.message?.video || ctx.message?.document);
  }

  /**
   * Обработать сообщение из чата десятки
   */
  async processDecadeMessage(ctx: any, userId: string): Promise<void> {
    try {
      const text = ctx.message?.text || ctx.message?.caption || '';
      const hashtags = this.extractHashtags(text);

      if (hashtags.length === 0) return;

      for (const rule of DECADE_RULES) {
        // Проверяем есть ли хотя бы один из хештегов правила
        const matchedHashtag = rule.hashtags.find((tag) => hashtags.includes(tag));
        if (!matchedHashtag) continue;

        // Проверяем cooldown (20 часов для #отчет)
        if (rule.cooldownHours) {
          const canAward = await this.checkCooldown(userId, rule.description, rule.cooldownHours);
          if (!canAward) {
            logger.info(
              `[HashtagParser] User ${userId} tried to submit ${matchedHashtag} too soon (cooldown)`
            );
            continue;
          }
        }

        // Проверяем дневной лимит
        if (rule.limitType === 'daily') {
          const canAward = await this.checkDailyLimit(userId, rule.description);
          if (!canAward) {
            logger.info(`[HashtagParser] User ${userId} already submitted ${matchedHashtag} today`);
            continue;
          }
        }

        // Начисляем Энергию
        await energiesService.award(userId, rule.reward, rule.description, {
          hashtag: matchedHashtag,
          chat_type: 'decade',
        });

        logger.info(
          `[HashtagParser] Awarded ${rule.reward} Energy to user ${userId} for ${matchedHashtag} in decade chat`
        );

        // Только одно начисление за сообщение
        break;
      }
    } catch (error) {
      logger.error('[HashtagParser] Error processing decade message:', error);
    }
  }

  /**
   * Обработать сообщение из чата города
   */
  async processCityMessage(ctx: any, userId: string): Promise<void> {
    try {
      const text = ctx.message?.text || ctx.message?.caption || '';
      const hashtags = this.extractHashtags(text);

      if (hashtags.length === 0) return;

      for (const rule of CITY_RULES) {
        // Проверяем есть ли хотя бы один из хештегов правила
        const matchedHashtag = rule.hashtags.find((tag) => hashtags.includes(tag));
        if (!matchedHashtag) continue;

        // Проверяем наличие медиафайла если требуется
        if (rule.requiresMedia && !this.hasMedia(ctx)) {
          logger.info(
            `[HashtagParser] User ${userId} submitted ${matchedHashtag} without required media`
          );
          continue;
        }

        // Проверяем лимиты
        let canAward = true;

        if (rule.limitType === 'weekly') {
          canAward = await this.checkWeeklyLimit(userId, rule.description);
        } else if (rule.limitType === 'weekly_max' && rule.limitValue) {
          canAward = await this.checkWeeklyLimit(userId, rule.description, rule.limitValue);
        }

        if (!canAward) {
          logger.info(`[HashtagParser] User ${userId} exceeded limit for ${matchedHashtag}`);
          continue;
        }

        // Начисляем Энергию
        await energiesService.award(userId, rule.reward, rule.description, {
          hashtag: matchedHashtag,
          chat_type: 'city',
        });

        logger.info(
          `[HashtagParser] Awarded ${rule.reward} Energy to user ${userId} for ${matchedHashtag} in city chat`
        );

        // Только одно начисление за сообщение
        break;
      }
    } catch (error) {
      logger.error('[HashtagParser] Error processing city message:', error);
    }
  }

  /**
   * Обработать сообщение из группового чата
   * Определяет тип чата (десятка/город) и вызывает соответствующий обработчик
   */
  async processGroupMessage(ctx: any): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      const userId = ctx.from?.id;

      if (!chatId || !userId) return;

      // Получаем информацию о пользователе из БД
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, userId))
        .limit(1);

      if (!user) {
        logger.debug(`[HashtagParser] User ${userId} not found in database`);
        return;
      }

      // Проверяем что у пользователя активная подписка
      if (!user.isPro) {
        logger.debug(`[HashtagParser] User ${userId} does not have active subscription`);
        return;
      }

      // Определяем тип чата
      // TODO: Добавить проверку через таблицу decades или city_chats
      // Пока используем простую эвристику: если в названии чата есть "десятка" - это десятка
      const chatTitle = ctx.chat?.title?.toLowerCase() || '';

      if (chatTitle.includes('десятк')) {
        await this.processDecadeMessage(ctx, user.id);
      } else {
        // По умолчанию считаем что это чат города
        await this.processCityMessage(ctx, user.id);
      }
    } catch (error) {
      logger.error('[HashtagParser] Error processing group message:', error);
    }
  }
}

export const hashtagParserService = new HashtagParserService();
