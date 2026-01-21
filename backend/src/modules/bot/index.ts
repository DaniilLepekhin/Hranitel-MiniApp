import { Elysia, t } from 'elysia';
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { webhookRateLimit } from '@/middlewares/rateLimit';
import { db, users, courses, courseProgress, meditations, clubFunnelProgress } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { gamificationService } from '@/modules/gamification/service';
import { schedulerService, type ScheduledTask } from '@/services/scheduler.service';
import { TelegramService } from '@/services/telegram.service';
import { stateService } from '@/services/state.service';
// 🆕 Post-payment funnels
import * as funnels from './post-payment-funnels';
// 🆕 Club funnel (numerology-based pre-payment funnel)
import * as clubFunnel from './club-funnel';

// Initialize bot
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Initialize bot info (required for webhooks)
await bot.init();

// Set bot commands for menu button
await bot.api.setMyCommands([
  { command: 'menu', description: 'Главное меню' },
]);

// Initialize Telegram service
const telegramService = new TelegramService(bot.api);

// Initialize telegram service for funnels
funnels.initTelegramService(bot.api);
// Initialize telegram service for club funnel
clubFunnel.initClubFunnelTelegramService(bot.api);

// Helper to check payment status
async function checkPaymentStatus(userId: number): Promise<boolean> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, String(userId)))
      .limit(1);

    // Check if user has active subscription (isPro = true OR subscription hasn't expired)
    if (!user) return false;

    if (user.isPro) return true;

    // Also check subscription expiration date
    if (user.subscriptionExpires && new Date(user.subscriptionExpires) > new Date()) {
      return true;
    }

    return false;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to check payment status');
    return false;
  }
}

