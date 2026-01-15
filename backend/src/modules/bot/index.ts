import { Elysia, t } from 'elysia';
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { webhookRateLimit } from '@/middlewares/rateLimit';
import { db, users, courses, courseProgress, meditations } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { gamificationService } from '@/modules/gamification/service';
import { schedulerService, type ScheduledTask } from '@/services/scheduler.service';
import { TelegramService } from '@/services/telegram.service';
import { stateService } from '@/services/state.service';

// Initialize bot
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Initialize bot info (required for webhooks)
await bot.init();

// Initialize Telegram service
const telegramService = new TelegramService(bot.api);

// Helper to check payment status
async function checkPaymentStatus(userId: number): Promise<boolean> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, String(userId)))
      .limit(1);

    return user?.hasAccess || false;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to check payment status');
    return false;
  }
}

// Task processor callback for scheduled tasks
async function processScheduledTask(task: ScheduledTask): Promise<void> {
  const { type, userId, chatId } = task;

  try {
    // Check if user already paid
    const paid = await checkPaymentStatus(userId);
    if (paid) {
      logger.info({ userId, taskType: type }, 'User already paid, skipping reminder');
      return;
    }

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://ishodnyi-kod.com/webappclubik`)
      .row()
      .text('Я не готов 🤔', 'not_ready');

    if (type === 'payment_reminder') {
      // Send 5-minute reminder with video
      await telegramService.sendVideo(
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

      // Schedule final reminder after 55 more minutes (60 minutes total)
      await schedulerService.schedule(
        {
          type: 'final_reminder',
          userId,
          chatId,
        },
        55 * 60 * 1000 // 55 minutes
      );
    } else if (type === 'final_reminder') {
      // Send 60-minute final reminder
      await telegramService.sendMessage(
        chatId,
        `<b>Это не просто клуб.\n` +
        `Это точка, где меняется траектория дохода.</b>\n\n` +
        `Мы видим, что ты заглянула внутрь, но ещё сомневаешься.\n` +
        `И это нормально.\n` +
        `Обычно в такие моменты интуиция уже всё поняла — нужно пространство, где рост перестаёт быть одиночным.\n\n` +
        `Внутри клуба <b>«Код Денег»</b> тебя ждёт:\n\n` +
        `<b>Среда, в которой растут</b>\n` +
        `Здесь не говорят «просто старайся» и не обесценивают путь.\n` +
        `Это поле людей из мягких ниш, которые действуют, поддерживают и идут вперёд — без давления и сравнений.\n\n` +
        `<b>Живые встречи в твоём городе и за его пределами — у нас 60+ чатов по городам</b> и странам. Девушки встречаются, пьют чай, обнимаются, делятся самым важным. Настоящая реальная связь.\n\n` +
        `<b>Практики и эфиры</b> с психологами, коучами, сексологами — мы не грузим «теорией». Только то, что помогает прямо сейчас: пережить, отпустить, выбрать, начать с новой опоры.\n\n` +
        `<b>Обучение, эфиры и разборы</b>\n` +
        `Деньги, продажи, состояние, идентичность, масштаб. Мини-курсы и живые эфиры с Кристиной — только то, что можно встроить и применить.\n\n` +
        `<b>Приложение для внутреннего компаса</b> – слушай своё состояние, получай персональные рекомендации и следи, как меняется твоя энергия, фокус и эмоции.\n\n` +
        `🤍 Это пространство, где потенциал переводят в действия, а действия — в устойчивый доход.\n\n` +
        `Присоединяйся.\n` +
        `Доступ к клубу откроется в этом чат-боте сразу после оплаты.\n\n` +
        `<u>Обращаем ваше внимание, что клуб работает по системе ежемесячных автоплатежей, которые вы можете отключить при необходимости.</u>`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard
        }
      );
    }
  } catch (error) {
    logger.error({ error, task }, 'Failed to process scheduled task');
    throw error;
  }
}

