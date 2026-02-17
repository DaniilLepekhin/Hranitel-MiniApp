/**
 * Продление подписки на месяц и отправка онбординга для двух пользователей
 */

import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { Bot } from 'grammy';
import { config } from './config';

const USERNAMES = ['yana_uzhegova', 'InnaUrazova'];

async function extendAndOnboard() {
  console.log('🔄 Шаг 1: Поиск пользователей...\n');

  const foundUsers = [];

  for (const username of USERNAMES) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (user) {
      foundUsers.push(user);
      console.log(`✅ Найден: @${username}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Telegram ID: ${user.telegramId}`);
      console.log(`   isPro: ${user.isPro}`);
      console.log(`   subscription_expires: ${user.subscriptionExpires}`);
      console.log('');
    } else {
      console.log(`❌ Не найден: @${username}\n`);
    }
  }

  if (foundUsers.length === 0) {
    console.error('❌ Ни один пользователь не найден');
    process.exit(1);
  }

  console.log(`\n🔄 Шаг 2: Продление подписки на 30 дней для ${foundUsers.length} пользователей...\n`);

  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
  let successCount = 0;

  for (const user of foundUsers) {
    // Вычисляем новую дату окончания подписки
    const currentExpires = user.subscriptionExpires ? new Date(user.subscriptionExpires) : new Date();
    const now = new Date();

    // Если подписка истекла, начинаем с текущей даты, иначе продлеваем от даты окончания
    const baseDate = currentExpires > now ? currentExpires : now;
    const newExpires = new Date(baseDate);
    newExpires.setDate(newExpires.getDate() + 30);

    // Обновляем в БД
    await db
      .update(users)
      .set({
        isPro: true,
        subscriptionExpires: newExpires,
        onboardingStep: 'awaiting_keyword',
        updatedAt: new Date(),
      })
      .where(eq(users.telegramId, user.telegramId));

    console.log(`✅ Подписка продлена для @${user.username}:`);
    console.log(`   Старая дата: ${user.subscriptionExpires}`);
    console.log(`   Новая дата: ${newExpires.toISOString()}`);
    console.log(`   +30 дней от: ${baseDate.toISOString()}`);

    // Отправляем онбординг
    try {
      await bot.api.sendVideo(
        user.telegramId,
        'https://t.me/mate_bot_open/9644',
        {
          caption: `Ты начинаешь погружение в <b>«Код успеха. Глава: Пробуждение» ✨</b>\n\n` +
            `Чтобы двери нашей экосистемы открылись, тебе нужно принять её правила.\n\n` +
            `🎥 Посмотри видео <b>до самого конца.</b> Кристина расскажет, как устроена наша Вселенная: где искать ключи, как работает супер-апп и как найти свою стаю 😄 (чаты городов и десятки).\n\n` +
            `<b>🗝 Внимание: внутри видео спрятан секретный Ключ (кодовое слово). Без него я не смогу выдать тебе доступы к материалам и закрытым чатам.</b>\n\n` +
            `Смотри внимательно. <i>Как только услышишь слово — пиши его мне в ответ 👇🏼</i>\n\n` +
            `<tg-spoiler>подсказка: карта</tg-spoiler>`,
          parse_mode: 'HTML'
        }
      );

      console.log(`✅ Онбординг отправлен @${user.username}`);
      successCount++;
    } catch (error: any) {
      console.log(`⚠️ Не удалось отправить онбординг @${user.username}: ${error.message}`);
      console.log(`   (Пользователь получит онбординг когда напишет боту)`);
    }

    console.log('');
  }

  console.log(`\n✅ Готово!`);
  console.log(`   Пользователей обработано: ${foundUsers.length}`);
  console.log(`   Подписок продлено: ${foundUsers.length}`);
  console.log(`   Онбординг отправлен: ${successCount}`);

  process.exit(0);
}

extendAndOnboard().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
