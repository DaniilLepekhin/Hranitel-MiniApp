#!/usr/bin/env bun
/**
 * Скрипт для проверки подписки пользователя
 */

import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

const username = process.argv[2];

if (!username) {
  console.error('❌ Ошибка: не указан username');
  console.error('Использование: bun run check-subscription.ts @username');
  process.exit(1);
}

const cleanUsername = username.replace('@', '');

async function checkSubscription() {
  try {
    const [user] = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        username: users.username,
        firstName: users.firstName,
        isPro: users.isPro,
        subscriptionExpires: users.subscriptionExpires,
      })
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!user) {
      console.error(`❌ Пользователь @${cleanUsername} не найден`);
      process.exit(1);
    }

    const isActive = user.isPro && user.subscriptionExpires && new Date(user.subscriptionExpires) > new Date();

    console.log('👤 Информация о пользователе:');
    console.log(`   Username: @${user.username}`);
    console.log(`   Имя: ${user.firstName}`);
    console.log(`   Telegram ID: ${user.telegramId}`);
    console.log('');
    console.log('💎 Статус подписки:');
    console.log(`   isPro: ${user.isPro ? '✅ true' : '❌ false'}`);
    if (user.subscriptionExpires) {
      const expiresDate = new Date(user.subscriptionExpires);
      console.log(`   Действует до: ${expiresDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`);
      
      const daysLeft = Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      console.log(`   Осталось дней: ${daysLeft}`);
    } else {
      console.log(`   Действует до: не установлено`);
    }
    console.log(`   Активна: ${isActive ? '✅ ДА' : '❌ НЕТ'}`);

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkSubscription();
