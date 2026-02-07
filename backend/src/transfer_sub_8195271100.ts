/**
 * Перенос подписки с 9be35ae8-45d8-470e-ad95-f972916811b8 на 8195271100
 */

import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

const SOURCE_USER_ID = '9be35ae8-45d8-470e-ad95-f972916811b8';
const TARGET_TELEGRAM_ID = 8195271100;

async function transfer() {
  console.log('🔄 Получение данных пользователей...\n');

  const [sourceUser] = await db.select().from(users).where(eq(users.id, SOURCE_USER_ID)).limit(1);
  const [targetUser] = await db.select().from(users).where(eq(users.telegramId, TARGET_TELEGRAM_ID)).limit(1);

  if (!sourceUser) {
    console.error(`❌ Исходный пользователь ${SOURCE_USER_ID} не найден`);
    process.exit(1);
  }

  console.log('📊 Исходный пользователь:');
  console.log(`   ID: ${sourceUser.id}`);
  console.log(`   Telegram ID: ${sourceUser.telegramId}`);
  console.log(`   Username: @${sourceUser.username || 'нет'}`);
  console.log(`   isPro: ${sourceUser.isPro}`);
  console.log(`   subscription_expires: ${sourceUser.subscriptionExpires}`);
  console.log(`   city: ${sourceUser.city || 'не указан'}`);

  if (targetUser) {
    console.log('\n📊 Целевой пользователь (ДО переноса):');
    console.log(`   ID: ${targetUser.id}`);
    console.log(`   Telegram ID: ${targetUser.telegramId}`);
    console.log(`   Username: @${targetUser.username || 'нет'}`);
    console.log(`   isPro: ${targetUser.isPro}`);
    console.log(`   subscription_expires: ${targetUser.subscriptionExpires}`);
  } else {
    console.log(`\n⚠️ Целевой пользователь ${TARGET_TELEGRAM_ID} не найден в базе`);
  }

  if (!sourceUser.isPro || !sourceUser.subscriptionExpires) {
    console.error('\n❌ У исходного пользователя нет активной подписки для переноса');
    process.exit(1);
  }

  console.log('\n🔄 Перенос подписки...');

  if (targetUser) {
    // Обновляем существующего пользователя
    await db.update(users).set({
      isPro: true,
      subscriptionExpires: sourceUser.subscriptionExpires,
      onboardingStep: 'awaiting_keyword',
      city: sourceUser.city,
      updatedAt: new Date(),
    }).where(eq(users.telegramId, TARGET_TELEGRAM_ID));
  } else {
    // Создаем нового пользователя
    await db.insert(users).values({
      telegramId: TARGET_TELEGRAM_ID,
      isPro: true,
      subscriptionExpires: sourceUser.subscriptionExpires,
      onboardingStep: 'awaiting_keyword',
      city: sourceUser.city,
    });
  }

  // Отключаем подписку у исходного пользователя
  await db.update(users).set({
    isPro: false,
    subscriptionExpires: null,
    onboardingStep: null,
    updatedAt: new Date(),
  }).where(eq(users.id, SOURCE_USER_ID));

  console.log('✅ Подписка успешно перенесена!');

  const [updatedTarget] = await db.select().from(users).where(eq(users.telegramId, TARGET_TELEGRAM_ID)).limit(1);

  console.log('\n📊 Целевой пользователь (ПОСЛЕ переноса):');
  console.log(`   isPro: ${updatedTarget!.isPro}`);
  console.log(`   subscription_expires: ${updatedTarget!.subscriptionExpires}`);
  console.log(`   onboardingStep: ${updatedTarget!.onboardingStep}`);
  console.log(`   city: ${updatedTarget!.city}`);

  console.log('\n✅ Готово! Теперь отправляем онбординг...');
  process.exit(0);
}

transfer().catch(error => {
  console.error('❌ Ошибка:', error);
  process.exit(1);
});