// Helper to calculate delay until specific Moscow time
function getDelayUntilMoscowTime(hour: number, minute: number = 0): number {
  const now = new Date();
  // Moscow is UTC+3
  const moscowOffset = 3 * 60; // minutes
  const localOffset = now.getTimezoneOffset(); // minutes from UTC (negative for east)
  const totalOffset = moscowOffset + localOffset; // minutes to add to local to get Moscow

  // Create target time in Moscow
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  // Adjust for timezone difference
  target.setMinutes(target.getMinutes() - totalOffset + now.getTimezoneOffset());

  // If target time has passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

// Task processor callback for scheduled tasks
async function processScheduledTask(task: ScheduledTask): Promise<void> {
  const { type, userId, chatId } = task;

  try {
    // Check if user already paid
    const paid = await checkPaymentStatus(userId);
    if (paid) {
      logger.info({ userId, taskType: type }, 'User already paid, cancelling all remaining tasks');
      // Cancel ALL remaining tasks for this user
      await schedulerService.cancelAllUserTasks(userId);
      return;
    }

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`)
      .row()
      .text('Я не готов 🤔', 'not_ready_1');

    const simpleKeyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

    if (type === 'start_reminder') {
      // СООБЩЕНИЕ 2 - 120-second reminder (same as get_access flow)
      // This is sent if user didn't click "Получить доступ" button
      const msg2Keyboard = new InlineKeyboard()
        .webApp('Оплатить ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

      await telegramService.sendPhoto(
        chatId,
        'https://t.me/mate_bot_open/9276',
        {
          caption:
            `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
            `<b>Информация о подписке на клуб «Код Денег»:</b>\n\n` +
            `👉🏼 1 месяц = 2.900 ₽\n` +
            `👉🏼 В подписку входит полный доступ к клубу «Код Денег»: обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
            `👉🏼 Подписка продлевается автоматически кажды 30 дней. Отписаться можно в любой момент в меню участника.\n` +
            `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
            `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
            `Получить доступ в закрытый канал 👇🏼`,
          reply_markup: msg2Keyboard,
          parse_mode: 'HTML'
        }
      );

      // Mark user as awaiting payment
      await stateService.setState(userId, 'awaiting_payment');

      // Сразу отправляем видео марафона
      const marathonKeyboard = new InlineKeyboard()
        .webApp('попасть на марафон ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9369',
        {
          caption:
            `<b>Марафон КОД ДЕНЕГ внутри клуба КОД УСПЕХА</b>\n\n` +
            `<b>30 дней марафона и 4 дня эфиров, в которых всё собирается в систему 👇</b>\n\n` +
            `<b>День 1</b>\n` +
            `Стиль, образ, позиционирование.\n` +
            `Ты понимаешь:\n` +
            `— как проявляться\n` +
            `— как привлекать внимание и возможности\n` +
            `— как через свой образ влиять на людей\n\n` +
            `<b>День 2</b>\n` +
            `Честный разбор слепых зон.\n` +
            `Без обвинений и иллюзий:\n` +
            `— что мешало раньше\n` +
            `— куда утекают ресурсы и деньги\n` +
            `— где именно стоит усилиться\n\n` +
            `<b>День 3</b>\n` +
            `Создание продукта.\n` +
            `Ты собираешь конкретный продукт,\n` +
            `на котором можно зарабатывать <b>весь год,</b>\n` +
            `и понимаешь, как внедрять его в жизнь и работу.\n\n` +
            `<b>День 4</b>\n` +
            `Дорожная карта.\n` +
            `План на месяц и маршрут на год вперёд.\n` +
            `Плюс — деление на <b>Десятки:</b>\n` +
            `мини-группы по 10 человек и включение в клуб с поддержкой.\n\n` +
            `<b>💰 Стоимость</b>\n` +
            `<s>3000 ₽</s>\n` +
            `<b>2000 ₽ для тебя</b> — марафон + месяц в клубе + доступ к приложению ментального здоровья\n\n` +
            `Если пойдешь с нами — у тебя появятся:\n` +
            `— дорожная карта\n` +
            `— структура\n` +
            `— среда, где не дают слиться 🤝\n\n` +
            `<b>Дальше — либо по-старому.\nЛибо по-настоящему.</b>`,
          parse_mode: 'HTML',
          reply_markup: marathonKeyboard
        }
      );

      // Schedule нумерологический гайд after 20 minutes (если не оплатил)
      await schedulerService.schedule(
        {
          type: 'numerology_guide_reminder',
          userId,
          chatId,
        },
        20 * 60 * 1000 // 20 minutes
      );

      // 🔧 Single payment check after 20 minutes
      await schedulerService.schedule(
        {
          type: 'payment_check',
          userId,
          chatId,
          data: { checkNumber: 1, maxChecks: 1 }
        },
        20 * 60 * 1000 // 20 minutes
      );
    } else if (type === 'numerology_guide_reminder') {
      // Нумерологический гайд через 20 минут после марафона (если не оплатил)
      const guideKeyboard = new InlineKeyboard()
        .url('Скачать гайд ❤️', 'https://t.me/kristina_egiazarova_bot?start=leadmagnit180126');

      await telegramService.sendPhoto(
        chatId,
        'https://t.me/mate_bot_open/9370',
        {
          caption:
            `<b>Хотите узнать, что скрывает ваше число рождения? ✨</b>\n\n` +
            `Кем вам <b>выгодно быть?</b>\n` +
            `Где заложен <b>ваш масштаб? </b>\n` +
            `Почему, едва почувствовав потолок —\n` +
            `<b>что мешает раскрыть потенциал? </b>\n\n` +
            `У каждого числа — <b>свой стиль, сила и слабости.</b>\n` +
            `Гайд покажет, как раскрывается ваш <b>характер</b>\n` +
            `в контексте <b>бизнеса и жизни </b>\n\n` +
            `<b>31 ключ к себе</b> внутри гайда ⬇️`,
          parse_mode: 'HTML',
          reply_markup: guideKeyboard
        }
      );

      // Через 5 минут после гайда отправляем "3 главные ловушки"
      await schedulerService.schedule(
        {
          type: 'five_min_reminder',
          userId,
          chatId,
        },
        5 * 60 * 1000 // 5 minutes
      );
    } else if (type === 'five_min_reminder') {
      // СООБЩЕНИЕ 6 - Send 5-minute reminder with video - "3 ловушки"
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
            `В клубе «КОД УСПЕХА» не мотивируют словами.\n` +
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

      // Schedule 20-minute "Что горит" reminder
      await schedulerService.schedule(
        {
          type: 'burning_question_reminder',
          userId,
          chatId,
        },
        20 * 60 * 1000 // 20 minutes
      );
    } else if (type === 'burning_question_reminder') {
      // Send "Что горит прямо сейчас?" reminder after 20 minutes
      const burningKeyboard = new InlineKeyboard()
        .text('🔮 где мои деньги в 2026 году', 'topic_money_2026')
        .row()
        .text('💰 почему доход не растет', 'topic_income')
        .row()
        .text('🧠 состояние vs деньги', 'topic_state')
        .row()
        .text('🌍 окружение', 'topic_environment');

      await telegramService.sendPhoto(
        chatId,
        'https://t.me/mate_bot_open/9277',
        {
          caption:
            `<b>Что горит прямо сейчас? 🔥</b>\n\n` +
            `Только честно.\n` +
            `Чтобы не грузить лишним — выбери, что сейчас важнее всего 👇`,
          parse_mode: 'HTML',
          reply_markup: burningKeyboard
        }
      );

      // Schedule 60-minute "Это не просто клуб" reminder
      await schedulerService.schedule(
        {
          type: 'payment_reminder',
          userId,
          chatId,
        },
        60 * 60 * 1000 // 60 minutes (total: 5 min + 20 min + 60 min = 85 min from get_access)
      );
    } else if (type === 'payment_reminder') {
      // СООБЩЕНИЕ 8 - Send 60-minute reminder with "я не готов" button
      const msg8Keyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`)
        .row()
        .text('я не готов 🤔', 'not_ready_3');

      // Send video first
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9348'
      );

      // Send text as separate message (caption too long - Telegram limit 1024 chars)
      await telegramService.sendMessage(
        chatId,
        `<b>Это не просто клуб.\n` +
        `Это точка, где меняется траектория дохода.</b>\n\n` +
        `Мы видим, что ты заглянула внутрь, но ещё сомневаешься.\n` +
        `И это нормально.\n` +
        `Обычно в такие моменты интуиция уже всё поняла — нужно пространство, где рост перестаёт быть одиночным.\n\n` +
        `Внутри клуба <b>«Код Успеха»</b> тебя ждёт:\n\n` +
        `<b>Среда, в которой растут</b>\n` +
        `Здесь не говорят «просто старайся» и не обесценивают путь.\n` +
        `Это поле людей из мягких ниш, которые действуют, поддерживают и идут вперёд — без давления и сравнений.\n\n` +
        `<b>Живые встречи в твоём городе и за его пределами — у нас 60+ чатов по городам и странам. Девушки встречаются, пьют чай, обнимаются, делятся самым важным. Настоящая реальная связь.</b>\n\n` +
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
          reply_markup: msg8Keyboard
        }
      );

      // Schedule day 2 reminder at 10:00 Moscow time
      const delayToDay2 = getDelayUntilMoscowTime(10, 0);
      await schedulerService.schedule(
        {
          type: 'day2_reminder',
          userId,
          chatId,
        },
        delayToDay2
      );
    } else if (type === 'day2_reminder') {
      // СООБЩЕНИЕ 9 - Day 2 - 10:00 Moscow time
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9349',
        {
          caption:
            `Не всем нужен шум.\n` +
            `И не всем заходят громкие обещания.\n\n` +
            `Зато почти всем знакомо ощущение, что деньги идут нестабильно, хотя ты стараешься и вроде всё делаешь правильно 🤷‍♀️\n` +
            `Значит, дело не в усилиях — а в среде и настройке 👀\n\n` +
            `<b>Наш фокус на 2026 год</b> —помочь расти в финансах через окружение, спринты и инструменты, которые реально используются, а не откладываются «на потом» 🚀\n\n` +
            `<b>Клуб «Код Успеха» — это когда:</b>\n` +
            `— <b>застрял и не понимаешь, куда дальше</b> → смотришь эфиры, разбираешь кейсы, начинаешь видеть картину 🧠\n` +
            `— <b>нужен совет, партнёр или контакт</b> → спрашиваешь у людей, у которых уже работает 🤝\n` +
            `— <b>хочется системности</b> → проходишь курсы и внедряешь шаг за шагом, без перегруза 📚\n` +
            `— <b>нужен импульс и фокус</b> → идёшь в десятку и не буксуешь в одиночку ⏱️\n` +
            `— <b>не хватает живого общения</b> → встречаешься офлайн с людьми на одной волне 🔥\n\n` +
            `Вход в клуб открыт.\n` +
            `Мы видим, что ты всё ещё не с нами 👀`,
          parse_mode: 'HTML',
          reply_markup: simpleKeyboard
        }
      );

      // Schedule day 3 reminder at 11:00 Moscow time next day (25 hours from day2)
      // Since day2 is sent at 10:00, we need 25 hours = 1 day + 1 hour
      const delayToDay3 = 25 * 60 * 60 * 1000; // 25 hours
      await schedulerService.schedule(
        {
          type: 'day3_reminder',
          userId,
          chatId,
        },
        delayToDay3
      );
    } else if (type === 'day3_reminder') {
      // СООБЩЕНИЕ 10 - Day 3 - 11:00 Moscow time
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9350',
        {
          caption:
            `Ничего уговаривать не будем.\n` +
            `Можно, конечно, «<b>пойдёмте отсюда</b>» —\n` +
            `так когда-то сказала Фрося 🙂\n` +
            `А потом оказалось, что «приходите завтра»\n` +
            `иногда переводится как «уже поздно».\n\n` +
            `А можно остаться и спокойно посмотреть,\n` +
            `почему тут собираются люди, у которых с цифрами всё уже более-менее в порядке 👀\n\n` +
            `Доступ в клуб ещё открыт.\n` +
            `Ненадолго 🤫`,
          parse_mode: 'HTML',
          reply_markup: simpleKeyboard
        }
      );

      // Schedule day 4 reminder 24 hours after day3 (same time next day)
      const delayToDay4 = 24 * 60 * 60 * 1000; // 24 hours
      await schedulerService.schedule(
        {
          type: 'day4_reminder',
          userId,
          chatId,
        },
        delayToDay4
      );
    } else if (type === 'day4_reminder') {
      // СООБЩЕНИЕ 11 - Day 4 - 11:00 Moscow time
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9351',
        {
          caption:
            `<b>А вдруг я иду не туда?</b>\n\n` +
            `POV: момент,\n` +
            `когда ты понимаешь,\n` +
            `что быть счастливым — это выбор, а не случайность.\n\n` +
            `Можно дальше идти «как идётся» 🤷‍♀️\n` +
            `Можно привыкнуть и не задавать вопросы.\n\n` +
            `А можно выбрать среду,\n` +
            `где становится спокойнее внутри\n` +
            `и яснее в голове 🙂\n\n` +
            `Если эта мысль уже щёлкнула —\n` +
            `значит, дверь в клуб не случайно ещё открыта 👀`,
          parse_mode: 'HTML',
          reply_markup: simpleKeyboard
        }
      );

      // Schedule day 5 final reminder 24 hours after day4 (same time next day, 4 hours before closing)
      const delayToDay5 = 24 * 60 * 60 * 1000; // 24 hours
      await schedulerService.schedule(
        {
          type: 'day5_final',
          userId,
          chatId,
        },
        delayToDay5
      );
    } else if (type === 'day5_final') {
      // СООБЩЕНИЕ 12 - Day 5 - 11:00 Moscow time - Final reminder with image
      await telegramService.sendPhoto(
        chatId,
        'https://t.me/mate_bot_open/9352',
        {
          caption:
            `<b>Не сейчас.\n` +
            `Не сейчас.\n` +
            `Не сейчас.\n` +
            `Ну всё… я опоздал.</b>\n\n` +
            `Это обычно происходит так:\n` +
            `сначала «гляну позже»,\n` +
            `потом «вечером разберусь»,\n` +
            `а потом — <i>доступ в клуб уже закрыт.</i>\n\n` +
            `Мы не торопим и не дёргаем.\n` +
            `Просто честно напоминаем:\n` +
            `<b>через 4 часа вход закроется.</b>\n\n` +
            `Если давно было ощущение «надо бы зайти» —\n` +
            `вот это оно и есть 🙂`,
          parse_markup: 'HTML',
          reply_markup: simpleKeyboard
        }
      );
    }
    // 🆕 Post-payment onboarding - Keyword reminders
    else if (type === 'keyword_reminder_20m') await funnels.sendKeywordReminder20m(userId, chatId);
    else if (type === 'keyword_reminder_60m') await funnels.sendKeywordReminder60m(userId, chatId);
    else if (type === 'keyword_reminder_120m') await funnels.sendKeywordReminder120m(userId, chatId);
    // 🆕 Post-payment onboarding - Ready button reminders
    else if (type === 'ready_reminder_30m') await funnels.sendReadyReminder30m(userId, chatId);
    else if (type === 'ready_reminder_60m') await funnels.sendReadyReminder60m(userId, chatId);
    else if (type === 'ready_final_120m') await funnels.sendReadyFinal120m(userId, chatId);
    // 🆕 Engagement funnel
    else if (type === 'day1_gift_promo') await funnels.sendDay1GiftPromo(userId, chatId);
    else if (type === 'day7_check_in') await funnels.sendDay7CheckIn(userId, chatId);
    else if (type === 'day14_check_in') await funnels.sendDay14CheckIn(userId, chatId);
    else if (type === 'day21_check_in') await funnels.sendDay21CheckIn(userId, chatId);
    else if (type === 'day28_renewal') await funnels.sendDay28Renewal(userId, chatId);
    // 🆕 Renewal reminders
    else if (type === 'renewal_2days') await funnels.sendRenewal2Days(userId, chatId);
    else if (type === 'renewal_1day') await funnels.sendRenewal1Day(userId, chatId);
    else if (type === 'renewal_today') await funnels.sendRenewalToday(userId, chatId);
    // 🆕 Gift subscription expiry reminders
    else if (type === 'gift_expiry_3days') await funnels.sendGiftExpiry3Days(userId, chatId);
    else if (type === 'gift_expiry_2days') await funnels.sendGiftExpiry2Days(userId, chatId);
    else if (type === 'gift_expiry_1day') await funnels.sendGiftExpiry1Day(userId, chatId);
    // 🆕 Club funnel auto-progress
    else if (type === 'club_auto_progress') {
      const { odUserId, step } = task.data || {};
      if (odUserId && chatId && step) {
        await clubFunnel.handleClubAutoProgress(odUserId, chatId, step);
      }
    }
    // 🔧 Payment check (scheduler-based, survives restarts)
    else if (type === 'payment_check') {
      const { checkNumber, maxChecks } = task.data || { checkNumber: 1, maxChecks: 10 };
      const paid = await checkPaymentStatus(userId);

      if (paid) {
        // Cancel all scheduled tasks for this user (including remaining payment checks)
        await schedulerService.cancelAllUserTasks(userId);

        // Send congratulations
        await telegramService.sendMessage(
          chatId,
          '🎉 <b>Поздравляю с покупкой!</b>\n\n' +
          'Добро пожаловать в клуб «Код Денег»! Теперь у тебя есть полный доступ ко всем материалам.\n\n' +
          'Нажми /app чтобы открыть приложение клуба.',
          { parse_mode: 'HTML' }
        );
        await stateService.setState(userId, 'paid');
        logger.info({ userId, checkNumber }, 'Payment detected, user welcomed');

        // Start post-payment onboarding funnel
        const user = await funnels.getUserByTgId(userId);
        if (user) {
          await funnels.startOnboardingAfterPayment(user.id, chatId);
        }
      } else {
        logger.debug({ userId, checkNumber, maxChecks }, 'Payment not detected yet');
      }
    }
    else {
      logger.warn({ taskType: type }, 'Unknown task type');
    }
  } catch (error) {
    logger.error({ error, task }, 'Failed to process scheduled task');
    throw error;
  }
}

