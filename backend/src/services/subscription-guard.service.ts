/**
 * 🛡️ SUBSCRIPTION GUARD SERVICE
 * Контроль доступа к каналу и чатам по подписке
 */

import { Api } from 'grammy';
import { db, rawDb } from '@/db';
import { users, geographySurveyResponses } from '@/db/schema';
import { eq, lt, and, isNotNull, gte, sql } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import postgres from 'postgres';
import { config } from '@/config';
import { decadesService } from '@/services/decades.service';
import { sendRenewal2Days, sendRenewal1Day, sendRenewalToday } from '@/modules/bot/post-payment-funnels';

// Защищённые каналы клуба
const PROTECTED_CHANNEL_IDS = [
  -1002580645337,  // Основной канал клуба
  -1003590120817,  // Дополнительный канал
];

// Подключение к старой БД для city_chats_ik (через переменную окружения)
const oldDbConnection = config.OLD_DATABASE_URL
  ? postgres(config.OLD_DATABASE_URL, { ssl: false })
  : null;

interface CityChat {
  id: number;
  platform_id: number | null;
  country: string;
  city: string;
}

// ⚡ Кэш для city_chats - обновляется раз в 5 минут
const CITY_CHATS_CACHE_TTL = 5 * 60 * 1000; // 5 минут
let cityChatIdsCache: number[] | null = null;
let cityChatIdsCacheTime = 0;

class SubscriptionGuardService {
  private api: Api | null = null;

  /**
   * Инициализация сервиса с API бота
   */
  init(api: Api) {
    this.api = api;
    logger.info('SubscriptionGuardService initialized');
    // Прогреваем кэш при старте
    this.getCityChatIds().catch(() => {});
  }

  /**
   * Получить все platform_id из city_chats_ik (с кэшированием)
   */
  async getCityChatIds(): Promise<number[]> {
    // Проверяем кэш
    const now = Date.now();
    if (cityChatIdsCache && (now - cityChatIdsCacheTime) < CITY_CHATS_CACHE_TTL) {
      return cityChatIdsCache;
    }

    if (!oldDbConnection) {
      logger.warn('OLD_DATABASE_URL not configured — city chat IDs unavailable');
      return cityChatIdsCache || [];
    }

    try {
      const result = await oldDbConnection<{ platform_id: number | null }[]>`
        SELECT platform_id
        FROM city_chats_ik
        WHERE platform_id IS NOT NULL
      `;

      const chatIds = result
        .map(row => row.platform_id)
        .filter((id): id is number => id !== null);

      // Сохраняем в кэш
      cityChatIdsCache = chatIds;
      cityChatIdsCacheTime = now;

      logger.info({ count: chatIds.length }, 'Fetched and cached city chat IDs');
      return chatIds;
    } catch (error) {
      logger.error({ error }, 'Error fetching city chat IDs');
      // Возвращаем старый кэш если есть
      return cityChatIdsCache || [];
    }
  }

