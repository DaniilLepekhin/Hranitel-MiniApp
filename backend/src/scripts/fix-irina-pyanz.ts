/**
 * Исправление для Ирины Пьянз
 * 
 * Проблема: Ирина из Москвы, но в десятке Санкт-Петербурга (#15)
 * Решение: Удалить её из питерской десятки
 */

import { db } from '../db';
import { decades, decadeMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';

const IRINA_TELEGRAM_ID = 405819064;
const SPB_DECADE_ID = '8554f9a8-5d85-4215-9074-362be71f2443'; // Десятка #15 СПб

async function fixIrina() {
  try {
    console.log('\n=== Исправление для Ирины Пьянз ===\n');

    // 1. Находим пользователя
    const [user] = await db
      .select({ id: users.id, username: users.username, city: users.city })
      .from(users)
      .where(eq(users.telegramId, IRINA_TELEGRAM_ID));

    if (!user) {
      console.log('❌ Пользователь не найден');
      process.exit(1);
    }

    console.log(`Пользователь: @${user.username} (город: ${user.city})`);

    // 2. Удаляем из питерской десятки
    console.log(`\nУдаляем из десятки #15 Санкт-Петербург...`);
    
    const deleted = await db
      .delete(decadeMembers)
      .where(and(
        eq(decadeMembers.decadeId, SPB_DECADE_ID),
        eq(decadeMembers.userId, user.id)
      ))
      .returning();

    if (deleted.length === 0) {
      console.log('⚠️  Пользователь не был в этой десятке');
      process.exit(0);
    }

    console.log(`✅ Удалено записей: ${deleted.length}`);

    // 3. Обновляем счётчик в питерской десятке
    const [spbDecade] = await db
      .select()
      .from(decades)
      .where(eq(decades.id, SPB_DECADE_ID));

    const newCount = (spbDecade.currentMembers || 1) - 1;

    await db
      .update(decades)
      .set({
        currentMembers: newCount,
        isFull: newCount >= (spbDecade.maxMembers || 11),
        updatedAt: new Date(),
      })
      .where(eq(decades.id, SPB_DECADE_ID));

    console.log(`✅ Обновлён счётчик десятки #15 СПб: ${newCount} участников`);

    // 4. Лог
    logger.info({
      userId: user.id,
      telegramId: IRINA_TELEGRAM_ID,
      username: user.username,
      removedFrom: 'Десятка #15 Санкт-Петербург',
      userCity: user.city,
    }, 'Fixed Irina Pyanz - removed from SPB decade');

    console.log('\n✅ ГОТОВО! Ирина удалена из питерской десятки.');
    console.log('Теперь она может присоединиться к десятке Москвы через приложение.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    logger.error({ error }, 'Failed to fix Irina Pyanz');
    process.exit(1);
  }
}

fixIrina();