// Start processing scheduled tasks (preserve tasks between restarts)
// NOTE: We DON'T clear tasks on restart to ensure users receive all scheduled messages
const pendingCount = await schedulerService.getPendingCount();
logger.info({ pendingCount }, 'Bot restarted, resuming scheduled task processing');
schedulerService.startProcessing(processScheduledTask);

// Bot commands
bot.command('start', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    // 🆕 Check for gift activation link (start=gift_{token})
    const startPayload = ctx.match;
    if (startPayload && startPayload.startsWith('gift_')) {
      const token = startPayload.substring(5); // Remove 'gift_' prefix
      await funnels.handleGiftActivation(userId, token, chatId);
      return;
    }

    // 🔍 Check if user already exists and has paid FIRST (before any funnels)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, String(userId)))
      .limit(1);

    // ✅ If user has PAID (isPro = true), return to current onboarding step
    // Don't redirect them to club funnel or sales funnel
    if (user && user.isPro) {
      logger.info({ userId, onboardingStep: user.onboardingStep }, 'Paid user /start - returning to onboarding step');

      // Этап 1: Ожидание кодового слова
      if (user.onboardingStep === 'awaiting_keyword') {
        await ctx.reply(
          `«Ты начинаешь погружение в <b>«Код успеха. Глава: Пробуждение»</b> ✨\n\n` +
          `Чтобы двери нашей экосистемы открылись, тебе нужно принять её правила.\n\n` +
          `🎥 Посмотри видео Кристины <b>до самого конца.</b> Кристина расскажет, как устроена наша Вселенная: где искать ключи, как работает супер-апп и как найти свою стаю 😄 (чаты городов и десятки).\n\n` +
          `<b>🗝 Внимание: внутри видео спрятан секретный Ключ (кодовое слово). Без него я не смогу выдать тебе доступы к материалам и закрытым чатам.</b>\n\n` +
          `Смотри внимательно. <i>Как только услышишь слово — пиши его мне в ответ 👇🏼</i>»`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Этап 2-3: После ввода кодового слова - показать меню
      if (
        user.onboardingStep === 'awaiting_ready' ||
        user.onboardingStep === 'onboarding_complete' ||
        !user.onboardingStep
      ) {
        await funnels.sendMenuMessage(chatId);
        return;
      }
    }

    // 🆕 Check for club funnel link (start=club) - only for non-paying users
    if (startPayload === 'club') {
      // Get or create user in database
      let clubUser = user; // Reuse user from above query
      if (!clubUser) {
        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: String(userId),
            username: ctx.from?.username || null,
            firstName: ctx.from?.first_name || null,
            lastName: ctx.from?.last_name || null,
          })
          .returning();
        clubUser = newUser;
      }

      await clubFunnel.startClubFunnel(clubUser.id, chatId, String(userId));
      return;
    }

    // ❌ Если пользователь НЕ оплатил - запустить продажную воронку
    // 🧹 Очистка всех запланированных задач при перезапуске /start (обычная + club воронка)

    // Обычная воронка (все типы задач)
    await schedulerService.cancelUserTasksByType(userId, 'start_reminder');
    await schedulerService.cancelUserTasksByType(userId, 'five_min_reminder');
    await schedulerService.cancelUserTasksByType(userId, 'burning_question_reminder');
    await schedulerService.cancelUserTasksByType(userId, 'payment_reminder');
    await schedulerService.cancelUserTasksByType(userId, 'final_reminder');
    await schedulerService.cancelUserTasksByType(userId, 'day2_reminder');
    await schedulerService.cancelUserTasksByType(userId, 'day3_reminder');
    await schedulerService.cancelUserTasksByType(userId, 'day4_reminder');
    await schedulerService.cancelUserTasksByType(userId, 'day5_final');

    // Club воронка
    await schedulerService.cancelUserTasksByType(userId, 'club_auto_progress');

    logger.info({ userId }, 'Start command - cancelled all pending tasks from both funnels');

    const keyboard = new InlineKeyboard()
      .text('Получить доступ', 'get_access')
      .row()
      .webApp('🚀 MiniApp', config.WEBAPP_URL);

    // Send video with message
    await telegramService.sendVideo(
      chatId,
      'https://t.me/mate_bot_open/9275',
      {
        caption:
          `<b>Код Успеха — здесь.</b>\n\n` +
          `❤️ Экосистема, где <b>15 000+ участников</b>\n` +
          `уже выстраивают доход в мягких нишах через поле, этапы и живую среду — а не одиночные курсы.\n\n` +
          `Смотри видео и узнай, что ждет тебя внутри клуба\n\n` +
          `Доступ сразу после входа 👇`,
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

    // Schedule 120-second reminder if user doesn't click "Получить доступ"
    await schedulerService.schedule(
      {
        type: 'start_reminder',
        userId,
        chatId,
      },
      120 * 1000 // 120 seconds = 2 minutes
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
    const webAppUrl = `https://hranitel.daniillepekhin.com/payment_form_club.html`;

    // Cancel the 120-second start reminder since user clicked the button
    await schedulerService.cancelUserTasksByType(userId, 'start_reminder');

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', webAppUrl);

    // Send image with ticket info
    await telegramService.sendPhoto(
      chatId,
      'https://t.me/mate_bot_open/9276',
      {
        caption:
          `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
          `<b>Информация о подписке на клуб «Код Денег»:</b>\n\n` +
          `👉🏼 1 месяц = 2.900 ₽\n` +
          `👉🏼 В подписку входит полный доступ к клубу «Код Денег»: обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
          `👉🏼 Подписка продлевается автоматически кажды 30 дней. Отписаться можно в любой момент в меню участника.\n` +
          `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
          `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
          `Получить доступ в закрытый канал 👇🏼`,
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

    // Mark user as awaiting payment
    await stateService.setState(userId, 'awaiting_payment');

    // Сразу отправляем видео марафона
    const marathonKeyboard = new InlineKeyboard()
      .webApp('попасть на марафон ❤️', webAppUrl);

    await telegramService.sendVideo(
      chatId,
      'https://t.me/mate_bot_open/9369',
      {
        caption:
          `<b>Марафон КОД ДЕНЕГ внутри клуба КОД УСПЕХА</b>\n\n` +
          `<b>30 дней марафона и 4 дня эфиров, в которых всё собирается в систему 👇</b>\n\n` +
          `<b>День 1</b>\n` +
          `Стиль, образ, позиционирование.\n` +
          `Ты понимаешь:\n` +
          `— как проявляться\n` +
          `— как привлекать внимание и возможности\n` +
          `— как через свой образ влиять на людей\n\n` +
          `<b>День 2</b>\n` +
          `Честный разбор слепых зон.\n` +
          `Без обвинений и иллюзий:\n` +
          `— что мешало раньше\n` +
          `— куда утекают ресурсы и деньги\n` +
          `— где именно стоит усилиться\n\n` +
          `<b>День 3</b>\n` +
          `Создание продукта.\n` +
          `Ты собираешь конкретный продукт,\n` +
          `на котором можно зарабатывать <b>весь год,</b>\n` +
          `и понимаешь, как внедрять его в жизнь и работу.\n\n` +
          `<b>День 4</b>\n` +
          `Дорожная карта.\n` +
          `План на месяц и маршрут на год вперёд.\n` +
          `Плюс — деление на <b>Десятки:</b>\n` +
          `мини-группы по 10 человек и включение в клуб с поддержкой.\n\n` +
          `<b>💰 Стоимость</b>\n` +
          `<s>3000 ₽</s>\n` +
          `<b>2000 ₽ для тебя</b> — марафон + месяц в клубе + доступ к приложению ментального здоровья\n\n` +
          `Если пойдешь с нами — у тебя появятся:\n` +
          `— дорожная карта\n` +
          `— структура\n` +
          `— среда, где не дают слиться 🤝\n\n` +
          `<b>Дальше — либо по-старому.\nЛибо по-настоящему.</b>`,
        parse_mode: 'HTML',
        reply_markup: marathonKeyboard
      }
    );

    // Schedule нумерологический гайд after 20 minutes (если не оплатил)
    await schedulerService.schedule(
      {
        type: 'numerology_guide_reminder',
        userId,
        chatId,
      },
      20 * 60 * 1000 // 20 minutes
    );

    // 🔧 Single payment check after 20 minutes
    await schedulerService.schedule(
      {
        type: 'payment_check',
        userId,
        chatId,
        data: { checkNumber: 1, maxChecks: 1 }
      },
      20 * 60 * 1000 // 20 minutes
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in get_access handler');
  }
});

// Handle "Я не готов" from Message 1 ("3 ловушки") - send "Что горит?"
bot.callbackQuery('not_ready_1', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;

    // Cancel scheduled burning_question_reminder since we're sending it now
    await schedulerService.cancelUserTasksByType(userId, 'burning_question_reminder');

    // Send СООБЩЕНИЕ 7 "Что горит?" immediately
    const burningKeyboard = new InlineKeyboard()
      .text('🔮 где мои деньги в 2026 году', 'topic_money_2026')
      .row()
      .text('💰 почему доход не растет', 'topic_income')
      .row()
      .text('🧠 состояние vs деньги', 'topic_state')
      .row()
      .text('🌍 окружение', 'topic_environment');

    await telegramService.sendPhoto(
      chatId,
      'https://t.me/mate_bot_open/9277',
      {
        caption:
          `<b>Что горит прямо сейчас? 🔥</b>\n\n` +
          `Только честно.\n` +
          `Чтобы не грузить лишним — выбери, что сейчас важнее всего 👇`,
        parse_mode: 'HTML',
        reply_markup: burningKeyboard
      }
    );

    // Schedule СООБЩЕНИЕ 8 after 60 minutes
    await schedulerService.schedule(
      {
        type: 'payment_reminder',
        userId,
        chatId,
      },
      60 * 60 * 1000 // 60 minutes
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in not_ready_1 callback');
  }
});

// Handle "я не готов" from Message 3 ("Это не просто клуб") - send "Не всем нужен шум"
bot.callbackQuery('not_ready_3', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

    // Cancel scheduled day2_reminder since user clicked "я не готов"
    await schedulerService.cancelUserTasksByType(userId, 'day2_reminder');

    // Send СООБЩЕНИЕ 9 "Не всем нужен шум" immediately
    await telegramService.sendVideo(
      chatId,
      'https://t.me/mate_bot_open/9349',
      {
        caption:
          `Не всем нужен шум.\n` +
          `И не всем заходят громкие обещания.\n\n` +
          `Зато почти всем знакомо ощущение, что деньги идут нестабильно, хотя ты стараешься и вроде всё делаешь правильно 🤷‍♀️\n` +
          `Значит, дело не в усилиях — а в среде и настройке 👀\n\n` +
          `<b>Наш фокус на 2026 год</b> —помочь расти в финансах через окружение, спринты и инструменты, которые реально используются, а не откладываются «на потом» 🚀\n\n` +
          `<b>Клуб «Код Успеха» — это когда:</b>\n` +
          `— <b>застрял и не понимаешь, куда дальше</b> → смотришь эфиры, разбираешь кейсы, начинаешь видеть картину 🧠\n` +
          `— <b>нужен совет, партнёр или контакт</b> → спрашиваешь у людей, у которых уже работает 🤝\n` +
          `— <b>хочется системности</b> → проходишь курсы и внедряешь шаг за шагом, без перегруза 📚\n` +
          `— <b>нужен импульс и фокус</b> → идёшь в десятку и не буксуешь в одиночку ⏱️\n` +
          `— <b>не хватает живого общения</b> → встречаешься офлайн с людьми на одной волне 🔥\n\n` +
          `Вход в клуб открыт.\n` +
          `Мы видим, что ты всё ещё не с нами 👀`,
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );

    // Schedule day 3 reminder at 11:00 Moscow time next day (25 hours from day2)
    // Since day2 is sent at 10:00, we need 25 hours = 1 day + 1 hour
    const delayToDay3 = 25 * 60 * 60 * 1000; // 25 hours
    await schedulerService.schedule(
      {
        type: 'day3_reminder',
        userId,
        chatId,
      },
      delayToDay3
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in not_ready_3 callback');
  }
});

// Handle inline keyboard callbacks for topics
bot.callbackQuery('topic_money_2026', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

    // Schedule payment_reminder (MSG 8) in 60 minutes after topic
    await schedulerService.schedule(
      {
        type: 'payment_reminder',
        userId,
        chatId,
      },
      60 * 60 * 1000 // 60 minutes
    );

    // ТОПИК 1 - Сообщение 1 с картинкой 9354
    await telegramService.sendPhoto(
      chatId,
      'https://t.me/mate_bot_open/9354',
      {
        caption:
          `В 2026 деньги не живут отдельно от жизни.\n` +
          `Состояние, энергия, здоровье и отношения\n` +
          `напрямую влияют на рост дохода.\n\n` +
          `Если хочешь <b>финансово вырасти в 2026,</b>\n` +
          `важно знать:\n` +
          `— в какой энергии проходит твой год\n` +
          `— где точка роста, а где утечки\n` +
          `— на чём деньги реально умножаются\n\n` +
          `Я подготовила индивидуальный гайд\n` +
          `с расшифровкой по дате рождения: финансы, отношения, энергия, здоровье, ключевые периоды года.`,
        parse_mode: 'HTML'
      }
    );

    await telegramService.sendDocument(chatId, 'https://t.me/mate_bot_open/9257');

    await telegramService.sendMessage(
      chatId,
      `Если хочешь не просто понять прогноз, а <b>реально прожить 2026 в росте</b>, это делается через среду и этапы.\n\n` +
      `В клубе <b>«КОД УСПЕХА»</b> мы переводим прогноз в действия, состояние — в доход, а потенциал — в результат.\n\n` +
      `Забирай гайд и заходи в поле ☝️`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in topic_money_2026 callback');
  }
});

bot.callbackQuery('topic_income', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

    // Schedule payment_reminder (MSG 8) in 60 minutes after topic
    await schedulerService.schedule(
      {
        type: 'payment_reminder',
        userId,
        chatId,
      },
      60 * 60 * 1000 // 60 minutes
    );

    // ТОПИК 2 - Сообщение 1 с картинкой 9355
    await telegramService.sendPhoto(
      chatId,
      'https://t.me/mate_bot_open/9355',
      {
        caption:
          `Если деньги не растут —\n` +
          `причина чаще не в знаниях, а в состоянии и сценариях.\n\n` +
          `В гайде ты увидишь:\n` +
          `— где именно ты застряла\n` +
          `— какие установки тормозят доход\n` +
          `— какой шаг сейчас даст рост`,
        parse_mode: 'HTML'
      }
    );

    await telegramService.sendDocument(chatId, 'https://t.me/mate_bot_open/9258');

    await telegramService.sendMessage(
      chatId,
      `А если хочешь не просто понять причину, а <b>реально выйти из финансового тупика</b>, это делается через этапы и среду.\n\n` +
      `В клубе <b>«КОД УСПЕХА»</b> мы переводим осознание\nв действия, действия — в результат, а результат — в стабильный доход.\n\n` +
      `Забирай гайд и заходи в поле ☝️`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in topic_income callback');
  }
});

bot.callbackQuery('topic_state', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

    // Schedule payment_reminder (MSG 8) in 60 minutes after topic
    await schedulerService.schedule(
      {
        type: 'payment_reminder',
        userId,
        chatId,
      },
      60 * 60 * 1000 // 60 minutes
    );

    // ТОПИК 3 - Сообщение 1 с картинкой 9353
    await telegramService.sendPhoto(
      chatId,
      'https://t.me/mate_bot_open/9353',
      {
        caption:
          `Если состояние не держит — деньги не удерживаются.\n\n` +
          `В гайде ты увидишь:\n` +
          `— где у тебя утекает энергия\n` +
          `— через что к тебе приходят деньги\n` +
          `— персональную расшифровку по дате рождения\n\n` +
          `А если хочешь не просто понять,\n` +
          `а реально выстроить доход —\n` +
          `дальше это делается через среду и этапы.`,
        parse_mode: 'HTML'
      }
    );

    await telegramService.sendDocument(chatId, 'https://t.me/mate_bot_open/9259');

    await telegramService.sendMessage(
      chatId,
      `В клубе <b>«КОД УСПЕХА»</b> мы переводим состояние в действия,\nа действия — в деньги.\n\n` +
      `Забирай гайд и заходи в поле ☝️`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in topic_state callback');
  }
});