// Start scheduler processing
schedulerService.startProcessing(processScheduledTask);

// Bot commands
bot.command('start', async (ctx) => {
  try {
    const keyboard = new InlineKeyboard()
      .text('Получить доступ', 'get_access')
      .row()
      .webApp('🚀 MiniApp', config.WEBAPP_URL);

    await telegramService.sendMessage(
      ctx.chat.id,
      `<b>Код Денег — здесь.</b>\n\n` +
      `❤️ Экосистема, где <b>15 000+ участников</b>\n` +
      `уже выстраивают доход в мягких нишах через поле, этапы и живую среду — а не одиночные курсы.\n\n` +
      `Смотри видео и узнай, что ждет тебя внутри клуба\n\n` +
      `Доступ сразу после входа 👇`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /start command');
  }
});

// Handle "Получить доступ" callback button
bot.callbackQuery('get_access', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    const webAppUrl = `https://ishodnyi-kod.com/webappclubik`;

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить', webAppUrl);

    await telegramService.sendMessage(
      chatId,
      `<b>🎫 Твой билет в КОД ДЕНЕГ</b>\n\n` +
      `<b>Информация о подписке на клуб «Код Денег»:</b>\n` +
      `👉🏼 1 месяц = 2.900 ₽\n` +
      `👉🏼 В подписку входит полный доступ к клубу «Код Денег»: обучение и мини-курсы по мягким нишам, ` +
      `десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
      `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
      `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );

    // Mark user as awaiting payment
    await stateService.setState(userId, 'awaiting_payment');

    // Schedule payment reminder after 5 minutes
    await schedulerService.schedule(
      {
        type: 'payment_reminder',
        userId,
        chatId,
      },
      5 * 60 * 1000 // 5 minutes
    );

    // Check payment after 10 seconds
    setTimeout(async () => {
      try {
        const paid = await checkPaymentStatus(userId);
        if (paid) {
          await telegramService.sendMessage(
            chatId,
            '🎉 <b>Поздравляю с покупкой!</b>\n\n' +
            'Добро пожаловать в клуб «Код Денег»! Теперь у тебя есть полный доступ ко всем материалам.',
            { parse_mode: 'HTML' }
          );
          await stateService.setState(userId, 'paid');
        }
      } catch (error) {
        logger.error({ error, userId }, 'Error checking payment status');
      }
    }, 10000); // Check after 10 seconds
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in get_access handler');
  }
});

// Handle "Я не готов" callback
bot.callbackQuery('not_ready', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const keyboard = new Keyboard()
      .text('🔮 где мои деньги в 2026 году')
      .text('💰 почему доход не растет')
      .row()
      .text('🧠 состояние vs деньги')
      .text('🌍 окружение')
      .resized();

    await telegramService.sendMessage(
      ctx.chat!.id,
      `<b>Что горит прямо сейчас? 🔥</b>\n\n` +
      `Только честно.\n` +
      `Чтобы не грузить лишним — выбери, что сейчас важнее всего 👇`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in not_ready callback');
  }
});

// Handle topic selection buttons
bot.hears('🔮 где мои деньги в 2026 году', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://ishodnyi-kod.com/webappclubik`);

    await telegramService.sendMessage(
      chatId,
      `В 2026 деньги не живут отдельно от жизни.\n` +
      `Состояние, энергия, здоровье и отношения\n` +
      `напрямую влияют на рост дохода.\n\n` +
      `Если хочешь <b>финансово вырасти в 2026,</b>\n` +
      `важно знать:\n` +
      `— в какой энергии проходит твой год\n` +
      `— где точка роста, а где утечки\n` +
      `— на чём деньги реально умножаются\n\n` +
      `Я подготовила <b>индивидуальный гайд</b>\n` +
      `с расшифровкой по дате рождения: финансы, отношения, энергия, здоровье, ключевые периоды года.`,
      { parse_mode: 'HTML' }
    );

    await telegramService.sendDocument(chatId, 'https://t.me/mate_bot_open/9257');

    await telegramService.sendMessage(
      chatId,
      `Если хочешь не просто понять прогноз, а <b>реально прожить 2026 в росте</b>, это делается через среду и этапы.\n\n` +
      `В клубе <b>«Код Денег»</b> мы переводим прогноз в действия, состояние — в доход, а потенциал — в результат.\n\n` +
      `Забирай гайд и заходи в поле ☝️`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in topic handler: деньги в 2026');
  }
});