  /**
   * Проверить подписку пользователя по telegram ID
   */
  async hasActiveSubscription(telegramId: number): Promise<boolean> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);

      if (!user) {
        return false;
      }

      // Проверяем isPro и дату окончания подписки
      if (!user.isPro) {
        return false;
      }

      if (user.subscriptionExpires) {
        const now = new Date();
        return new Date(user.subscriptionExpires) > now;
      }

      // Если isPro=true но нет даты окончания, считаем что подписка активна
      return user.isPro;
    } catch (error) {
      logger.error({ error, telegramId }, 'Error checking subscription');
      return false;
    }
  }

  /**
   * Обработка вступления в канал/чат
   * Вызывается при chat_member_updated
   */
  async handleJoinAttempt(chatId: number, userId: number): Promise<void> {
    if (!this.api) {
      logger.error('API not initialized');
      return;
    }

    // Проверяем, что это наш канал или один из чатов городов
    const cityChatIds = await this.getCityChatIds();
    const isProtectedChat = PROTECTED_CHANNEL_IDS.includes(chatId) || cityChatIds.includes(chatId);

    if (!isProtectedChat) {
      return;
    }

    const hasSubscription = await this.hasActiveSubscription(userId);

    if (!hasSubscription) {
      logger.info({ chatId, userId }, 'User without subscription tried to join, kicking...');

      try {
        // Кикаем пользователя (ban + unban чтобы он мог снова попытаться после оплаты)
        await this.api.banChatMember(chatId, userId);
        // Сразу разбаниваем, чтобы мог снова попытаться после оплаты
        await this.api.unbanChatMember(chatId, userId, { only_if_banned: true });

        logger.info({ chatId, userId }, 'User kicked from protected chat');
      } catch (error) {
        logger.error({ error, chatId, userId }, 'Error kicking user');
      }
    } else {
      logger.info({ chatId, userId }, 'User with active subscription joined');
    }
  }

  /**
   * Удалить пользователя из канала и всех чатов (каналы + города + десятки)
   */
  async removeUserFromAllChats(telegramId: number): Promise<void> {
    if (!this.api) {
      logger.error('API not initialized');
      return;
    }

    const cityChatIds = await this.getCityChatIds();
    const decadeChatIds = await this.getDecadeChatIds();
    const chatIds = [...PROTECTED_CHANNEL_IDS, ...cityChatIds, ...decadeChatIds];

    for (const chatId of chatIds) {
      try {
        // Сначала проверяем, является ли пользователь участником
        const member = await this.api.getChatMember(chatId, telegramId).catch(() => null);

        if (member && ['member', 'administrator', 'creator'].includes(member.status)) {
          await this.api.banChatMember(chatId, telegramId);
          logger.info({ chatId, telegramId }, 'User banned from chat');
        }
      } catch (error) {
        // Игнорируем ошибки (пользователь может не быть в чате)
        logger.debug({ error, chatId, telegramId }, 'Error banning user from chat (may not be member)');
      }
    }
  }

  /**
   * Получить все tg_chat_id десяток (с кэшированием)
   */
  private decadeChatIdsCache: number[] | null = null;
  private decadeChatIdsCacheTime = 0;

  async getDecadeChatIds(): Promise<number[]> {
    const now = Date.now();
    if (this.decadeChatIdsCache && (now - this.decadeChatIdsCacheTime) < CITY_CHATS_CACHE_TTL) {
      return this.decadeChatIdsCache;
    }

    try {
      const rows = await rawDb<{ tg_chat_id: string | number }[]>`
        SELECT tg_chat_id FROM decades WHERE is_active = true AND tg_chat_id IS NOT NULL
      `;
      const chatIds = rows
        .map(r => Number(r.tg_chat_id))
        .filter(id => !isNaN(id));

      this.decadeChatIdsCache = chatIds;
      this.decadeChatIdsCacheTime = now;
      logger.info({ count: chatIds.length }, 'Fetched and cached decade chat IDs');
      return chatIds;
    } catch (error) {
      logger.error({ error }, 'Error fetching decade chat IDs');
      return this.decadeChatIdsCache || [];
    }
  }

  /**
   * Разблокировать пользователя во всех чатах (каналы + города + десятки)
   */
  async unbanUserFromAllChats(telegramId: number): Promise<void> {
    if (!this.api) {
      logger.error('API not initialized');
      return;
    }

    const cityChatIds = await this.getCityChatIds();
    const decadeChatIds = await this.getDecadeChatIds();
    const chatIds = [...PROTECTED_CHANNEL_IDS, ...cityChatIds, ...decadeChatIds];

    let unbanned = 0;
    for (const chatId of chatIds) {
      try {
        await this.api.unbanChatMember(chatId, telegramId, { only_if_banned: true });
        unbanned++;
      } catch (error) {
        // Игнорируем ошибки (бот может не быть админом)
        logger.debug({ error, chatId, telegramId }, 'Error unbanning user from chat');
      }
    }

    logger.info(
      { telegramId, total: chatIds.length, channels: PROTECTED_CHANNEL_IDS.length, cities: cityChatIds.length, decades: decadeChatIds.length },
      'User unbanned from all chats'
    );
  }

  /**
   * Разблокировать пользователя в конкретном чате
   */
  async unbanFromSpecificChat(telegramId: number, chatId: number): Promise<void> {
    if (!this.api) {
      logger.error('API not initialized');
      return;
    }

    try {
      await this.api.unbanChatMember(chatId, telegramId, { only_if_banned: true });
      logger.info({ chatId, telegramId }, 'User unbanned from specific chat');
    } catch (error) {
      logger.debug({ error, chatId, telegramId }, 'Error unbanning user from specific chat');
      throw error;
    }
  }

  /**
   * Cron job: проверка истекших подписок
   * Запускается ежедневно, проверяет подписки которые истекли вчера
   */
  async checkExpiredSubscriptions(): Promise<{ processed: number; removed: number }> {
    logger.info('Starting expired subscriptions check...');

    // Находим пользователей с истекшей подпиской (с запасом 1 день)
    // Если подписка до 13 января, удаляем 14 января
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    try {
      const expiredUsers = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.isPro, true),
            isNotNull(users.subscriptionExpires),
            lt(users.subscriptionExpires, yesterday)
          )
        );

      logger.info({ count: expiredUsers.length }, 'Found users with expired subscriptions');

      let removed = 0;

      for (const user of expiredUsers) {
        try {
          // 🔟 Сначала удаляем из десятки (если состоит)
          try {
            await decadesService.removeUserFromDecade(user.telegramId);
          } catch (decadeError) {
            logger.warn({ error: decadeError, telegramId: user.telegramId }, 'Error removing user from decade');
          }

          // Удаляем из всех чатов
          await this.removeUserFromAllChats(user.telegramId);

          // Удаляем команду /menu у пользователя (убираем кнопку Меню)
          if (this.api) {
            try {
              await this.api.deleteMyCommands({ scope: { type: 'chat', chat_id: user.telegramId } });
              logger.info({ telegramId: user.telegramId }, 'Removed /menu command for expired user');
            } catch (cmdError) {
              logger.warn({ error: cmdError, telegramId: user.telegramId }, 'Failed to remove /menu command');
            }
          }

          // Перечитываем пользователя перед обновлением — webhook мог продлить подписку пока мы обрабатывали
          const [freshUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, user.id))
            .limit(1);

          if (freshUser && freshUser.subscriptionExpires && new Date(freshUser.subscriptionExpires) > new Date()) {
            logger.info({ telegramId: user.telegramId, subscriptionExpires: freshUser.subscriptionExpires }, 'Skipping is_pro=false: subscription was renewed during processing (race condition)');
            continue;
          }

          // Обновляем статус подписки
          await db
            .update(users)
            .set({ isPro: false })
            .where(eq(users.id, user.id));

          // Удаляем запись анкеты географии (пересоздастся при следующей оплате)
          try {
            await db
              .delete(geographySurveyResponses)
              .where(eq(geographySurveyResponses.userId, user.id));
          } catch (geoError) {
            logger.warn({ error: geoError, telegramId: user.telegramId }, 'Failed to delete geography survey on expiry');
          }

          removed++;
          logger.info({ telegramId: user.telegramId, subscriptionExpires: user.subscriptionExpires }, 'User removed due to expired subscription');
        } catch (error) {
          logger.error({ error, telegramId: user.telegramId }, 'Error processing expired user');
        }
      }

      logger.info({ processed: expiredUsers.length, removed }, 'Expired subscriptions check completed');
      return { processed: expiredUsers.length, removed };
    } catch (error) {
      logger.error({ error }, 'Error checking expired subscriptions');
      return { processed: 0, removed: 0 };
    }
  }

  /**
   * 🔔 Ежедневная рассылка напоминаний о продлении подписки
   * Запускается в 09:00 МСК. Проходит по всем is_pro пользователям
   * у которых subscription_expires через 2 дня, 1 день или сегодня.
   * auto_renewal_enabled = true → только информируем (списание автоматическое)
   * auto_renewal_enabled = false → предупреждаем что доступ закроется
   */
  async sendRenewalReminders(): Promise<{ sent2days: number; sent1day: number; sentToday: number }> {
    const now = new Date();

    // Границы "через 2 дня": subscription_expires между завтра 00:00 и послезавтра 00:00 МСК
    const mskOffset = 3 * 60 * 60 * 1000;
    const todayMsk = new Date(Math.floor((now.getTime() + mskOffset) / 86400000) * 86400000 - mskOffset);
    const day1Start = new Date(todayMsk.getTime() + 1 * 86400000);
    const day1End   = new Date(todayMsk.getTime() + 2 * 86400000);
    const day2Start = new Date(todayMsk.getTime() + 2 * 86400000);
    const day2End   = new Date(todayMsk.getTime() + 3 * 86400000);
    const todayEnd  = new Date(todayMsk.getTime() + 1 * 86400000);

    let sent2days = 0, sent1day = 0, sentToday = 0;

    try {
      // За 2 дня
      const users2days = await rawDb<{ telegram_id: bigint }[]>`
        SELECT telegram_id FROM users
        WHERE is_pro = true
          AND subscription_expires >= ${day2Start}
          AND subscription_expires <  ${day2End}
          AND telegram_id IS NOT NULL
      `;
      for (const u of users2days) {
        try {
          const tgId = Number(u.telegram_id);
          await sendRenewal2Days(tgId, tgId);
          sent2days++;
          logger.info({ telegramId: tgId }, '🔔 Renewal reminder sent: 2 days');
        } catch (e) {
          logger.error({ error: e, telegramId: u.telegram_id }, 'Failed to send 2-day renewal reminder');
        }
      }

      // За 1 день
      const users1day = await rawDb<{ telegram_id: bigint }[]>`
        SELECT telegram_id FROM users
        WHERE is_pro = true
          AND subscription_expires >= ${day1Start}
          AND subscription_expires <  ${day1End}
          AND telegram_id IS NOT NULL
      `;
      for (const u of users1day) {
        try {
          const tgId = Number(u.telegram_id);
          await sendRenewal1Day(tgId, tgId);
          sent1day++;
          logger.info({ telegramId: tgId }, '🔔 Renewal reminder sent: 1 day');
        } catch (e) {
          logger.error({ error: e, telegramId: u.telegram_id }, 'Failed to send 1-day renewal reminder');
        }
      }

      // Сегодня
      const usersToday = await rawDb<{ telegram_id: bigint }[]>`
        SELECT telegram_id FROM users
        WHERE is_pro = true
          AND subscription_expires >= ${todayMsk}
          AND subscription_expires <  ${todayEnd}
          AND telegram_id IS NOT NULL
      `;
      for (const u of usersToday) {
        try {
          const tgId = Number(u.telegram_id);
          await sendRenewalToday(tgId, tgId);
          sentToday++;
          logger.info({ telegramId: tgId }, '🔔 Renewal reminder sent: today');
        } catch (e) {
          logger.error({ error: e, telegramId: u.telegram_id }, 'Failed to send today renewal reminder');
        }
      }

      logger.info({ sent2days, sent1day, sentToday }, '🔔 Renewal reminders completed');
      return { sent2days, sent1day, sentToday };
    } catch (error) {
      logger.error({ error }, 'Error sending renewal reminders');
      return { sent2days, sent1day, sentToday };
    }
  }
}

export const subscriptionGuardService = new SubscriptionGuardService();
