import { db, users } from './backend/src/db';
import { eq } from 'drizzle-orm';
import * as funnels from './backend/src/modules/bot/post-payment-funnels';
import { Bot } from 'grammy';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TARGET_TG_ID = '389209990';

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN not found in environment');
  process.exit(1);
}

async function startFunnel() {
  try {
    console.log(`🔍 Searching for user with Telegram ID: ${TARGET_TG_ID}`);

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, TARGET_TG_ID))
      .limit(1);

    if (!user) {
      console.error(`❌ User with Telegram ID ${TARGET_TG_ID} not found`);
      process.exit(1);
    }

    console.log(`✅ Found user:`, {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      onboardingStep: user.onboardingStep
    });

    // Initialize Telegram service
    const bot = new Bot(TELEGRAM_BOT_TOKEN);
    funnels.initTelegramService(bot.api);

    // Get chat ID (same as telegram ID for private chats)
    const chatId = parseInt(TARGET_TG_ID);

    console.log(`🚀 Starting post-payment onboarding funnel for user ${user.id} (chat: ${chatId})`);

    await funnels.startOnboardingAfterPayment(user.id, chatId);

    console.log(`✅ Post-payment funnel started successfully!`);
    console.log(`📬 User should receive the first message with keyword request`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error starting funnel:', error);
    process.exit(1);
  }
}

startFunnel();
