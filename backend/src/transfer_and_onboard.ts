/**
 * Скрипт для переноса подписки и запуска онбординга
 */

import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { Bot } from 'grammy';
import { config } from './config';

const SOURCE_USER_ID = 'c0f5f326-98cf-4154-b75e-5dcfc3810b9b';
const TARGET_TELEGRAM_ID = 8594854648;

async function transferAndOnboard() {
  console.log('🔄 Шаг 1: Получение данных пользователей...\n');

  // Получаем исходного пользователя
  const [sourceUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, SOURCE_USER_ID))
    .limit(1);

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

  // Получаем целевого пользователя
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, TARGET_TELEGRAM_ID))
    .limit(1);

  if (!targetUser) {
    console.error(`❌ Целевой пользователь ${TARGET_TELEGRAM_ID} не найден`);
    process.exit(1);
  }

  console.log('\n📊 Целевой пользователь (ДО переноса):');
  console.log(`   ID: ${targetUser.id}`);
  console.log(`   Telegram ID: ${targetUser.telegramId}`);
  console.log(`   Username: @${targetUser.username || 'нет'}`);
  console.log(`   isPro: ${targetUser.isPro}`);
  console.log(`   subscription_expires: ${targetUser.subscriptionExpires}`);
  console.log(`   city: ${targetUser.city || 'не указан'}`);

  if (!sourceUser.isPro || !sourceUser.subscriptionExpires) {
    console.error('\n❌ У исходного пользователя нет активной подписки для переноса');
    process.exit(1);
  }

  console.log('\n🔄 Шаг 2: Перенос подписки...');

  // Переносим подписку на целевого пользователя
  await db
    .update(users)
    .set({
      isPro: true,
      subscriptionExpires: sourceUser.subscriptionExpires,
      onboardingStep: 'awaiting_keyword',
      city: sourceUser.city, // Переносим также город
      updatedAt: new Date(),
    })
    .where(eq(users.telegramId, TARGET_TELEGRAM_ID));

  // Отключаем подписку у исходного пользователя
  await db
    .update(users)
    .set({
      isPro: false,
      subscriptionExpires: null,
      onboardingStep: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, SOURCE_USER_ID));

  console.log('✅ Подписка успешно перенесена!');

  // Проверяем результат
  const [updatedTargetUser] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, TARGET_TELEGRAM_ID))
    .limit(1);

  console.log('\n📊 Целевой пользователь (ПОСЛЕ переноса):');
  console.log(`   isPro: ${updatedTargetUser!.isPro}`);
  console.log(`   subscription_expires: ${updatedTargetUser!.subscriptionExpires}`);
  console.log(`   onboardingStep: ${updatedTargetUser!.onboardingStep}`);
  console.log(`   city: ${updatedTargetUser!.city}`);

  console.log('\n🔄 Шаг 3: Отправка онбординга...');

  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  try {
    await bot.api.sendVideo(
      TARGET_TELEGRAM_ID,
      'https://t.me/mate_bot_open/9644',
      {
        caption: `«Ты начинаешь погружение в <b>«Код успеха. Глава: Пробуждение»</b> ✨\n\n` +
          `Чтобы двери нашей экосистемы открылись, тебе нужно принять её правила.\n\n` +
          `🎥 Посмотри видео Кристины <b>до самого конца.</b> Кристина расскажет, как устроена наша Вселенная: где искать ключи, как работает супер-апп и как найти свою стаю 😄 (чаты городов и десятки).\n\n` +
          `<b>🗝 Внимание: внутри видео спрятан секретный Ключ (кодовое слово). Без него я не смогу выдать тебе доступы к материалам и закрытым чатам.</b>\n\n` +
          `Смотри внимательно. <i>Как только услышишь слово — пиши его мне в ответ 👇🏼</i>»`,
        parse_mode: 'HTML'
      }
    );

    console.log('✅ Онбординг успешно отправлен пользователю!');
  } catch (error: any) {
    console.error(`❌ Ошибка отправки онбординга: ${error.message}`);
  }

  console.log('\n✅ Все готово!');
  process.exit(0);
}

transferAndOnboard().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