bot.hears('💰 почему доход не растет', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://ishodnyi-kod.com/webappclubik`);

    await telegramService.sendMessage(
      chatId,
      `Если деньги не растут —\n` +
      `причина чаще не в знаниях, а в состоянии и сценариях.\n\n` +
      `В гайде ты увидишь:\n` +
      `— где именно ты застряла\n` +
      `— какие установки тормозят доход\n` +
      `— какой шаг сейчас даст рост`
    );

    await telegramService.sendDocument(chatId, 'https://t.me/mate_bot_open/9258');

    await telegramService.sendMessage(
      chatId,
      `А если хочешь не просто понять причину, а <b>реально выйти из финансового тупика</b>, это делается через этапы и среду.\n\n` +
      `В клубе <b>«Код Денег»</b> мы переводим осознание\n` +
      `в действия, действия — в результат, а результат — в стабильный доход.\n\n` +
      `Забирай гайд и заходи в поле ☝️`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in topic handler: доход не растет');
  }
});

bot.hears('🧠 состояние vs деньги', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://ishodnyi-kod.com/webappclubik`);

    await telegramService.sendMessage(
      chatId,
      `Если состояние не держит — деньги не удерживаются.\n\n` +
      `В гайде ты увидишь:\n` +
      `— где у тебя утекает энергия\n` +
      `— через что к тебе приходят деньги\n` +
      `— персональную расшифровку <b>по дате рождения</b>\n\n` +
      `А если хочешь не просто понять,\n` +
      `а <b>реально выстроить доход </b>—\n` +
      `дальше это делается через среду и этапы.`,
      { parse_mode: 'HTML' }
    );

    await telegramService.sendDocument(chatId, 'https://t.me/mate_bot_open/9259');

    await telegramService.sendMessage(
      chatId,
      `В клубе <b>«Код Денег»</b> мы переводим состояние в действия,\n` +
      `а действия — в деньги.\n\n` +
      `Забирай гайд и заходи в поле ☝️`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in topic handler: состояние vs деньги');
  }
});

bot.hears('🌍 окружение', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://ishodnyi-kod.com/webappclubik`);

    // Send all images as media group
    await telegramService.sendMediaGroup(chatId, [
      { type: 'photo', media: 'https://t.me/mate_bot_open/9251' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/9252' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/9253' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/9254' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/9255' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/9256' }
    ]);

    await telegramService.sendMessage(
      chatId,
      `<b>🌍 Твоё окружение — твоя точка роста.</b>\n\n` +
      `Когда ты оказываешься в правильной среде,\n` +
      `рост перестаёт быть борьбой.\n\n` +
      `💡 Появляется ясность, энергия и движение.\n` +
      `👥 Рядом — люди, которые понимают твой путь,\n` +
      `поддерживают и <b>идут к своим целям</b>, а не обсуждают чужие.\n\n` +
      `«Я сделала то, что откладывала месяцами».\n` +
      `«Доход сдвинулся, потому что я перестала быть в одиночке».\n\n` +
      `✨ Это не магия.\n` +
      `Это <b>сила среды</b>, которая работает всегда.\n` +
      `Недаром говорят: <i>ты — среднее из тех, кто рядом с тобой.</i>\n\n` +
      `В клубе <b>«Код Денег»</b> — тысячи участников по всей стране.\n` +
      `🌍 Сообщество в <b>60+ городах</b>, живые встречи, десятки.\n` +
      `🤝 Поддержка, обмен опытом и рост через поле.\n\n` +
      `Ты попадаешь в среду, где: действуют, растут, фиксируют результат\n\n` +
      `👉 Подключайся.\n` +
      `Когда ты не один —\n` +
      `двигаться к деньгам и целям становится проще.`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in topic handler: окружение');
  }
});

