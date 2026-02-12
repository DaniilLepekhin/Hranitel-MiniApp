/**
 * Исправление десятки #14 Москва
 * 
 * Проблема: В десятке #14 (Москва) находятся 8 человек из Санкт-Петербурга
 * Решение: Удалить их из этой десятки и позволить им присоединиться к правильной
 */

import { db } from '../db';
import { decades, decadeMembers, users } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';

const MOSCOW_DECADE_ID = '63ed388d-1ac9-4e45-82ec-fd7efb1027d8';

// Telegram IDs пользователей из Питера, которые ошибочно в московской десятке
const SPB_USERS_IN_MOSCOW = [
  746502673,   // @Schwepslana
  951330914,   // @natashul_arevkova  
  5182753348,  // @Natali_5001
  1676091048,  // @no_username (Марина)
  902740618,   // @lilia_tiron
  1779424502,  // @nastenalife888
  1902669033,  // @sidorova_svetlana
  1358583479,  // @ElenaPorshina
];

async function fixDecade() {
  try {
    console.log('\n=== Исправление десятки #14 Москва ===\n');

    // 1. Находим user IDs этих пользователей
    const usersToRemove = await db
      .select({ id: users.id, telegramId: users.telegramId, username: users.username })
      .from(users)
      .where(inArray(users.telegramId, SPB_USERS_IN_MOSCOW));

    console.log(`Найдено пользователей для удаления: ${usersToRemove.length}\n`);
    usersToRemove.forEach(u => {
      console.log(`  - @${u.username || 'no_username'} (${u.telegramId})`);
    });

    const userIds = usersToRemove.map(u => u.id);

    // 2. Удаляем их из десятки #14 Москва
    console.log(`\nУдаляем ${userIds.length} пользователей из десятки #14 Москва...`);
    
    const deleted = await db
      .delete(decadeMembers)
      .where(and(
        eq(decadeMembers.decadeId, MOSCOW_DECADE_ID),
        inArray(decadeMembers.userId, userIds)
      ))
      .returning();

    console.log(`✅ Удалено записей: ${deleted.length}`);

    // 3. Обновляем счётчик участников в десятке
    const [moscowDecade] = await db
      .select()
      .from(decades)
      .where(eq(decades.id, MOSCOW_DECADE_ID));

    const newMemberCount = (moscowDecade.currentMembers || 11) - deleted.length;

    await db
      .update(decades)
      .set({
        currentMembers: newMemberCount,
        isFull: newMemberCount >= (moscowDecade.maxMembers || 11),
        updatedAt: new Date(),
      })
      .where(eq(decades.id, MOSCOW_DECADE_ID));

    console.log(`✅ Обновлён счётчик: ${newMemberCount} участников`);

    // 4. Лог для админа
    logger.info({
      decadeId: MOSCOW_DECADE_ID,
      removedCount: deleted.length,
      newMemberCount,
      removedUsers: usersToRemove.map(u => ({ telegramId: u.telegramId, username: u.username })),
    }, 'Fixed decade #14 Moscow - removed SPB users');

    console.log('\n✅ ГОТОВО! Пользователи из Питера удалены из десятки #14 Москва.');
    console.log('Теперь они могут присоединиться к правильной десятке через приложение.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    logger.error({ error }, 'Failed to fix decade #14 Moscow');
    process.exit(1);
  }
}

fixDecade();
