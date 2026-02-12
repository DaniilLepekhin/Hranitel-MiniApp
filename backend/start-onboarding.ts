/**
 * Запуск онбординга для пользователя после ручной активации подписки
 */

import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';
import * as funnels from './src/modules/bot/post-payment-funnels';
import { bot } from './src/modules/bot/index';

async function startOnboarding(telegramIdStr: string) {
  try {
    const telegramId = telegramIdStr;
    
    console.log(`🔍 Поиск пользователя с Telegram ID: ${telegramId}`);
    
    const user = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (user.length === 0) {
      console.log('❌ Пользователь не найден');
      process.exit(1);
    }

    const userData = user[0];
    console.log('✅ Пользователь найден:');
    console.log(`   ID: ${userData.id}`);
    console.log(`   Username: @${userData.username || 'не указан'}`);
    console.log(`   Имя: ${userData.firstName} ${userData.lastName || ''}`);
    console.log(`   isPro: ${userData.isPro}`);
    console.log(`   onboardingStep: ${userData.onboardingStep || 'null'}`);

    if (!userData.isPro) {
      console.log('❌ У пользователя нет PRO подписки!');
      console.log('💡 Сначала активируйте подписку: bun run activate-by-telegram-id.ts');
      process.exit(1);
    }

    // Устанавливаем onboardingStep
    console.log('\n📝 Обновляем onboardingStep...');
    await db
      .update(users)
      .set({ onboardingStep: 'awaiting_keyword' })
      .where(eq(users.id, userData.id));
    
    console.log('✅ onboardingStep установлен: awaiting_keyword');

    // Отправляем первое сообщение онбординга
    console.log('\n📤 Отправляем приветственное сообщение...');
    
    const chatId = parseInt(telegramId);
    await funnels.sendKeywordStep(bot, chatId, userData.id);
    
    console.log('✅ Онбординг запущен!');
    console.log('\n📋 Следующие шаги пользователя:');
    console.log('   1. Пользователь вводит кодовое слово "КАРТА"');
    console.log('   2. Бот отправляет 3 видео');
    console.log('   3. Пользователь нажимает "готово" 3 раза');
    console.log('   4. Бот добавляет в городской чат');
    console.log('   5. Показывает меню Mini App');

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

const telegramId = process.argv[2];
if (!telegramId) {
  console.log('Usage: bun run start-onboarding.ts <telegram_id>');
  process.exit(1);
}

startOnboarding(telegramId);
