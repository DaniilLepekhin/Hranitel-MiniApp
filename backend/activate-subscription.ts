#!/usr/bin/env bun
/**
 * Скрипт для активации подписки пользователю
 * 
 * Использование:
 *   bun run activate-subscription.ts @username 30
 * 
 * Параметры:
 *   - username: Telegram username (с @ или без)
 *   - days: Количество дней подписки (по умолчанию 30)
 */

import { db } from './src/db';
import { users } from './src/db/schema';
import { eq, or, sql } from 'drizzle-orm';

const username = process.argv[2];
const days = parseInt(process.argv[3] || '30', 10);

if (!username) {
  console.error('❌ Ошибка: не указан username');
  console.error('Использование: bun run activate-subscription.ts @username [days]');
  process.exit(1);
}

// Убираем @ если есть
const cleanUsername = username.replace('@', '');

console.log(`🔍 Поиск пользователя: @${cleanUsername}`);

async function activateSubscription() {
  try {
    // Ищем пользователя по username
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!user) {
      console.error(`❌ Пользователь @${cleanUsername} не найден в базе данных`);
      console.error('');
      console.error('💡 Возможные причины:');
      console.error('   1. Пользователь ещё не запускал бота');
      console.error('   2. Username указан неправильно');
      console.error('');
      console.error('🔧 Решение:');
      console.error('   1. Попросите пользователя запустить бота: /start');
      console.error('   2. Или используйте Telegram ID вместо username');
      process.exit(1);
    }

    console.log('✅ Пользователь найден:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Telegram ID: ${user.telegramId}`);
    console.log(`   Username: @${user.username}`);
    console.log(`   Имя: ${user.firstName} ${user.lastName || ''}`);
    console.log(`   Текущий статус: ${user.isPro ? 'PRO ✅' : 'FREE'}`);
    if (user.subscriptionExpires) {
      console.log(`   Подписка истекает: ${new Date(user.subscriptionExpires).toLocaleDateString('ru-RU')}`);
    }
    console.log('');

    // Вычисляем новую дату истечения
    const subscriptionExpires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    // Обновляем подписку
    console.log(`🚀 Активация подписки на ${days} дней...`);
    
    const [updated] = await db
      .update(users)
      .set({
        isPro: true,
        subscriptionExpires,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    console.log('');
    console.log('✅ Подписка успешно активирована!');
    console.log(`   Статус: PRO ✅`);
    console.log(`   Действует до: ${new Date(subscriptionExpires).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`);
    console.log('');
    console.log('📱 Пользователь может проверить подписку:');
    console.log('   1. Открыть бота: https://t.me/hranitelkodbot');
    console.log('   2. Нажать /start');
    console.log('   3. Нажать "🏠 Меню"');
    console.log('   4. Проверить статус подписки');
    console.log('');
    console.log('🎉 Готово!');

  } catch (error) {
    console.error('❌ Ошибка при активации подписки:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

activateSubscription();