bot.command('app', async (ctx) => {
  try {
    const keyboard = new InlineKeyboard()
      .webApp('🚀 Открыть приложение', config.WEBAPP_URL);

    await telegramService.sendMessage(
      ctx.chat.id,
      'Нажми кнопку, чтобы открыть приложение:',
      { reply_markup: keyboard }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /app command');
  }
});

bot.command('today', async (ctx) => {
  try {
    const telegramId = String(ctx.from?.id);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (!user) {
      await telegramService.sendMessage(
        ctx.chat.id,
        'Сначала открой приложение, чтобы зарегистрироваться! /app'
      );
      return;
    }

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
      await telegramService.sendMessage(
        ctx.chat.id,
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

    await telegramService.sendMessage(ctx.chat.id, message, { reply_markup: keyboard });
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /today command');
  }
});

bot.command('progress', async (ctx) => {
  try {
    const telegramId = String(ctx.from?.id);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (!user) {
      await telegramService.sendMessage(ctx.chat.id, 'Сначала открой приложение! /app');
      return;
    }

    const stats = await gamificationService.getUserStats(user.id);

    if (!stats) {
      await telegramService.sendMessage(ctx.chat.id, 'Статистика недоступна');
      return;
    }

    const progressBar = '█'.repeat(Math.floor(stats.progressPercent / 10)) +
                        '░'.repeat(10 - Math.floor(stats.progressPercent / 10));

    await telegramService.sendMessage(
      ctx.chat.id,
      `📊 Твой прогресс:\n\n` +
      `🏆 Уровень: ${stats.level}\n` +
      `⭐ Опыт: ${stats.experience} XP\n` +
      `🔥 Серия дней: ${stats.streak}\n\n` +
      `Прогресс до следующего уровня:\n` +
      `[${progressBar}] ${stats.progressPercent}%\n` +
      `${stats.progressToNextLevel}/${stats.xpNeededForNextLevel} XP`
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /progress command');
  }
});

bot.command('meditate', async (ctx) => {
  try {
    const meditationsList = await db
      .select()
      .from(meditations)
      .where(eq(meditations.isPremium, false))
      .limit(5);

    if (meditationsList.length === 0) {
      await telegramService.sendMessage(ctx.chat.id, 'Медитации пока недоступны. Попробуй позже!');
      return;
    }

    const randomMeditation = meditationsList[Math.floor(Math.random() * meditationsList.length)];

    const keyboard = new InlineKeyboard()
      .webApp('🧘 Начать медитацию', `${config.WEBAPP_URL}/meditations/${randomMeditation.id}`);

    await telegramService.sendMessage(
      ctx.chat.id,
      `🧘 Рекомендуем медитацию:\n\n` +
      `*${randomMeditation.title}*\n` +
      `⏱ ${Math.floor(randomMeditation.duration / 60)} минут\n\n` +
      `${randomMeditation.description || ''}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /meditate command');
  }
});

// Callback handlers
bot.callbackQuery('my_courses', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const keyboard = new InlineKeyboard()
      .webApp('📚 Открыть курсы', `${config.WEBAPP_URL}/courses`);

    await telegramService.sendMessage(
      ctx.chat!.id,
      'Открой приложение, чтобы увидеть свои курсы:',
      { reply_markup: keyboard }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in my_courses callback');
  }
});

bot.callbackQuery('meditations', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const keyboard = new InlineKeyboard()
      .webApp('🧘 Открыть медитации', `${config.WEBAPP_URL}/meditations`);

    await telegramService.sendMessage(
      ctx.chat!.id,
      'Открой приложение, чтобы увидеть медитации:',
      { reply_markup: keyboard }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in meditations callback');
  }
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
