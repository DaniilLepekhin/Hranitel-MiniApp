import { Bot } from 'grammy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const bot = new Bot(BOT_TOKEN);

const userIds = [467650086, 5929545493];

async function notifyUsers() {
  for (const userId of userIds) {
    try {
      await bot.api.sendMessage(
        userId,
        `🔄 <b>Обновление приложения</b>\n\n` +
        `Привет! Мы обновили приложение клуба.\n\n` +
        `Для корректной работы, пожалуйста:\n` +
        `1️⃣ Полностью закрой приложение\n` +
        `2️⃣ Открой его заново из бота (команда /menu или кнопка "Штаб клуба")\n\n` +
        `После этого всё будет работать как надо ✨`,
        { parse_mode: 'HTML' }
      );
      console.log(`✅ Sent notification to ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to send to ${userId}:`, error);
    }
  }

  console.log('✅ All notifications sent');
  process.exit(0);
}

notifyUsers();
