/**
 * Активация подписки и отправка меню пользователю 862437387
 */

import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config';

const TARGET_TELEGRAM_ID = 862437387;
const SUBSCRIPTION_END_DATE = new Date('2026-03-26T23:59:59.000Z');

async function activateAndSendMenu() {
  console.log('🔄 Шаг 1: Активация подписки...\n');

  // Проверяем, есть ли пользователь в базе
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, TARGET_TELEGRAM_ID))
    .limit(1);

  if (!user) {
    console.error(`❌ Пользователь ${TARGET_TELEGRAM_ID} не найден в базе`);
    process.exit(1);
  }

  console.log('📊 Пользователь ДО активации:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Telegram ID: ${user.telegramId}`);
  console.log(`   Username: @${user.username || 'нет'}`);
  console.log(`   Name: ${user.firstName} ${user.lastName || ''}`);
  console.log(`   isPro: ${user.isPro}`);
  console.log(`   subscription_expires: ${user.subscriptionExpires}`);
  console.log(`   city: ${user.city || 'не указан'}`);

  // Активируем подписку
  await db
    .update(users)
    .set({
      isPro: true,
      subscriptionExpires: SUBSCRIPTION_END_DATE,
      onboardingStep: 'onboarding_complete', // Сразу завершаем онбординг для отправки меню
      updatedAt: new Date(),
    })
    .where(eq(users.telegramId, TARGET_TELEGRAM_ID));

  console.log('\n✅ Подписка активирована!');
  console.log(`   isPro: true`);
  console.log(`   subscription_expires: ${SUBSCRIPTION_END_DATE.toISOString()}`);
  console.log(`   onboardingStep: onboarding_complete`);

  console.log('\n🔄 Шаг 2: Отправка меню...');

  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  try {
    // Создаем клавиатуру меню
    const keyboard = new InlineKeyboard()
      .webApp('🎯 Практики', `${process.env.WEBAPP_URL}?tab=courses`)
      .row()
      .webApp('🧘‍♀️ Медитации', `${process.env.WEBAPP_URL}?tab=meditations`)
      .row()
      .webApp('💬 Чаты городов', `${process.env.WEBAPP_URL}?tab=chats`)
      .row()
      .url('📱 Приложение', 'http://qr.numschool-web.ru/')
      .row()
      .url('📢 Канал клуба', 'https://t.me/+mwJ5e0d78GYzNDRi');

    await bot.api.sendPhoto(
      TARGET_TELEGRAM_ID,
      'https://t.me/mate_bot_open/9357',
      {
        caption:
          `<b>Добро пожаловать в «Код успеха»!</b> 🎉\n\n` +
          `Твой доступ активирован до <b>26 марта 2026 года</b>.\n\n` +
          `<b>Что доступно тебе прямо сейчас:</b>\n\n` +
          `🎯 <b>Практики</b> – работа с цифрами и энергиями\n` +
          `🧘‍♀️ <b>Медитации</b> – духовное развитие и гармония\n` +
          `💬 <b>Чаты городов</b> – общение с единомышленниками\n` +
          `📱 <b>Приложение</b> – твой персональный штаб\n` +
          `📢 <b>Канал клуба</b> – все анонсы и новости\n\n` +
          `Выбери раздел в меню ниже и начни своё путешествие! ✨`,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    );

    console.log('✅ Меню успешно отправлено пользователю!');
  } catch (error: any) {
    console.error(`❌ Ошибка отправки меню: ${error.message}`);
  }

  console.log('\n✅ Все готово!');
  process.exit(0);
}

activateAndSendMenu().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
