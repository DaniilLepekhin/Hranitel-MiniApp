import { Elysia, t } from 'elysia';
import { Bot, webhookCallback, InlineKeyboard } from 'grammy';
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

// Bot commands
bot.command('start', async (ctx) => {
  const webAppUrl = config.WEBAPP_URL;

  const keyboard = new InlineKeyboard()
    .webApp('Получить доступ', webAppUrl);

  await ctx.reply(
    `<b>Код Денег — здесь.</b>\n\n` +
    `❤️ Экосистема, где <b>15 000+ участников</b>\n` +
    `уже выстраивают доход в мягких нишах через поле, этапы и живую среду — а не одиночные курсы.\n\n` +
    `Смотри видео и узнай, что ждет тебя внутри клуба\n\n` +
    `Доступ сразу после входа 👇`,
    { reply_markup: keyboard, parse_mode: 'HTML' }
  );
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
