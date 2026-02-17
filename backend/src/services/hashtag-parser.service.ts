import { db } from '@/db';
import { users, energyTransactions, decades } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { energiesService } from '@/modules/energy-points/service';

/**
 * Сервис для парсинга хештегов в чатах и начисления Энергии
 * По документу "Геймификация для дани.pdf"
 * 
 * Все лимиты привязаны к московскому времени (UTC+3):
 * - daily: сброс в 00:00 МСК
 * - every_3_days: 3 календарных дня по МСК
 * - weekly: 7 календарных дней по МСК
 * - weekendOnly: Сб/Вс по МСК
 */

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

/** Получить полночь по Москве N дней назад */
function getMoscowMidnightDaysAgo(days: number): Date {
  const midnight = getMoscowMidnight();
  midnight.setDate(midnight.getDate() - days);
  return midnight;
}

/** Получить текущий день недели по Москве (0=Вс, 6=Сб) */
function getMoscowDayOfWeek(): number {
  const now = new Date();
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return moscowNow.getUTCDay();
}

/** Получить понедельник 00:00 МСК текущей недели */
function getMoscowWeekStart(): Date {
  const now = new Date();
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  // getUTCDay(): 0=Вс, 1=Пн, ..., 6=Сб
  let daysSinceMonday = moscowNow.getUTCDay() - 1; // Пн=0, Вт=1, ..., Сб=5, Вс=-1
  if (daysSinceMonday < 0) daysSinceMonday = 6; // Воскресенье = 6 дней после понедельника
  // Обнуляем до полуночи МСК
  moscowNow.setUTCHours(0, 0, 0, 0);
  moscowNow.setUTCDate(moscowNow.getUTCDate() - daysSinceMonday);
  // Переводим обратно в UTC (МСК - 3ч)
  return new Date(moscowNow.getTime() - 3 * 60 * 60 * 1000);
}

interface HashtagRule {
  hashtags: string[]; // Список хештегов (например, ['#отчет', '#дз'])
  reward: number; // Награда в Энергии
  requiresMedia?: boolean; // Требуется ли медиафайл (фото/видео)
  limitType: 'daily' | 'weekly' | 'weekly_max' | 'every_3_days'; // Тип лимита
  limitValue?: number; // Значение лимита (для weekly_max)
  weekendOnly?: boolean; // Только Сб/Вс (для #практика)
  description: string; // Описание действия
}

// Награды за #созвон + #сторис (комбо-система, раз в 3 календарных дня по МСК)
const SOZVON_STORIS_REWARDS = {
  comboReward: 300,     // #созвон + #сторис вместе
  sozvonOnly: 100,      // только #созвон
  storisOnly: 200,      // только #сторис
  cooldownDays: 3,      // раз в 3 календарных дня по МСК
  comboDescription: 'Созвон + Stories',
  sozvonDescription: 'Участие в Созвоне',
  storisDescription: 'Отметка в Stories',
};

// Правила начисления для чатов десяток
const DECADE_RULES: HashtagRule[] = [
  {
    hashtags: ['#отчет', '#дз'],
    reward: 50,
    limitType: 'daily', // Сброс в 00:00 МСК
    description: 'Ежедневный отчет',
  },
];

// Правила начисления для чатов городов
// (#созвон и #сторис обрабатываются отдельно — комбо-система)
const CITY_RULES: HashtagRule[] = [
  {
    hashtags: ['#практика'],
    reward: 50,
    requiresMedia: true,
    limitType: 'weekly',
    weekendOnly: true, // Только Сб/Вс по документу "Геймификация"
    description: 'Субботняя практика',
  },
  {
    hashtags: ['#инсайт'],
    reward: 40,
    limitType: 'weekly_max',
    limitValue: 3,
    description: 'Инсайт / Отзыв',
  },
];