bot.callbackQuery('topic_environment', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

    // Schedule payment_reminder (MSG 8) in 60 minutes after topic
    await schedulerService.schedule(
      {
        type: 'payment_reminder',
        userId,
        chatId,
      },
      60 * 60 * 1000 // 60 minutes
    );

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
      `поддерживают и идут к своим целям, а не обсуждают чужие.\n\n` +
      `«Я сделала то, что откладывала месяцами».\n` +
      `«Доход сдвинулся, потому что я перестала быть в одиночке».\n\n` +
      `✨ Это не магия.\n` +
      `Это <b>сила среды</b>, которая работает всегда.\n` +
      `Недаром говорят: <i>ты — среднее из тех, кто рядом с тобой.</i>\n\n` +
      `В клубе <b>«КОД УСПЕХА»</b> — тысячи участников по всей стране.\n` +
      `🌍 Сообщество в <b>60+ городах</b>, живые встречи, десятки.\n` +
      `🤝 Поддержка, обмен опытом и рост через поле.\n\n` +
      `Ты попадаешь в среду, где: действуют, растут, фиксируют результат\n\n` +
      `👉 Подключайся.\n` +
      `Когда ты не один —\n` +
      `двигаться к деньгам и целям становится проще.`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in topic_environment callback');
  }
});

