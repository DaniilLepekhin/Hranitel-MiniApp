/**
 * Установить onboardingStep для пользователя
 * После этого пользователь должен написать /start боту
 */

import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function setOnboardingStep(telegramIdStr: string) {
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
      console.log('\n❌ У пользователя нет PRO подписки!');
      console.log('💡 Сначала активируйте подписку:');
      console.log('   bun run activate-by-telegram-id.ts ' + telegramId + ' 30');
      process.exit(1);
    }

    // Устанавливаем onboardingStep
    console.log('\n📝 Устанавливаем onboardingStep = awaiting_keyword...');
    await db
      .update(users)
      .set({ onboardingStep: 'awaiting_keyword' })
      .where(eq(users.id, userData.id));
    
    console.log('✅ onboardingStep установлен!');
    
    console.log('\n📋 СЛЕДУЮЩИЙ ШАГ:');
    console.log('   Попросите пользователя написать /start боту');
    console.log('   Бот автоматически продолжит онбординг с текущего шага');
    console.log('');
    console.log('📱 Инструкция для пользователя:');
    console.log('   1. Откройте Telegram');
    console.log('   2. Найдите бота в поиске или перейдите по ссылке');
    console.log('   3. Напишите боту команду: /start');
    console.log('   4. Бот пришлёт видео с кодовым словом');
    console.log('   5. Напишите боту кодовое слово "КАРТА"');
    console.log('   6. Следуйте дальнейшим инструкциям бота');

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

const telegramId = process.argv[2];
if (!telegramId) {
  console.log('Usage: bun run set-onboarding-step.ts <telegram_id>');
  console.log('Example: bun run set-onboarding-step.ts 1099677930');
  process.exit(1);
}

setOnboardingStep(telegramId);
