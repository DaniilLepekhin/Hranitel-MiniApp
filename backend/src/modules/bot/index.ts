import { Elysia, t } from 'elysia';
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { webhookRateLimit } from '@/middlewares/rateLimit';
import { db, users, courses, courseProgress, meditations } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { gamificationService } from '@/modules/gamification/service';

// Initialize bot
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Initialize bot info (required for webhooks)
await bot.init();

// User state management (in production use Redis or DB)
interface UserState {
  awaitingPayment?: boolean;
  paymentCheckTime?: number;
}
const userStates = new Map<number, UserState>();

// Helper to check payment status (placeholder - implement real logic)
async function checkPaymentStatus(userId: number): Promise<boolean> {
  // TODO: Implement real payment check via YooKassa/Stripe API
  // For now return false as placeholder
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, String(userId)))
    .limit(1);

  return user?.hasAccess || false;
}

// Schedule payment reminder after 5 minutes
function schedulePaymentReminder(userId: number, chatId: number) {
  setTimeout(async () => {
    const paid = await checkPaymentStatus(userId);
    if (!paid) {
      const keyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', `https://ishodnyi-kod.com/webappclubik`)
        .row()
        .text('Я не готов 🤔', 'not_ready');

      // Send video with caption
      await bot.api.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9250',
        {
          caption:
            `<b>3 главные ловушки эксперта в мягких нишах.</b>\n\n` +
            `Оставаться в одиночке.\n` +
            `Копить знания без внедрения.\n` +
            `Объяснять стагнацию «рынком», а не отсутствием среды.\n\n` +
            `Одни продолжают искать причины.\n` +
            `Другие — заходят в поле и двигаются по этапам.\n\n` +
            `А ты из каких?\n\n` +
            `В клубе «Код Денег» не мотивируют словами.\n` +
            `Здесь:\n` +
            `— дают обучение по мягким нишам,\n` +
            `— проводят по этапам,\n` +
            `— ставят в десятки,\n` +
            `— фиксируют рост и статус.\n\n` +
            `Оформи подписку — и получи доступ ко всей экосистеме клуба\n` +
            `сразу после оплаты 👇`,
          parse_mode: 'HTML',
          reply_markup: keyboard
        }
      );
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// Bot commands
bot.command('start', async (ctx) => {
  const keyboard = new Keyboard()
    .text('Получить доступ')
    .text('MiniApp')
    .resized();

  await ctx.reply(
    `<b>Код Денег — здесь.</b>\n\n` +
    `❤️ Экосистема, где <b>15 000+ участников</b>\n` +
    `уже выстраивают доход в мягких нишах через поле, этапы и живую среду — а не одиночные курсы.\n\n` +
    `Смотри видео и узнай, что ждет тебя внутри клуба\n\n` +
    `Доступ сразу после входа 👇`,
    { reply_markup: keyboard, parse_mode: 'HTML' }
  );
});

// Handle "Получить доступ" button
bot.hears('Получить доступ', async (ctx) => {
  const webAppUrl = `https://ishodnyi-kod.com/webappclubik`;

  const keyboard = new InlineKeyboard()
    .webApp('Оплатить', webAppUrl);

  await ctx.reply(
    `<b>🎫 Твой билет в КОД ДЕНЕГ</b>\n\n` +
    `<b>Информация о подписке на клуб «Код Денег»:</b>\n` +
    `👉🏼 1 месяц = 2.900 ₽\n` +
    `👉🏼 В подписку входит полный доступ к клубу «Код Денег»: обучение и мини-курсы по мягким нишам, ` +
    `десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
    `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
    `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot`,
    { reply_markup: keyboard, parse_mode: 'HTML' }
  );

  // Mark user as awaiting payment and schedule reminder
  const userId = ctx.from!.id;
  userStates.set(userId, {
    awaitingPayment: true,
    paymentCheckTime: Date.now()
  });

  schedulePaymentReminder(userId, ctx.chat.id);

  // Check payment after button sent
  setTimeout(async () => {
    const paid = await checkPaymentStatus(userId);
    if (paid) {
      await ctx.reply(
        '🎉 <b>Поздравляю с покупкой!</b>\n\n' +
        'Добро пожаловать в клуб «Код Денег»! Теперь у тебя есть полный доступ ко всем материалам.',
        { parse_mode: 'HTML' }
      );
      userStates.delete(userId);
    }
  }, 10000); // Check after 10 seconds
});

// Handle "MiniApp" button
bot.hears('MiniApp', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp('🚀 Открыть приложение', config.WEBAPP_URL);

  await ctx.reply('Нажми кнопку, чтобы открыть приложение:', {
    reply_markup: keyboard,
  });
});

// Handle "Я не готов" callback
bot.callbackQuery('not_ready', async (ctx) => {
  await ctx.answerCallbackQuery();

  const keyboard = new Keyboard()
    .text('🔮 где мои деньги в 2026 году')
    .text('💰 почему доход не растет')
    .row()
    .text('🧠 состояние vs деньги')
    .text('🌍 окружение')
    .resized();

  await ctx.reply(
    `<b>Что горит прямо сейчас? 🔥</b>\n\n` +
    `Только честно.\n` +
    `Чтобы не грузить лишним — выбери, что сейчас важнее всего 👇`,
    { reply_markup: keyboard, parse_mode: 'HTML' }
  );
});

// Handle topic selection buttons
const topicResponses: Record<string, string> = {
  '🔮 где мои деньги в 2026 году': 'Отличный вопрос! В клубе мы разбираем стратегии монетизации и помогаем найти свою нишу...',
  '💰 почему доход не растет': '3 главные ловушки эксперта в мягких нишах',
  '🧠 состояние vs деньги': 'Связь между внутренним состоянием и деньгами — ключевая тема клуба. Узнаешь как работать с этим...',
  '🌍 окружение': 'Окружение решает многое! В клубе ты найдешь поддерживающую среду из 15000+ единомышленников...'
};

Object.keys(topicResponses).forEach((topic) => {
  bot.hears(topic, async (ctx) => {
    const keyboard = new Keyboard()
      .text('Получить доступ')
      .text('MiniApp')
      .resized();

    // Special handling for "почему доход не растет" - send video first
    if (topic === '💰 почему доход не растет') {
      // Send video from Telegram link
      await ctx.replyWithVideo('https://t.me/mate_bot_open/9250', {
        caption: topicResponses[topic]
      });

      await ctx.reply(
        'Готов присоединиться к клубу?',
        { reply_markup: keyboard }
      );
    } else {
      await ctx.reply(
        topicResponses[topic] + '\n\nГотов присоединиться к клубу?',
        { reply_markup: keyboard }
      );
    }
  });
});

bot.command('app', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp('🚀 Открыть приложение', config.WEBAPP_URL);

  await ctx.reply('Нажми кнопку, чтобы открыть приложение:', {
    reply_markup: keyboard,
  });
});

bot.command('today', async (ctx) => {
  const telegramId = String(ctx.from?.id);

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);

  if (!user) {
    await ctx.reply('Сначала открой приложение, чтобы зарегистрироваться! /app');
    return;
  }

  // Get user's courses with progress
  const progress = await db
    .select({
      currentDay: courseProgress.currentDay,
      courseTitle: courses.title,
      courseId: courses.id,
    })
    .from(courseProgress)
    .innerJoin(courses, eq(courseProgress.courseId, courses.id))
    .where(eq(courseProgress.userId, user.id))
    .orderBy(desc(courseProgress.lastAccessedAt))
    .limit(3);

  if (progress.length === 0) {
    await ctx.reply(
      '📚 У тебя пока нет активных курсов.\n\n' +
      'Открой приложение и начни первый курс! /app'
    );
    return;
  }

  let message = '📅 Твои курсы на сегодня:\n\n';

  progress.forEach((p, i) => {
    message += `${i + 1}. ${p.courseTitle}\n`;
    message += `   📍 День ${p.currentDay}\n\n`;
  });

  const keyboard = new InlineKeyboard()
    .webApp('🚀 Продолжить обучение', config.WEBAPP_URL);

  await ctx.reply(message, { reply_markup: keyboard });
});