// 🆕 Post-payment onboarding - ГОТОВО button
bot.callbackQuery('onboarding_ready', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await funnels.completeOnboarding(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in onboarding_ready callback');
  }
});

// 🆕 Gift subscription - initiate flow
bot.callbackQuery('gift_subscription', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (!user) return;

    // Set user state to selecting gift user
    await db.update(users).set({ onboardingStep: 'selecting_gift_user' }).where(eq(users.id, user.id));

    // Send message with KeyboardButtonRequestUsers
    await ctx.reply(
      'Выберите друга из списка ниже, которому хотите подарить подписку 👇',
      {
        reply_markup: {
          keyboard: [[{
            text: '➡️ Нажмите, чтобы выбрать друга ⬅️',
            request_users: {
              request_id: 1,
              user_is_bot: false,
              max_quantity: 1
            }
          }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in gift_subscription callback');
  }
});

// 🆕 Gift activation - start
bot.callbackQuery('gift_start', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;
    const token = data.split('_')[2]; // gift_start_{token}

    if (token) {
      await funnels.handleGiftActivation(ctx.from.id, token, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in gift_start callback');
  }
});

// 🆕 Gift activation - continue (показать форму оплаты продления)
bot.callbackQuery('gift_continue', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    await funnels.showGiftContinuePayment(ctx.from.id, ctx.chat.id);
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in gift_continue callback');
  }
});

// ============================================================================
// 🆕 CLUB FUNNEL CALLBACKS (Numerology-based pre-payment funnel)
// ============================================================================

// Club funnel - "Готов(а)" button
bot.callbackQuery('club_ready', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleClubReady(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_ready callback');
  }
});

