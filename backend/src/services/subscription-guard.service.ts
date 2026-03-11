/**
 * 🛡️ SUBSCRIPTION GUARD SERVICE
 * Контроль доступа к каналу и чатам по подписке
 */

import { Api } from 'grammy';
import { db, rawDb } from '@/db';
import { users } from '@/db/schema';
import { eq, lt, and, isNotNull, gte, sql } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { cache } from '@/utils/redis';
import { decadesService } from '@/services/decades.service';
import { sendRenewal2Days, sendRenewal1Day, sendRenewalToday, sendGiftExpiry3Days, sendGiftExpiry2Days, sendGiftExpiry1Day } from '@/modules/bot/post-payment-funnels';

// Защищённые каналы клуба
const PROTECTED_CHANNEL_IDS = [
  -1002580645337,  // Основной канал клуба
  -1003590120817,  // Дополнительный канал
];

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

  // 🔒 Защита от двойной отправки напоминаний
  private renewalRemindersRunning = false; // мьютекс — не запускать одновременно (in-memory, сбрасывается при рестарте)
  // "уже отправлено сегодня" хранится в Redis с TTL 25ч — переживает рестарты

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

    try {
      const result = await rawDb<{ platform_id: number | null }[]>`
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

          removed++;
          logger.info({ telegramId: user.telegramId, subscriptionExpires: user.subscriptionExpires }, 'User removed due to expired subscription');
        } catch (error) {
          logger.error({ error, telegramId: user.telegramId }, 'Error processing expired user');
        }
      }

      logger.info({ processed: expiredUsers.length, removed }, 'Expired subscriptions check completed');

      // 🧹 Дополнительная очистка: убираем из десяток пользователей с is_pro=false
      // Это страховка на случай если removeUserFromDecade упал при основной обработке
      await this.cleanupOrphanedDecadeMembers();

      return { processed: expiredUsers.length, removed };
    } catch (error) {
      logger.error({ error }, 'Error checking expired subscriptions');
      return { processed: 0, removed: 0 };
    }
  }

  /**
   * 🧹 Очистка "сирот" в десятках: пользователи с is_pro=false которые ещё числятся активными
   * Это страховка когда removeUserFromDecade упал во время основного cron или
   * is_pro был выставлен вручную без удаления из десятки
   */
  async cleanupOrphanedDecadeMembers(): Promise<{ cleaned: number }> {
    try {
      // Найти все активные записи в decade_members где пользователь уже не is_pro
      const orphans = await rawDb<{ dm_id: string; decade_id: string; telegram_id: string }[]>`
        SELECT dm.id as dm_id, dm.decade_id, u.telegram_id::text
        FROM decade_members dm
        JOIN users u ON u.id = dm.user_id
        WHERE dm.left_at IS NULL
          AND u.is_pro = false
      `;

      if (orphans.length === 0) {
        logger.info('🧹 No orphaned decade members found');
        return { cleaned: 0 };
      }

      logger.info({ count: orphans.length }, '🧹 Found orphaned decade members (is_pro=false still in decades)');

      let cleaned = 0;
      for (const orphan of orphans) {
        try {
          await decadesService.removeUserFromDecade(Number(orphan.telegram_id));
          cleaned++;
          logger.info({ telegramId: orphan.telegram_id, decadeId: orphan.decade_id }, '🧹 Removed orphaned member from decade');
        } catch (e) {
          logger.warn({ err: e, telegramId: orphan.telegram_id, decadeId: orphan.decade_id }, '🧹 Failed to remove orphaned member');
        }
      }

      logger.info({ cleaned }, '🧹 Orphaned decade members cleanup completed');
      return { cleaned };
    } catch (error) {
      logger.error({ err: error }, '🧹 Error during orphaned decade members cleanup');
      return { cleaned: 0 };
    }
  }

  /**
   * 🔔 Ежедневная рассылка напоминаний о продлении подписки
   * Запускается в 09:00 МСК. Проходит по всем is_pro пользователям
   * у которых subscription_expires через 2 дня, 1 день или сегодня.
   * auto_renewal_enabled = true → только информируем (списание автоматическое)
   * auto_renewal_enabled = false → предупреждаем что доступ закроется
   */
  async sendRenewalReminders(force = false): Promise<{ sent2days: number; sent1day: number; sentToday: number; sentGift3days: number }> {
    const now = new Date();

    // Границы "через 2 дня": subscription_expires между завтра 00:00 и послезавтра 00:00 МСК
    const mskOffset = 3 * 60 * 60 * 1000;
    const todayMsk = new Date(Math.floor((now.getTime() + mskOffset) / 86400000) * 86400000 - mskOffset);

    // Текущая дата в МСК в формате YYYY-MM-DD — ключ в Redis
    const todayMskStr = new Date(now.getTime() + mskOffset).toISOString().slice(0, 10);
    const redisKey = `cron:renewal-reminders:${todayMskStr}`;

    // 🔒 Защита от двойного запуска (in-memory мьютекс)
    if (this.renewalRemindersRunning) {
      logger.warn('Renewal reminders already running, skipping duplicate call');
      return { sent2days: 0, sent1day: 0, sentToday: 0, sentGift3days: 0 };
    }

    // 🔒 Защита от повторной отправки в тот же день — Redis (переживает рестарты)
    if (!force) {
      const alreadySent = await cache.exists(redisKey);
      if (alreadySent) {
        logger.info({ date: todayMskStr, redisKey }, 'Renewal reminders already sent today (Redis), skipping');
        return { sent2days: 0, sent1day: 0, sentToday: 0, sentGift3days: 0 };
      }
    }

    this.renewalRemindersRunning = true;

    const day1Start = new Date(todayMsk.getTime() + 1 * 86400000);
    const day1End   = new Date(todayMsk.getTime() + 2 * 86400000);
    const day2Start = new Date(todayMsk.getTime() + 2 * 86400000);
    const day2End   = new Date(todayMsk.getTime() + 3 * 86400000);
    const day3Start = new Date(todayMsk.getTime() + 3 * 86400000);
    const day3End   = new Date(todayMsk.getTime() + 4 * 86400000);
    const todayEnd  = new Date(todayMsk.getTime() + 1 * 86400000);

    logger.info({ todayMsk, day1Start, day1End, day2Start, day2End, day3Start, day3End, todayEnd }, '🔔 Renewal reminders date windows');

    let sent2days = 0, sent1day = 0, sentToday = 0, sentGift3days = 0;

    try {
      // За 2 дня — используем Drizzle ORM (как checkExpiredSubscriptions)
      const users2days = await db
        .select({ telegramId: users.telegramId, gifted: users.gifted, cloudpaymentsSubscriptionId: users.cloudpaymentsSubscriptionId })
        .from(users)
        .where(
          and(
            eq(users.isPro, true),
            isNotNull(users.telegramId),
            gte(users.subscriptionExpires, day2Start),
            lt(users.subscriptionExpires, day2End)
          )
        );
      logger.info({ count: users2days.length }, '🔔 Users with subscription expiring in 2 days');
      for (const u of users2days) {
        try {
          const tgId = u.telegramId!;
          const hasCpSubscription = !!u.cloudpaymentsSubscriptionId;
          if (u.gifted) {
            await sendGiftExpiry2Days(tgId, tgId);
            logger.info({ telegramId: tgId }, '🔔 Gift expiry reminder sent: 2 days');
          } else {
            await sendRenewal2Days(tgId, tgId, hasCpSubscription);
            logger.info({ telegramId: tgId, hasCpSubscription }, '🔔 Renewal reminder sent: 2 days');
          }
          sent2days++;
        } catch (e) {
          logger.error({ err: e, telegramId: u.telegramId }, 'Failed to send 2-day renewal reminder');
        }
      }

      // За 1 день
      const users1day = await db
        .select({ telegramId: users.telegramId, gifted: users.gifted, cloudpaymentsSubscriptionId: users.cloudpaymentsSubscriptionId })
        .from(users)
        .where(
          and(
            eq(users.isPro, true),
            isNotNull(users.telegramId),
            gte(users.subscriptionExpires, day1Start),
            lt(users.subscriptionExpires, day1End)
          )
        );
      logger.info({ count: users1day.length }, '🔔 Users with subscription expiring in 1 day');
      for (const u of users1day) {
        try {
          const tgId = u.telegramId!;
          const hasCpSubscription = !!u.cloudpaymentsSubscriptionId;
          if (u.gifted) {
            await sendGiftExpiry1Day(tgId, tgId);
            logger.info({ telegramId: tgId }, '🔔 Gift expiry reminder sent: 1 day');
          } else {
            await sendRenewal1Day(tgId, tgId, hasCpSubscription);
            logger.info({ telegramId: tgId, hasCpSubscription }, '🔔 Renewal reminder sent: 1 day');
          }
          sent1day++;
        } catch (e) {
          logger.error({ err: e, telegramId: u.telegramId }, 'Failed to send 1-day renewal reminder');
        }
      }

      // Сегодня — только не-подарочные (для gifted нет отдельного уведомления в день X)
      const usersToday = await db
        .select({ telegramId: users.telegramId, cloudpaymentsSubscriptionId: users.cloudpaymentsSubscriptionId })
        .from(users)
        .where(
          and(
            eq(users.isPro, true),
            eq(users.gifted, false),
            isNotNull(users.telegramId),
            gte(users.subscriptionExpires, todayMsk),
            lt(users.subscriptionExpires, todayEnd)
          )
        );
      logger.info({ count: usersToday.length }, '🔔 Users with subscription expiring today (non-gifted)');
      for (const u of usersToday) {
        try {
          const tgId = u.telegramId!;
          const hasCpSubscription = !!u.cloudpaymentsSubscriptionId;
          await sendRenewalToday(tgId, tgId, hasCpSubscription);
          sentToday++;
          logger.info({ telegramId: tgId, hasCpSubscription }, '🔔 Renewal reminder sent: today');
        } catch (e) {
          logger.error({ err: e, telegramId: u.telegramId }, 'Failed to send today renewal reminder');
        }
      }

      // За 3 дня — только подарочные
      const usersGift3days = await db
        .select({ telegramId: users.telegramId })
        .from(users)
        .where(
          and(
            eq(users.isPro, true),
            eq(users.gifted, true),
            isNotNull(users.telegramId),
            gte(users.subscriptionExpires, day3Start),
            lt(users.subscriptionExpires, day3End)
          )
        );
      logger.info({ count: usersGift3days.length }, '🔔 Gifted users with subscription expiring in 3 days');
      for (const u of usersGift3days) {
        try {
          const tgId = u.telegramId!;
          await sendGiftExpiry3Days(tgId, tgId);
          sentGift3days++;
          logger.info({ telegramId: tgId }, '🔔 Gift expiry reminder sent: 3 days');
        } catch (e) {
          logger.error({ err: e, telegramId: u.telegramId }, 'Failed to send 3-day gift expiry reminder');
        }
      }

      // Ставим флаг в Redis: TTL 25 часов — переживает рестарты, сбросится к следующему дню
      await cache.set(redisKey, { sent2days, sent1day, sentToday, sentGift3days, sentAt: now.toISOString() }, 25 * 3600);
      logger.info({ sent2days, sent1day, sentToday, sentGift3days }, '🔔 Renewal reminders completed');
      return { sent2days, sent1day, sentToday, sentGift3days };
    } catch (error) {
      logger.error({ err: error }, 'Error sending renewal reminders');
      return { sent2days, sent1day, sentToday, sentGift3days };
    } finally {
      this.renewalRemindersRunning = false;
    }
  }

  /**
   * 🧹 Чистка неактивных участников десяток
   * Условия удаления (оба применяются к is_pro=true пользователям):
   *   1. Нет ни одного #отчет за последние 30 дней (трекинг с момента последней активности)
   *   2. Никогда не сдавал отчет И состоит в десятке больше 30 дней
   * Лидеры десяток не удаляются.
   * Пользователи без подписки (is_pro=false) обрабатываются отдельно (cleanupOrphanedDecadeMembers).
   *
   * @param dryRun true — только вернуть список, false — реально удалить
   */
  async removeInactiveDecadeMembers(dryRun = true): Promise<{
    members: Array<{
      telegramId: string;
      username: string | null;
      firstName: string | null;
      city: string;
      decadeNumber: number;
      joinedAt: Date;
      lastReportAt: Date | null;
    }>;
    total: number;
    dryRun: boolean;
  }> {
    try {
      // Найти активных pro-участников десяток, у которых нет отчётов за 30+ дней
      // (или никогда не было, и в десятке уже 30+ дней)
      const inactive = await rawDb<{
        telegram_id: string;
        username: string | null;
        first_name: string | null;
        city: string;
        number: number;
        joined_at: Date;
        last_report_at: Date | null;
      }[]>`
        SELECT
          dm.telegram_id::text,
          u.username,
          u.first_name,
          d.city,
          d.number,
          dm.joined_at,
          MAX(et.created_at) as last_report_at
        FROM decade_members dm
        JOIN users u ON u.id = dm.user_id
        JOIN decades d ON d.id = dm.decade_id
        LEFT JOIN energy_transactions et
          ON et.user_id = dm.user_id
          AND et.reason = 'Ежедневный отчет'
          AND et.type = 'income'
        WHERE dm.left_at IS NULL
          AND dm.is_leader = false
          AND u.is_pro = true
          AND d.is_active = true
        GROUP BY dm.telegram_id, u.username, u.first_name, d.city, d.number, dm.joined_at
        HAVING
          dm.joined_at < NOW() - INTERVAL '30 days'
          AND (MAX(et.created_at) IS NULL OR MAX(et.created_at) < NOW() - INTERVAL '30 days')
        ORDER BY d.city, d.number, dm.joined_at
      `;

      const members = inactive.map((r) => ({
        telegramId: r.telegram_id,
        username: r.username,
        firstName: r.first_name,
        city: r.city,
        decadeNumber: r.number,
        joinedAt: r.joined_at,
        lastReportAt: r.last_report_at,
      }));

      logger.info(
        { total: members.length, dryRun },
        '🧹 Inactive decade members found'
      );

      if (!dryRun) {
        let removed = 0;
        for (const member of members) {
          try {
            await decadesService.removeUserFromDecade(Number(member.telegramId));
            removed++;
            logger.info(
              { telegramId: member.telegramId, city: member.city, number: member.decadeNumber },
              '🧹 Removed inactive decade member'
            );
          } catch (e) {
            logger.warn(
              { err: e, telegramId: member.telegramId },
              '🧹 Failed to remove inactive decade member'
            );
          }
        }
        logger.info({ removed, total: members.length }, '🧹 Inactive decade cleanup completed');
      }

      return { members, total: members.length, dryRun };
    } catch (error) {
      logger.error({ err: error }, '🧹 Error during inactive decade members cleanup');
      return { members: [], total: 0, dryRun };
    }
  }
}

export const subscriptionGuardService = new SubscriptionGuardService();
