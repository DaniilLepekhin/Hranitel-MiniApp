/**
 * 🔟 DECADES SERVICE
 * Управление десятками: создание, распределение участников, контроль доступа
 */

import { Api } from 'grammy';
import { db } from '@/db';
import {
  decades,
  decadeMembers,
  leaderReports,
  users,
  leaderTestResults,
  type Decade,
  type DecadeMember,
} from '@/db/schema';
import { eq, and, isNull, sql, desc, lt } from 'drizzle-orm';
import { logger } from '@/utils/logger';

class DecadesService {
  private api: Api | null = null;

  /**
   * Инициализация с API бота
   */
  init(api: Api) {
    this.api = api;
    logger.info('DecadesService initialized');
  }

  // ============================================================================
  // СОЗДАНИЕ ДЕСЯТКИ
  // ============================================================================

  /**
   * Проверить статус лидера при добавлении бота в чат
   * Возвращает детальную информацию для обработки 3-х сценариев:
   * - CLEAN: можно создать новую десятку
   * - BETRAYAL: лидер пытается создать вторую десятку (бот должен выйти)
   * - RETURN: лидер вернул бота в тот же чат (реактивация)
   */
  async checkLeaderDecadeStatus(
    telegramId: number,
    currentChatId: number
  ): Promise<{
    status: 'clean' | 'betrayal' | 'return' | 'not_leader';
    reason?: string;
    city?: string;
    userId?: string;
    existingDecade?: Decade;
  }> {
    // 1. Найти пользователя
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (!user) {
      return { status: 'not_leader', reason: 'Пользователь не найден' };
    }

    if (!user.city) {
      return { status: 'not_leader', reason: 'Не указан город в профиле' };
    }

    // 2. Проверить результат теста лидера
    const [testResult] = await db
      .select()
      .from(leaderTestResults)
      .where(
        and(eq(leaderTestResults.userId, user.id), eq(leaderTestResults.passed, true))
      )
      .orderBy(desc(leaderTestResults.createdAt))
      .limit(1);

    if (!testResult) {
      return { status: 'not_leader', reason: 'Тест на лидера не пройден' };
    }

    // 3. Проверить, есть ли активная десятка
    const [existingDecade] = await db
      .select()
      .from(decades)
      .where(and(eq(decades.leaderTelegramId, telegramId), eq(decades.isActive, true)))
      .limit(1);

    if (existingDecade) {
      // Сравниваем chat_id
      if (existingDecade.tgChatId === currentChatId) {
        // RETURN: бот вернулся в тот же чат
        return {
          status: 'return',
          city: user.city,
          userId: user.id,
          existingDecade,
        };
      } else {
        // BETRAYAL: лидер пытается создать вторую десятку
        return {
          status: 'betrayal',
          reason: `У вас уже есть активная Десятка №${existingDecade.number} в городе ${existingDecade.city}`,
          existingDecade,
        };
      }
    }

    // CLEAN: можно создать новую десятку
    return { status: 'clean', city: user.city, userId: user.id };
  }

  /**
   * Реактивировать десятку (когда бот вернулся в тот же чат)
   */
  async reactivateDecade(decadeId: string): Promise<void> {
    await db
      .update(decades)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(decades.id, decadeId));