// Club funnel - Birthdate confirmation YES
bot.callbackQuery(/^club_confirm_date_yes_/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;
    const birthDate = data.replace('club_confirm_date_yes_', '');
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user && birthDate) {
      await clubFunnel.handleBirthDateConfirmed(user.id, ctx.chat.id, birthDate);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_confirm_date_yes callback');
  }
});

// Club funnel - Birthdate confirmation NO
bot.callbackQuery('club_confirm_date_no', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleBirthDateRejected(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_confirm_date_no callback');
  }
});

// Club funnel - "Активировать потенциал" button
bot.callbackQuery('club_activate', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleClubActivate(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_activate callback');
  }
});

// Club funnel - "Получить расшифровку стиля" button
bot.callbackQuery('club_get_style', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleClubGetStyle(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_get_style callback');
  }
});

// Club funnel - "Где мой масштаб" button
bot.callbackQuery('club_get_scale', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleClubGetScale(user.id, ctx.chat.id, ctx.from.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_get_scale callback');
  }
});

// Club funnel - "Я подписалась" button
bot.callbackQuery('club_check_subscription', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleClubCheckSubscription(user.id, ctx.chat.id, ctx.from.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_check_subscription callback');
  }
});

// Club funnel - "Узнать свою точку роста" button
bot.callbackQuery('club_get_roadmap', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleClubGetRoadmap(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_get_roadmap callback');
  }
});