bot.command('progress', async (ctx) => {
  const telegramId = String(ctx.from?.id);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);

  if (!user) {
    await ctx.reply('Сначала открой приложение! /app');
    return;
  }

  const stats = await gamificationService.getUserStats(user.id);

  if (!stats) {
    await ctx.reply('Статистика недоступна');
    return;
  }

  const progressBar = '█'.repeat(Math.floor(stats.progressPercent / 10)) +
                      '░'.repeat(10 - Math.floor(stats.progressPercent / 10));

  await ctx.reply(
    `📊 Твой прогресс:\n\n` +
    `🏆 Уровень: ${stats.level}\n` +
    `⭐ Опыт: ${stats.experience} XP\n` +
    `🔥 Серия дней: ${stats.streak}\n\n` +
    `Прогресс до следующего уровня:\n` +
    `[${progressBar}] ${stats.progressPercent}%\n` +
    `${stats.progressToNextLevel}/${stats.xpNeededForNextLevel} XP`
  );
});

bot.command('meditate', async (ctx) => {
  // Get random meditation
  const meditationsList = await db
    .select()
    .from(meditations)
    .where(eq(meditations.isPremium, false))
    .limit(5);

  if (meditationsList.length === 0) {
    await ctx.reply('Медитации пока недоступны. Попробуй позже!');
    return;
  }

  const randomMeditation = meditationsList[Math.floor(Math.random() * meditationsList.length)];

  const keyboard = new InlineKeyboard()
    .webApp('🧘 Начать медитацию', `${config.WEBAPP_URL}/meditations/${randomMeditation.id}`);

  await ctx.reply(
    `🧘 Рекомендуем медитацию:\n\n` +
    `*${randomMeditation.title}*\n` +
    `⏱ ${Math.floor(randomMeditation.duration / 60)} минут\n\n` +
    `${randomMeditation.description || ''}`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );
});

