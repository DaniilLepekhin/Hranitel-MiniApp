/**
 * 🛡️ SUBSCRIPTION GUARD SERVICE
 * Контроль доступа к каналу и чатам по подписке
 */

import { Api } from 'grammy';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, lt, and, isNotNull } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import postgres from 'postgres';

// Канал клуба
const CLUB_CHANNEL_ID = -1002580645337;

// Подключение к старой БД для city_chats_ik
const oldDbConnection = postgres({
  host: '31.128.36.81',
  port: 5423,
  database: 'club_hranitel',
  username: 'postgres',
  password: 'kH*kyrS&9z7K',
  ssl: false,
});

interface CityChat {
  id: number;
  chat_id: string | null;
  country: string;
  city: string;
}

class SubscriptionGuardService {
  private api: Api | null = null;

  /**
   * Инициализация сервиса с API бота
   */
  init(api: Api) {
    this.api = api;
    logger.info('SubscriptionGuardService initialized');
  }

  /**
   * Получить все chat_id из city_chats_ik
   */
  async getCityChatIds(): Promise<number[]> {
    try {
      const result = await oldDbConnection<{ chat_id: string | null }[]>`
        SELECT chat_id
        FROM city_chats_ik
        WHERE chat_id IS NOT NULL AND chat_id != ''
      `;

      const chatIds = result
        .map(row => {
          // chat_id может быть в формате "-100123456" или просто "123456"
          const id = parseInt(row.chat_id || '', 10);
          return isNaN(id) ? null : id;
        })
        .filter((id): id is number => id !== null);

      logger.info({ count: chatIds.length }, 'Fetched city chat IDs');
      return chatIds;
    } catch (error) {
      logger.error({ error }, 'Error fetching city chat IDs');
      return [];
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
    const isProtectedChat = chatId === CLUB_CHANNEL_ID || cityChatIds.includes(chatId);

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
   * Удалить пользователя из канала и всех чатов городов
   */
  async removeUserFromAllChats(telegramId: number): Promise<void> {
    if (!this.api) {
      logger.error('API not initialized');
      return;
    }

    const chatIds = [CLUB_CHANNEL_ID, ...(await this.getCityChatIds())];

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
   * Разблокировать пользователя во всех чатах (при оплате)
   */
  async unbanUserFromAllChats(telegramId: number): Promise<void> {
    if (!this.api) {
      logger.error('API not initialized');
      return;
    }

    const chatIds = [CLUB_CHANNEL_ID, ...(await this.getCityChatIds())];

    for (const chatId of chatIds) {
      try {
        await this.api.unbanChatMember(chatId, telegramId, { only_if_banned: true });
        logger.debug({ chatId, telegramId }, 'User unbanned from chat');
      } catch (error) {
        // Игнорируем ошибки
        logger.debug({ error, chatId, telegramId }, 'Error unbanning user from chat');
      }
    }

    logger.info({ telegramId, chatsCount: chatIds.length }, 'User unbanned from all chats');
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
          // Удаляем из всех чатов
          await this.removeUserFromAllChats(user.telegramId);

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
      return { processed: expiredUsers.length, removed };
    } catch (error) {
      logger.error({ error }, 'Error checking expired subscriptions');
      return { processed: 0, removed: 0 };
    }
  }
}

export const subscriptionGuardService = new SubscriptionGuardService();