// Club funnel - "Начать маршрут" button
bot.callbackQuery('club_start_route', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleClubStartRoute(user.id, ctx.chat.id, user);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_start_route callback');
  }
});

// 🆕 Menu - back button
bot.callbackQuery('menu_back', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    await funnels.sendMenuMessage(ctx.chat.id);
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in menu_back callback');
  }
});

// 🆕 Menu - instruction video
bot.callbackQuery('menu_instruction', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const keyboard = new InlineKeyboard()
      .text('вернуться в меню', 'menu_back');

    await telegramService.sendMessage(
      ctx.chat.id,
      'Внимательно посмотри видео-инструкцию по экосистеме клуба, чтобы ты не потерялась и во всём разобралась ✨',
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in menu_instruction callback');
  }
});

// 🆕 Menu - gift subscription
bot.callbackQuery('menu_gift_subscription', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (!user) return;

    // Set user state to selecting gift user
    await db.update(users).set({ onboardingStep: 'selecting_gift_user' }).where(eq(users.id, user.id));

    // Send message with KeyboardButtonRequestUsers
    await ctx.reply(
      'Выберите друга из списка ниже, чтобы подарить ему доступ к клубу 👇',
      {
        reply_markup: {
          keyboard: [[{
            text: '➡️ Нажмите, чтобы выбрать друга ⬅️',
            request_users: {
              request_id: 1,
              user_is_bot: false,
              max_quantity: 1
            }
          }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in menu_gift_subscription callback');
  }
});

// Handle topic selection buttons (old reply keyboard - keep for backward compatibility)
bot.hears('🔮 где мои деньги в 2026 году', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

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
      `В клубе <b>«КОД УСПЕХА»</b> мы переводим прогноз в действия, состояние — в доход, а потенциал — в результат.\n\n` +
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
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

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
      `В клубе <b>«КОД УСПЕХА»</b> мы переводим осознание\nв действия, действия — в результат, а результат — в стабильный доход.\n\n` +
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
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

    await telegramService.sendMessage(
      chatId,
      `Если состояние не держит — деньги не удерживаются.\n\n` +
      `В гайде ты увидишь:\n` +
      `— где у тебя утекает энергия\n` +
      `— через что к тебе приходят деньги\n` +
      `— персональную расшифровку <b>по дате рождения</b>\n\n` +
      `А если хочешь не просто понять,\n` +
      `а <b>реально выстроить доход</b> —\n` +
      `дальше это делается через среду и этапы.`,
      { parse_mode: 'HTML' }
    );

    await telegramService.sendDocument(chatId, 'https://t.me/mate_bot_open/9259');

    await telegramService.sendMessage(
      chatId,
      `В клубе <b>«КОД УСПЕХА»</b> мы переводим состояние в действия,\nа действия — в деньги.\n\n` +
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
      .webApp('Оформить подписку ❤️', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

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
      `поддерживают и идут к своим целям, а не обсуждают чужие.\n\n` +
      `«Я сделала то, что откладывала месяцами».\n` +
      `«Доход сдвинулся, потому что я перестала быть в одиночке».\n\n` +
      `✨ Это не магия.\n` +
      `Это <b>сила среды</b>, которая работает всегда.\n` +
      `Недаром говорят: <i>ты — среднее из тех, кто рядом с тобой.</i>\n\n` +
      `В клубе <b>«КОД УСПЕХА»</b> — тысячи участников по всей стране.\n` +
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

// 🆕 /menu command - show post-onboarding menu
bot.command('menu', async (ctx) => {
  try {
    await funnels.sendMenuMessage(ctx.chat.id);
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /menu command');
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

// 🆕 Message handler - keyword "УСПЕХ" validation + Club funnel birthdate input
bot.on('message:text', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const rawText = ctx.message.text?.trim() || '';
    // Normalize text for keyword validation (trim whitespace, uppercase)
    const text = rawText.toUpperCase();
    const user = await funnels.getUserByTgId(userId);

    if (user?.onboardingStep === 'awaiting_keyword' && text === 'УСПЕХ') {
      await funnels.handleKeywordSuccess(user.id, ctx.chat.id);
      return;
    }

    // 🆕 Check if user is in club funnel awaiting birthdate
    if (user) {
      const [progress] = await db
        .select()
        .from(clubFunnelProgress)
        .where(eq(clubFunnelProgress.userId, user.id))
        .limit(1);

      if (progress?.currentStep === 'awaiting_birthdate') {
        await clubFunnel.handleBirthDateInput(user.id, ctx.chat.id, rawText);
        return;
      }
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in message:text handler');
  }
});

// 🆕 Message handler - users_shared for gift selection
bot.on('message:users_shared', async (ctx) => {
  try {
    const gifterTgId = ctx.from.id;
    const sharedUsers = ctx.message.users_shared;

    if (!sharedUsers || sharedUsers.users.length === 0) {
      return;
    }

    const recipientTgId = sharedUsers.users[0].user_id;

    // Check if user is in selecting_gift_user state
    const gifter = await funnels.getUserByTgId(gifterTgId);
    if (gifter?.onboardingStep === 'selecting_gift_user') {
      await funnels.handleUserShared(gifterTgId, recipientTgId, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in message:users_shared handler');
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
      // 🔒 SECURITY: Verify webhook secret (REQUIRED in production)
      if (config.NODE_ENV === 'production' && !config.TELEGRAM_WEBHOOK_SECRET) {
        logger.error('🔴 CRITICAL: TELEGRAM_WEBHOOK_SECRET not set in production!');
        set.status = 500;
        return { ok: false, error: 'Server configuration error' };
      }

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
          allowed_updates: ['message', 'callback_query', 'inline_query', 'users_shared'],
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
  )
  // Reset onboarding step for testing
  .post(
    '/reset-onboarding',
    async ({ body, set }) => {
      try {
        const { telegram_id } = body;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.telegramId, telegram_id))
          .limit(1);

        if (!user) {
          set.status = 404;
          return {
            success: false,
            error: 'User not found',
          };
        }

        // Reset onboarding step
        await db
          .update(users)
          .set({ onboardingStep: 'awaiting_keyword' })
          .where(eq(users.telegramId, telegram_id));

        logger.info({ telegram_id, userId: user.id }, 'Onboarding step reset to awaiting_keyword');

        return {
          success: true,
          message: 'Onboarding step reset successfully',
          telegram_id,
          new_step: 'awaiting_keyword',
        };
      } catch (error) {
        logger.error({ error }, 'Failed to reset onboarding step');
        set.status = 500;
        return {
          success: false,
          error: 'Failed to reset onboarding step',
        };
      }
    },
    {
      body: t.Object({
        telegram_id: t.String(),
      }),
      detail: {
        summary: 'Reset user onboarding step',
        description: 'Resets user onboarding_step to awaiting_keyword for testing',
      },
    }
  );