    logger.info({ decadeId }, 'Decade reactivated');
  }

  /**
   * Проверить, может ли пользователь создать десятку
   */
  async canCreateDecade(telegramId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    city?: string;
    userId?: string;
  }> {
    // 1. Найти пользователя
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (!user) {
      return { canCreate: false, reason: 'Пользователь не найден' };
    }

    if (!user.city) {
      return { canCreate: false, reason: 'Не указан город в профиле' };
    }

    // 2. Проверить результат теста лидера
    const [testResult] = await db
      .select()
      .from(leaderTestResults)
      .where(
        and(eq(leaderTestResults.userId, user.id), eq(leaderTestResults.passed, true))
      )
      .orderBy(desc(leaderTestResults.createdAt))
      .limit(1);

    if (!testResult) {
      return { canCreate: false, reason: 'Тест на лидера не пройден' };
    }

    // 3. Проверить, не ведёт ли уже десятку
    const [existingDecade] = await db
      .select()
      .from(decades)
      .where(and(eq(decades.leaderTelegramId, telegramId), eq(decades.isActive, true)))
      .limit(1);

    if (existingDecade) {
      return { canCreate: false, reason: 'Вы уже ведёте активную десятку' };
    }

    return { canCreate: true, city: user.city, userId: user.id };
  }

  /**
   * Создать десятку при добавлении бота в чат
   *
   * ⚠️ RACE CONDITION PROTECTED:
   * - Номер вычисляется внутри транзакции с FOR UPDATE
   * - Unique constraint (city, number) защищает от дубликатов
   * - Unique constraint на leader_telegram_id WHERE is_active = true защищает от двойного лидерства
   * - При конфликте - retry до 3 раз
   */
  async createDecade(
    tgChatId: number,
    leaderTelegramId: number,
    chatTitle?: string
  ): Promise<{ success: boolean; decade?: Decade; error?: string }> {
    // Проверка прав (вне транзакции - только чтение)
    const canCreate = await this.canCreateDecade(leaderTelegramId);
    if (!canCreate.canCreate) {
      return { success: false, error: canCreate.reason };
    }

    const city = canCreate.city!;
    const userId = canCreate.userId!;

    // Создать invite link ДО транзакции (внешний API)
    let inviteLink: string | null = null;
    if (this.api) {
      try {
        const link = await this.api.createChatInviteLink(tgChatId, {
          creates_join_request: false, // Прямой вход
        });
        inviteLink = link.invite_link;
      } catch (error) {
        logger.warn({ error, tgChatId }, 'Failed to create invite link');
      }
    }

    // Retry loop для race condition на unique constraint
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Вся логика в транзакции
        const [newDecade] = await db.transaction(async tx => {
          // 🔒 Получить следующий номер
          // Используем SERIALIZABLE или полагаемся на unique constraint (city, number)
          // FOR UPDATE не работает с агрегатами, поэтому просто читаем MAX
          const [maxNumber] = await tx
            .select({ max: sql<number>`COALESCE(MAX(${decades.number}), 0)` })
            .from(decades)
            .where(eq(decades.city, city));

          const nextNumber = (maxNumber?.max || 0) + 1;

          // Создать десятку
          const [decade] = await tx
            .insert(decades)
            .values({
              city,
              number: nextNumber,
              tgChatId,
              inviteLink,
              leaderUserId: userId,
              leaderTelegramId,
              chatTitle: chatTitle || `Десятка №${nextNumber} ${city}`,
              currentMembers: 1,
              isAvailableForDistribution: true, // Сразу делаем доступной для распределения
            })
            .returning();

          // Добавить лидера как участника
          await tx.insert(decadeMembers).values({
            decadeId: decade.id,
            userId: userId,
            telegramId: leaderTelegramId,
            isLeader: true,
          });

          // Обновить результат теста - указать десятку
          await tx
            .update(leaderTestResults)
            .set({
              canLeadDecade: true,
              decadeId: decade.id,
            })
            .where(and(eq(leaderTestResults.userId, userId), eq(leaderTestResults.passed, true)));

          return [decade];
        });

        logger.info(
          {
            decadeId: newDecade.id,
            city,
            number: newDecade.number,
            leaderTelegramId,
            tgChatId,
            attempt,
          },
          'Decade created'
        );

        return { success: true, decade: newDecade };
      } catch (error: any) {
        lastError = error;

        // Проверяем unique constraint violation (23505 - PostgreSQL)
        const isUniqueViolation =
          error?.code === '23505' ||
          error?.message?.includes('unique constraint') ||
          error?.message?.includes('duplicate key');

        if (isUniqueViolation && attempt < MAX_RETRIES) {
          logger.warn(
            { city, leaderTelegramId, attempt, error: error?.message },
            'Decade creation race condition, retrying...'
          );
          // Небольшая случайная задержка перед retry
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
          continue;
        }

        // Критическая ошибка или исчерпаны попытки
        logger.error(
          { error, city, leaderTelegramId, attempt },
          'Failed to create decade'
        );

        // ⚠️ Compensation: если invite link создан но БД failed - оставляем как есть
        // (link станет невалидным если бот покинет чат)

        throw error;
      }
    }

    return { success: false, error: lastError?.message || 'Failed to create decade' };
  }

  // ============================================================================
  // РАСПРЕДЕЛЕНИЕ УЧАСТНИКОВ
  // ============================================================================

  /**
   * Найти подходящую десятку для участника
   */
  async findAvailableDecade(
    city: string
  ): Promise<{
    found: boolean;
    decade?: Decade;
    inviteLink?: string;
  }> {
    // Ищем активную, незаполненную десятку в городе, доступную для распределения
    const [availableDecade] = await db
      .select()
      .from(decades)
      .where(
        and(
          eq(decades.city, city),
          eq(decades.isActive, true),
          eq(decades.isFull, false),
          eq(decades.isAvailableForDistribution, true) // ← НОВОЕ: только доступные для распределения
        )
      )
      .orderBy(decades.number) // Заполняем по порядку
      .limit(1);

    if (!availableDecade) {
      return { found: false };
    }

    return {
      found: true,
      decade: availableDecade,
      inviteLink: availableDecade.inviteLink || undefined,
    };
  }

  /**
   * Записать участника в десятку (WebApp endpoint)
   *
   * ⚠️ RACE CONDITION PROTECTED:
   * - Вся логика в одной транзакции
   * - FOR UPDATE блокирует десятку от параллельных записей
   * - Проверка currentMembers < maxMembers внутри транзакции
   * - При переполнении - откат и поиск другой десятки
   */
  async assignUserToDecade(
    telegramId: number,
    decadeId?: string // Если не указано - автоматический подбор
  ): Promise<{
    success: boolean;
    inviteLink?: string;
    decadeName?: string;
    error?: string;
  }> {
    // Найти пользователя (вне транзакции - только чтение)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (!user) {
      return { success: false, error: 'Пользователь не найден' };
    }

    if (!user.city) {
      return { success: false, error: 'Выберите город в профиле' };
    }

    if (!user.isPro) {
      return { success: false, error: 'Для вступления в десятку нужна активная подписка' };
    }

    // Retry loop для случая когда десятка заполнилась между поиском и записью
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await db.transaction(async tx => {
          // 🔒 Проверить существующее членство С БЛОКИРОВКОЙ
          const [existingMembership] = await tx
            .select()
            .from(decadeMembers)
            .where(and(eq(decadeMembers.userId, user.id), isNull(decadeMembers.leftAt)))
            .for('update')
            .limit(1);

          if (existingMembership) {
            // Уже состоит - вернуть инфо о текущей десятке
            const [currentDecade] = await tx
              .select()
              .from(decades)
              .where(eq(decades.id, existingMembership.decadeId))
              .limit(1);

            return {
              success: true,
              inviteLink: currentDecade?.inviteLink || undefined,
              decadeName: `Десятка №${currentDecade?.number} ${currentDecade?.city}`,
              alreadyMember: true,
            };
          }

          // 🔒 Найти и заблокировать подходящую десятку
          let decade: Decade | undefined;

          if (decadeId) {
            // Конкретная десятка
            const [specified] = await tx
              .select()
              .from(decades)
              .where(
                and(
                  eq(decades.id, decadeId),
                  eq(decades.isActive, true),
                  eq(decades.isFull, false),
                  lt(decades.currentMembers, decades.maxMembers) // Явная проверка
                )
              )
              .for('update')
              .limit(1);
            decade = specified;
          } else {
            // Автоматический подбор - первая свободная в городе
            const [available] = await tx
              .select()
              .from(decades)
              .where(
                and(
                  eq(decades.city, user.city!),
                  eq(decades.isActive, true),
                  eq(decades.isFull, false),
                  eq(decades.isAvailableForDistribution, true), // ← НОВОЕ: только доступные для распределения
                  lt(decades.currentMembers, decades.maxMembers) // Явная проверка
                )
              )
              .orderBy(decades.number)
              .for('update')
              .limit(1);
            decade = available;
          }

          if (!decade) {
            // Нет доступных десяток
            return {
              success: false,
              error: decadeId
                ? 'Десятка не найдена или заполнена'
                : `В городе ${user.city} пока нет доступных десяток`,
              noDecadeAvailable: true,
            };
          }

          // Финальная проверка (paranoid check после блокировки)
          if (decade.currentMembers >= decade.maxMembers) {
            return {
              success: false,
              error: 'Десятка заполнилась',
              retryNeeded: true,
            };
          }

          // ✅ Добавить участника
          await tx.insert(decadeMembers).values({
            decadeId: decade.id,
            userId: user.id,
            telegramId,
            isLeader: false,
          });

          // ✅ Обновить счётчик атомарно
          const newCount = decade.currentMembers + 1;
          await tx
            .update(decades)
            .set({
              currentMembers: newCount,
              isFull: newCount >= decade.maxMembers,
              updatedAt: new Date(),
            })
            .where(eq(decades.id, decade.id));

          return {
            success: true,
            inviteLink: decade.inviteLink || undefined,
            decadeName: `Десятка №${decade.number} ${decade.city}`,
            decadeId: decade.id,
            city: decade.city,
          };
        });

        // Обработка результата транзакции
        if (result.retryNeeded && attempt < MAX_RETRIES) {
          logger.warn({ telegramId, attempt }, 'Decade filled during assignment, retrying...');
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
          continue;
        }

        if (result.success && !result.alreadyMember) {
          logger.info(
            {
              userId: user.id,
              telegramId,
              decadeId: result.decadeId,
              city: result.city,
              attempt,
            },
            'User assigned to decade'
          );
        }

        return {
          success: result.success,
          inviteLink: result.inviteLink,
          decadeName: result.decadeName,
          error: result.error,
        };
      } catch (error: any) {
        // Проверяем serialization failure (40001) или deadlock (40P01)
        const isRetryable =
          error?.code === '40001' ||
          error?.code === '40P01' ||
          error?.message?.includes('could not serialize') ||
          error?.message?.includes('deadlock');

        if (isRetryable && attempt < MAX_RETRIES) {
          logger.warn({ telegramId, attempt, error: error?.message }, 'Transaction conflict, retrying...');
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
          continue;
        }

        logger.error({ error, telegramId, attempt }, 'Failed to assign user to decade');
        throw error;
      }
    }

    return { success: false, error: 'Не удалось записаться в десятку, попробуйте позже' };
  }

  /**
   * Получить информацию о десятке пользователя
   */
  async getUserDecade(telegramId: number): Promise<{
    decade: Decade | null;
    membership: DecadeMember | null;
  }> {
    // Найти активное членство
    const [membership] = await db
      .select()
      .from(decadeMembers)
      .where(and(eq(decadeMembers.telegramId, telegramId), isNull(decadeMembers.leftAt)))
      .limit(1);

    if (!membership) {
      return { decade: null, membership: null };
    }

    // Получить информацию о десятке
    const [decade] = await db
      .select()
      .from(decades)
      .where(eq(decades.id, membership.decadeId))
      .limit(1);

    return { decade: decade || null, membership };
  }

  // ============================================================================
  // КОНТРОЛЬ ДОСТУПА К ЧАТУ ДЕСЯТКИ
  // ============================================================================

  /**
   * Проверить, является ли чат десяткой
   */
  async isDecadeChat(tgChatId: number): Promise<boolean> {
    const [decade] = await db
      .select({ id: decades.id })
      .from(decades)
      .where(eq(decades.tgChatId, tgChatId))
      .limit(1);

    return !!decade;
  }

  /**
   * Проверить право пользователя на вход в десятку
   */
  async canJoinDecadeChat(
    tgChatId: number,
    userTelegramId: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Найти десятку
    const [decade] = await db
      .select()
      .from(decades)
      .where(eq(decades.tgChatId, tgChatId))
      .limit(1);

    if (!decade) {
      return { allowed: true }; // Не десятка - не блокируем
    }

    // 🏅 ПРОВЕРКА АМБАССАДОРА: амбассадоры могут заходить в любые десятки без ограничений
    const [ambassadorCheck] = await db
      .select({ isAmbassador: users.isAmbassador })
      .from(users)
      .where(eq(users.telegramId, userTelegramId))
      .limit(1);

    if (ambassadorCheck?.isAmbassador) {
      logger.info({ userTelegramId, tgChatId, decadeId: decade.id }, 'Ambassador bypassed decade access check');
      return { allowed: true };
    }

    // ⚠️ ПЕРВАЯ ПРОВЕРКА: Десятка переполнена или заполнена?
    // Считаем реальное количество активных участников В ЧАТЕ через БД
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(decadeMembers)
      .where(
        and(
          eq(decadeMembers.decadeId, decade.id),
          isNull(decadeMembers.leftAt)
        )
      );

    const actualMembersCount = result?.count || 0;

    // Проверяем, не переполнена ли десятка СРАЗУ
    // Используем БД как источник истины для количества участников
    if (actualMembersCount >= decade.maxMembers) {
      // Десятка заполнена/переполнена - кикаем любого нового
      return {
        allowed: false,
        reason: 'Десятка заполнена. Откройте приложение клуба и нажмите "Вступить в десятку" - вы будете распределены в свободную десятку вашего города.',
      };
    }

    // ВТОРАЯ ПРОВЕРКА: Проверить, распределён ли пользователь в эту десятку
    const [membership] = await db
      .select()
      .from(decadeMembers)
      .where(
        and(
          eq(decadeMembers.decadeId, decade.id),
          eq(decadeMembers.telegramId, userTelegramId),
          isNull(decadeMembers.leftAt)
        )
      )
      .limit(1);

    if (!membership) {
      return {
        allowed: false,
        reason: 'Вы не распределены в эту десятку. Откройте приложение клуба и нажмите "Вступить в десятку".',
      };
    }

    // Проверить подписку
    const [user] = await db
      .select({ isPro: users.isPro })
      .from(users)
      .where(eq(users.telegramId, userTelegramId))
      .limit(1);

    if (!user?.isPro) {
      return {
        allowed: false,
        reason: 'Для участия в десятке нужна активная подписка.',
      };
    }

    return { allowed: true };
  }

  /**
   * Обработка входа в чат десятки
   */
  async handleDecadeJoinAttempt(tgChatId: number, userTelegramId: number): Promise<void> {
    if (!this.api) return;

    const isDecade = await this.isDecadeChat(tgChatId);
    if (!isDecade) return;

    const { allowed, reason } = await this.canJoinDecadeChat(tgChatId, userTelegramId);

    if (!allowed) {
      logger.info({ tgChatId, userTelegramId, reason }, 'Unauthorized decade join attempt');

      try {
        // Кик + разбан (как в subscription-guard - не копим заблоченных)
        await this.api.banChatMember(tgChatId, userTelegramId);
        await this.api.unbanChatMember(tgChatId, userTelegramId, { only_if_banned: true });

        // Отправить сообщение пользователю
        try {
          await this.api.sendMessage(
            userTelegramId,
            `⛔ ${reason}\n\nОткройте приложение клуба и нажмите "Вступить в десятку".`
          );
        } catch (msgError) {
          logger.debug({ error: msgError, userTelegramId }, 'Could not send message to user');
        }
      } catch (error) {
        logger.error({ error, tgChatId, userTelegramId }, 'Error handling unauthorized decade join');
      }
    }
  }

  // ============================================================================
  // ВЫГОН ПРИ ИСТЕЧЕНИИ ПОДПИСКИ
  // ============================================================================

  /**
   * Удалить пользователя из десятки (при истечении подписки)
   */
  async removeUserFromDecade(telegramId: number): Promise<void> {
    // Найти активное членство
    const [membership] = await db
      .select()
      .from(decadeMembers)
      .where(and(eq(decadeMembers.telegramId, telegramId), isNull(decadeMembers.leftAt)))
      .limit(1);

    if (!membership) return;

    // Найти десятку
    const [decade] = await db
      .select()
      .from(decades)
      .where(eq(decades.id, membership.decadeId))
      .limit(1);

    if (!decade) return;

    // Обновить в транзакции
    await db.transaction(async tx => {
      // Пометить как вышедшего
      await tx
        .update(decadeMembers)
        .set({ leftAt: new Date() })
        .where(eq(decadeMembers.id, membership.id));

      // Обновить счётчик
      const newCount = Math.max(0, decade.currentMembers - 1);
      await tx
        .update(decades)
        .set({
          currentMembers: newCount,
          isFull: false, // Освободилось место
          updatedAt: new Date(),
        })
        .where(eq(decades.id, decade.id));
    });

    // Выгнать из чата (ban + unban)
    if (this.api && decade.tgChatId) {
      try {
        await this.api.banChatMember(decade.tgChatId, telegramId);
        await this.api.unbanChatMember(decade.tgChatId, telegramId, { only_if_banned: true });
        logger.info({ telegramId, decadeId: decade.id }, 'User removed from decade chat');
      } catch (error) {
        logger.warn({ error, telegramId }, 'Error removing user from decade chat');
      }
    }

    logger.info({ telegramId, decadeId: decade.id }, 'User removed from decade');
  }

  /**
   * Деактивировать десятку (когда бот удалён из чата)
   */
  async deactivateDecade(tgChatId: number): Promise<void> {
    const [decade] = await db
      .select()
      .from(decades)
      .where(eq(decades.tgChatId, tgChatId))
      .limit(1);

    if (!decade) return;

    // Деактивировать
    await db
      .update(decades)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(decades.id, decade.id));

    // Отметить всех участников как вышедших
    await db
      .update(decadeMembers)
      .set({ leftAt: new Date() })
      .where(and(eq(decadeMembers.decadeId, decade.id), isNull(decadeMembers.leftAt)));

    logger.info(
      { decadeId: decade.id, city: decade.city, number: decade.number },
      'Decade deactivated'
    );
  }

  /**
   * Обновить название чата десятки
   */
  async updateChatTitle(tgChatId: number, newTitle: string): Promise<void> {
    const [decade] = await db
      .select()
      .from(decades)
      .where(eq(decades.tgChatId, tgChatId))
      .limit(1);

    if (!decade) return;

    await db
      .update(decades)
      .set({
        chatTitle: newTitle,
        updatedAt: new Date(),
      })
      .where(eq(decades.id, decade.id));

    logger.info(
      { decadeId: decade.id, oldTitle: decade.chatTitle, newTitle },
      'Decade chat title updated'
    );
  }

  // ============================================================================
  // СВЕТОФОР (LEADER REPORTS)
  // ============================================================================

  /**
   * Получить текущую неделю
   */
  getWeekInfo(): { weekStart: Date; weekNumber: number; year: number } {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    // ISO week number
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + jan1.getDay() + 1) / 7);

    return {
      weekStart,
      weekNumber,
      year: now.getFullYear(),
    };
  }

  /**
   * Проверить, можно ли отправить отчёт (только по пятницам или позже)
   */
  canSubmitReport(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = воскресенье, 5 = пятница
    return dayOfWeek >= 5 || dayOfWeek === 0; // Пятница, суббота, воскресенье
  }

  /**
   * Отправить отчёт светофора
   */
  async submitLeaderReport(
    leaderTelegramId: number,
    status: 'green' | 'red',
    problemDescription?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Найти десятку лидера
    const [decade] = await db
      .select()
      .from(decades)
      .where(and(eq(decades.leaderTelegramId, leaderTelegramId), eq(decades.isActive, true)))
      .limit(1);

    if (!decade) {
      return { success: false, error: 'Вы не ведёте активную десятку' };
    }

    // Найти пользователя
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, leaderTelegramId))
      .limit(1);

    if (!user) {
      return { success: false, error: 'Пользователь не найден' };
    }

    // Проверить обязательное описание при red
    if (status === 'red' && !problemDescription?.trim()) {
      return { success: false, error: 'Опишите проблему при красном статусе' };
    }

    const { weekStart, weekNumber, year } = this.getWeekInfo();

    // Проверить, не отправлен ли уже отчёт
    const [existing] = await db
      .select()
      .from(leaderReports)
      .where(and(eq(leaderReports.decadeId, decade.id), eq(leaderReports.weekStart, weekStart)))
      .limit(1);

    if (existing) {
      return { success: false, error: 'Отчёт за эту неделю уже отправлен' };
    }

    // Сохранить отчёт
    await db.insert(leaderReports).values({
      leaderUserId: user.id,
      decadeId: decade.id,
      weekStart,
      weekNumber,
      year,
      status,
      problemDescription: problemDescription?.trim() || null,
    });

    logger.info(
      {
        leaderTelegramId,
        decadeId: decade.id,
        status,
        weekNumber,
      },
      'Leader report submitted'
    );

    return { success: true };
  }

  /**
   * Проверить, отправлен ли отчёт за текущую неделю
   */
  async hasReportedThisWeek(leaderTelegramId: number): Promise<boolean> {
    const [decade] = await db
      .select()
      .from(decades)
      .where(and(eq(decades.leaderTelegramId, leaderTelegramId), eq(decades.isActive, true)))
      .limit(1);

    if (!decade) return false;

    const { weekStart } = this.getWeekInfo();

    const [report] = await db
      .select()
      .from(leaderReports)
      .where(and(eq(leaderReports.decadeId, decade.id), eq(leaderReports.weekStart, weekStart)))
      .limit(1);

    return !!report;
  }

  /**
   * Получить все активные десятки лидеров (для CRON напоминаний)
   */
  async getActiveLeaders(): Promise<{ telegramId: number; decadeId: string }[]> {
    const activeDecades = await db
      .select({
        telegramId: decades.leaderTelegramId,
        decadeId: decades.id,
      })
      .from(decades)
      .where(eq(decades.isActive, true));

    return activeDecades;
  }
}

export const decadesService = new DecadesService();