export class HashtagParserService {
  /**
   * Проверить дневной лимит (сброс в 00:00 МСК)
   */
  private async checkDailyLimit(userId: string, reason: string): Promise<boolean> {
    try {
      const todayMidnightMSK = getMoscowMidnight();

      const todayTransactions = await db
        .select()
        .from(energyTransactions)
        .where(
          and(
            eq(energyTransactions.userId, userId),
            eq(energyTransactions.reason, reason),
            gte(energyTransactions.createdAt, todayMidnightMSK)
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
   * Проверить недельный лимит (Пн-Вс по МСК, сброс в понедельник 00:00 МСК)
   */
  private async checkWeeklyLimit(
    userId: string,
    reason: string,
    maxCount?: number
  ): Promise<boolean> {
    try {
      const weekAgoMidnightMSK = getMoscowWeekStart();

      const weekTransactions = await db
        .select()
        .from(energyTransactions)
        .where(
          and(
            eq(energyTransactions.userId, userId),
            eq(energyTransactions.reason, reason),
            gte(energyTransactions.createdAt, weekAgoMidnightMSK)
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
   * Проверить лимит раз в 3 календарных дня (по МСК)
   */
  private async checkEvery3DaysLimit(userId: string, reason: string): Promise<boolean> {
    try {
      const threeDaysAgoMidnightMSK = getMoscowMidnightDaysAgo(3);

      const recentTransactions = await db
        .select()
        .from(energyTransactions)
        .where(
          and(
            eq(energyTransactions.userId, userId),
            eq(energyTransactions.reason, reason),
            gte(energyTransactions.createdAt, threeDaysAgoMidnightMSK)
          )
        )
        .limit(1);

      return recentTransactions.length === 0;
    } catch (error) {
      logger.error('[HashtagParser] Error checking every-3-days limit:', error);
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
  async processDecadeMessage(ctx: any, userId: string, userTelegramId: number): Promise<void> {
    try {
      const text = ctx.message?.text || ctx.message?.caption || '';
      const hashtags = this.extractHashtags(text);

      if (hashtags.length === 0) return;

      for (const rule of DECADE_RULES) {
        // Проверяем есть ли хотя бы один из хештегов правила
        const matchedHashtag = rule.hashtags.find((tag) => hashtags.includes(tag));
        if (!matchedHashtag) continue;

        // Проверяем дневной лимит (сброс в 00:00 МСК)
        if (rule.limitType === 'daily') {
          const canAward = await this.checkDailyLimit(userId, rule.description);
          if (!canAward) {
            logger.info(`[HashtagParser] User ${userId} already submitted ${matchedHashtag} today (MSK)`);
            continue;
          }
        }

        // Начисляем Энергию
        await energiesService.award(userId, rule.reward, rule.description, {
          hashtag: matchedHashtag,
          chat_type: 'decade',
        });

        // Получаем новый баланс
        const [userBalance] = await db
          .select({ energies: users.energies })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        const newBalance = userBalance?.energies || 0;

        // 🎯 РЕАКЦИЯ: Ставим молнию на сообщение
        try {
          await ctx.react('⚡');
        } catch (reactionError) {
          logger.warn('[HashtagParser] Could not set reaction:', reactionError);
        }

        // 💌 ЛИЧНОЕ СООБЩЕНИЕ: Отправляем детали в ЛС
        try {
          await ctx.api.sendMessage(
            userTelegramId,
            `✅ <b>Энергия начислена!</b>\n\n` +
              `${matchedHashtag} → <b>+${rule.reward}⚡️</b>\n` +
              `💰 Твой баланс: <b>${newBalance.toLocaleString()}⚡️</b>\n\n` +
              `🎯 <i>${rule.description}</i>`,
            { parse_mode: 'HTML' }
          );
        } catch (dmError) {
          logger.warn('[HashtagParser] Could not send DM (user may not have started bot):', dmError);
        }

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
   * Обработать #созвон и #сторис (комбо-система, раз в 3 дня)
   * Возвращает true если хотя бы один из них был обработан (чтобы не дублировать в обычных правилах)
   */
  private async processSozvonStoris(
    ctx: any,
    userId: string,
    userTelegramId: number,
    hashtags: string[]
  ): Promise<boolean> {
    const hasSozvon = hashtags.includes('#созвон');
    const hasStoris = hashtags.includes('#сторис');

    if (!hasSozvon && !hasStoris) return false;

    // Оба требуют медиафайл
    if (!this.hasMedia(ctx)) {
      logger.info(
        `[HashtagParser] User ${userId} submitted #созвон/#сторис without required media`
      );
      return true; // Хештег был найден, но не начислен — не передаём в обычные правила
    }

    const R = SOZVON_STORIS_REWARDS;

    if (hasSozvon && hasStoris) {
      // Комбо: #созвон + #сторис = 300
      // Проверяем лимит по комбо-reason
      const canAward = await this.checkEvery3DaysLimit(userId, R.comboDescription);
      if (!canAward) {
        logger.info(`[HashtagParser] User ${userId} exceeded 3-day limit for #созвон + #сторис combo`);
        return true;
      }

      await energiesService.award(userId, R.comboReward, R.comboDescription, {
        hashtag: '#созвон + #сторис',
        chat_type: 'city',
      });

      await this.sendCityRewardNotification(ctx, userId, userTelegramId, '#созвон + #сторис', R.comboReward, R.comboDescription);
      logger.info(`[HashtagParser] Awarded ${R.comboReward} Energy to user ${userId} for #созвон + #сторис combo`);
    } else if (hasSozvon) {
      // Только #созвон = 100
      const canAward = await this.checkEvery3DaysLimit(userId, R.sozvonDescription);
      if (!canAward) {
        logger.info(`[HashtagParser] User ${userId} exceeded 3-day limit for #созвон`);
        return true;
      }

      await energiesService.award(userId, R.sozvonOnly, R.sozvonDescription, {
        hashtag: '#созвон',
        chat_type: 'city',
      });

      await this.sendCityRewardNotification(ctx, userId, userTelegramId, '#созвон', R.sozvonOnly, R.sozvonDescription);
      logger.info(`[HashtagParser] Awarded ${R.sozvonOnly} Energy to user ${userId} for #созвон`);
    } else {
      // Только #сторис = 200
      const canAward = await this.checkEvery3DaysLimit(userId, R.storisDescription);
      if (!canAward) {
        logger.info(`[HashtagParser] User ${userId} exceeded 3-day limit for #сторис`);
        return true;
      }

      await energiesService.award(userId, R.storisOnly, R.storisDescription, {
        hashtag: '#сторис',
        chat_type: 'city',
      });

      await this.sendCityRewardNotification(ctx, userId, userTelegramId, '#сторис', R.storisOnly, R.storisDescription);
      logger.info(`[HashtagParser] Awarded ${R.storisOnly} Energy to user ${userId} for #сторис`);
    }

    return true;
  }

  /**
   * Отправить реакцию и ЛС для начисления в городском чате
   */
  private async sendCityRewardNotification(
    ctx: any,
    userId: string,
    userTelegramId: number,
    hashtagLabel: string,
    reward: number,
    description: string
  ): Promise<void> {
    // Получаем новый баланс
    const [userBalance] = await db
      .select({ energies: users.energies })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const newBalance = userBalance?.energies || 0;

    // Реакция
    try {
      await ctx.react('❤');
    } catch (reactionError) {
      logger.warn('[HashtagParser] Could not set reaction:', reactionError);
    }

    // ЛС
    try {
      await ctx.api.sendMessage(
        userTelegramId,
        `✅ <b>Энергия начислена!</b>\n\n` +
          `${hashtagLabel} → <b>+${reward}⚡️</b>\n` +
          `💰 Твой баланс: <b>${newBalance.toLocaleString()}⚡️</b>\n\n` +
          `🎯 <i>${description}</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (dmError) {
      logger.warn('[HashtagParser] Could not send DM:', dmError);
    }
  }

  /**
   * Обработать сообщение из чата города
   */
  async processCityMessage(ctx: any, userId: string, userTelegramId: number): Promise<void> {
    try {
      const text = ctx.message?.text || ctx.message?.caption || '';
      const hashtags = this.extractHashtags(text);

      if (hashtags.length === 0) return;

      // 1. Сначала обрабатываем #созвон / #сторис (комбо-система, раз в 3 дня)
      const handledSozvonStoris = await this.processSozvonStoris(ctx, userId, userTelegramId, hashtags);

      // 2. Обрабатываем остальные хештеги (#практика, #инсайт)
      for (const rule of CITY_RULES) {
        const matchedHashtag = rule.hashtags.find((tag) => hashtags.includes(tag));
        if (!matchedHashtag) continue;

        // Проверяем ограничение "только выходные" (Сб/Вс по МСК)
        if (rule.weekendOnly) {
          const dayOfWeek = getMoscowDayOfWeek(); // 0=Вс, 6=Сб (по МСК)
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            logger.info(
              `[HashtagParser] User ${userId} submitted ${matchedHashtag} on weekday (only Sat/Sun allowed)`
            );
            continue;
          }
        }

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
        } else if (rule.limitType === 'every_3_days') {
          canAward = await this.checkEvery3DaysLimit(userId, rule.description);
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

        await this.sendCityRewardNotification(ctx, userId, userTelegramId, matchedHashtag, rule.reward, rule.description);

        logger.info(
          `[HashtagParser] Awarded ${rule.reward} Energy to user ${userId} for ${matchedHashtag} in city chat`
        );
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
      const userTelegramId = ctx.from?.id;

      if (!chatId || !userTelegramId) return;

      // Получаем информацию о пользователе из БД
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, userTelegramId))
        .limit(1);

      if (!user) {
        logger.debug(`[HashtagParser] User ${userTelegramId} not found in database`);
        return;
      }

      // Проверяем что у пользователя активная подписка
      if (!user.isPro) {
        logger.debug(`[HashtagParser] User ${userTelegramId} does not have active subscription`);
        return;
      }

      // Определяем тип чата через таблицу decades (по tg_chat_id)
      const decade = await db.select({ id: decades.id })
        .from(decades)
        .where(eq(decades.tgChatId, chatId))
        .limit(1);
      const isDecadeChat = decade.length > 0;

      if (isDecadeChat) {
        await this.processDecadeMessage(ctx, user.id, userTelegramId);
      } else {
        // Не найден в таблице decades — считаем что это чат города
        await this.processCityMessage(ctx, user.id, userTelegramId);
      }
    } catch (error) {
      logger.error('[HashtagParser] Error processing group message:', error);
    }
  }
}

export const hashtagParserService = new HashtagParserService();