// Callback handlers
bot.callbackQuery('my_courses', async (ctx) => {
  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .webApp('📚 Открыть курсы', `${config.WEBAPP_URL}/courses`);

  await ctx.reply('Открой приложение, чтобы увидеть свои курсы:', {
    reply_markup: keyboard,
  });
});

bot.callbackQuery('meditations', async (ctx) => {
  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard()
    .webApp('🧘 Открыть медитации', `${config.WEBAPP_URL}/meditations`);

  await ctx.reply('Открой приложение, чтобы увидеть медитации:', {
    reply_markup: keyboard,
  });
});

// Error handler
bot.catch((err) => {
  const error = err.error;
  logger.error({
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error,
    ctx: {
      updateType: err.ctx.update ? Object.keys(err.ctx.update).filter(k => k !== 'update_id') : [],
      updateId: err.ctx.update?.update_id
    }
  }, 'Bot error');
});

// Elysia module
export const botModule = new Elysia({ prefix: '/bot', tags: ['Bot'] })
  .use(webhookRateLimit)
  // Webhook endpoint
  .post(
    '/webhook',
    async ({ body, headers, set }) => {
      // Verify webhook secret
      if (config.TELEGRAM_WEBHOOK_SECRET) {
        const secretToken = headers['x-telegram-bot-api-secret-token'];
        if (secretToken !== config.TELEGRAM_WEBHOOK_SECRET) {
          set.status = 401;
          return { ok: false, error: 'Unauthorized' };
        }
      }

      try {
        // Handle update
        logger.info({ update: body }, 'Processing webhook update');
        await bot.handleUpdate(body as Parameters<typeof bot.handleUpdate>[0]);
        return { ok: true };
      } catch (error) {
        logger.error({
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        }, 'Webhook error');
        return { ok: false };
      }
    },
    {
      detail: {
        summary: 'Telegram webhook',
        description: 'Receives updates from Telegram',
      },
    }
  )
  // Set webhook
  .post(
    '/set-webhook',
    async ({ body }) => {
      const { url } = body;

      try {
        await bot.api.setWebhook(url, {
          secret_token: config.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ['message', 'callback_query', 'inline_query'],
        });

        logger.info({ url }, 'Webhook set');

        return {
          success: true,
          message: 'Webhook set successfully',
          url,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to set webhook');
        return {
          success: false,
          error: 'Failed to set webhook',
        };
      }
    },
    {
      body: t.Object({
        url: t.String(),
      }),
      detail: {
        summary: 'Set webhook URL',
      },
    }
  )
  // Get bot info
  .get(
    '/info',
    async () => {
      try {
        const me = await bot.api.getMe();
        const webhookInfo = await bot.api.getWebhookInfo();

        return {
          success: true,
          bot: me,
          webhook: {
            url: webhookInfo.url,
            hasCustomCertificate: webhookInfo.has_custom_certificate,
            pendingUpdateCount: webhookInfo.pending_update_count,
            lastErrorDate: webhookInfo.last_error_date,
            lastErrorMessage: webhookInfo.last_error_message,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to get bot info',
        };
      }
    },
    {
      detail: {
        summary: 'Get bot info',
      },
    }
  );
