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
import { subscriptionGuardService } from '@/services/subscription-guard.service';
// 🆕 Post-payment funnels
import * as funnels from './post-payment-funnels';
// 🆕 Club funnel (numerology-based pre-payment funnel)
import * as clubFunnel from './club-funnel';

// Initialize bot
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Initialize bot info (required for webhooks)
await bot.init();

// Remove global menu commands (will be set individually per user after payment)
await bot.api.setMyCommands([]);

// Initialize Telegram service
const telegramService = new TelegramService(bot.api);

// Initialize telegram service for funnels
funnels.initTelegramService(bot.api);
// Initialize telegram service for club funnel
clubFunnel.initClubFunnelTelegramService(bot.api);
// Initialize subscription guard service
subscriptionGuardService.init(bot.api);

// Helper to check payment status
async function checkPaymentStatus(userId: number): Promise<boolean> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, userId))
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

// ============================================================================
// UTM PARSING - Парсинг UTM меток из deep link
// Формат: {source}_{medium}_{campaign}_{content}_{term}
// Пример: tgchannel_kris_january_promo → source=tgchannel, medium=kris, campaign=january, content=promo
// ============================================================================
interface UtmData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  raw_payload?: string;
}

function parseUtmFromPayload(payload: string | undefined): UtmData {
  if (!payload) return {};

  // Зарезервированные payload'ы - НЕ парсим как UTM
  const reservedPayloads = [
    'club', 'test_start_full', 'test_club_full', 'test'
  ];

  // Проверяем на зарезервированные префиксы
  if (payload.startsWith('present_') || payload.startsWith('gift_')) {
    return {};
  }

  // Проверяем на точные совпадения с зарезервированными
  if (reservedPayloads.includes(payload)) {
    return {};
  }

  // Парсим UTM метки: source_medium_campaign_content_term
  const parts = payload.split('_');

  const utmData: UtmData = {
    raw_payload: payload
  };

  if (parts.length >= 1 && parts[0]) utmData.utm_source = parts[0];
  if (parts.length >= 2 && parts[1]) utmData.utm_medium = parts[1];
  if (parts.length >= 3 && parts[2]) utmData.utm_campaign = parts[2];
  if (parts.length >= 4 && parts[3]) utmData.utm_content = parts[3];
  if (parts.length >= 5 && parts[4]) utmData.utm_term = parts[4];

  return utmData;
}

// Сохранение UTM в metadata пользователя
async function saveUtmToUser(telegramId: number, utmData: UtmData): Promise<void> {
  if (Object.keys(utmData).length === 0) return;

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (user) {
      const currentMetadata = (user.metadata as Record<string, unknown>) || {};

      // Сохраняем UTM только если их ещё нет (first touch attribution)
      if (!currentMetadata.utm_source) {
        const newMetadata = {
          ...currentMetadata,
          ...utmData,
          utm_saved_at: new Date().toISOString()
        };

        await db
          .update(users)
          .set({ metadata: newMetadata })
          .where(eq(users.telegramId, telegramId));

        logger.info({ telegramId, utmData }, 'UTM data saved to user metadata');
      } else {
        logger.info({ telegramId }, 'UTM already exists, skipping (first touch attribution)');
      }
    }
  } catch (error) {
    logger.error({ error, telegramId, utmData }, 'Failed to save UTM to user');
  }
}

// Получение UTM из metadata пользователя
async function getUtmFromUser(telegramId: number): Promise<UtmData> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (user && user.metadata) {
      const metadata = user.metadata as Record<string, unknown>;
      return {
        utm_source: metadata.utm_source as string | undefined,
        utm_medium: metadata.utm_medium as string | undefined,
        utm_campaign: metadata.utm_campaign as string | undefined,
        utm_content: metadata.utm_content as string | undefined,
        utm_term: metadata.utm_term as string | undefined,
        raw_payload: metadata.raw_payload as string | undefined,
      };
    }
  } catch (error) {
    logger.error({ error, telegramId }, 'Failed to get UTM from user');
  }
  return {};
}

// Добавление UTM к URL оплаты
function addUtmToPaymentUrl(baseUrl: string, utmData: UtmData): string {
  const url = new URL(baseUrl);

  if (utmData.utm_source) url.searchParams.set('utm_source', utmData.utm_source);
  if (utmData.utm_medium) url.searchParams.set('utm_medium', utmData.utm_medium);
  if (utmData.utm_campaign) url.searchParams.set('utm_campaign', utmData.utm_campaign);
  if (utmData.utm_content) url.searchParams.set('utm_content', utmData.utm_content);
  if (utmData.utm_term) url.searchParams.set('utm_term', utmData.utm_term);

  return url.toString();
}

// Task processor callback for scheduled tasks
async function processScheduledTask(task: ScheduledTask): Promise<void> {
  const { type, userId, chatId } = task;

  try {
    // Skip payment check for test tasks (test_start_reminder, test_five_min_reminder, etc.)
    // Also skip for club_auto_progress in test mode
    const isTestTask = type.startsWith('test_');
    const isClubTestMode = type === 'club_auto_progress' && task.data?.isTestMode === true;

    // Check if user already paid (skip for test tasks)
    if (!isTestTask && !isClubTestMode) {
      const paid = await checkPaymentStatus(userId);
      if (paid) {
        logger.info({ userId, taskType: type }, 'User already paid, cancelling all remaining tasks');
        // Cancel ALL remaining tasks for this user
        await schedulerService.cancelAllUserTasks(userId);
        return;
      }
    } else {
      logger.info({ userId, taskType: type, isTestMode: isTestTask || isClubTestMode }, 'Test mode - skipping payment check');
    }

    // 📊 Получаем UTM из metadata пользователя для добавления к URL оплаты
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl)
      .row()
      .text('Я не готов 🤔', 'not_ready_1');

    const simpleKeyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

    if (type === 'start_reminder') {
      // СООБЩЕНИЕ 2 - 120-second reminder (same as get_access flow)
      // This is sent if user didn't click "Получить доступ" button
      const msg2Keyboard = new InlineKeyboard()
        .webApp('Оплатить ❤️', paymentUrl);

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
        .webApp('попасть на марафон ❤️', paymentUrl);

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
        .webApp('Оформить подписку ❤️', paymentUrl)
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
      const { odUserId, step, isTestMode } = task.data || {};
      if (odUserId && chatId && step) {
        await clubFunnel.handleClubAutoProgress(odUserId, chatId, step, isTestMode);
      }
    }
    // 🧪 TEST: Ускоренная тестовая воронка /start (ПОЛНЫЕ тексты, ускоренные таймеры)
    else if (type === 'test_start_reminder') {
      // СООБЩЕНИЕ 2 - Тестовое напоминание (10 сек вместо 120)
      const msg2Keyboard = new InlineKeyboard()
        .webApp('Оплатить ❤️', paymentUrl);

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

      // СООБЩЕНИЕ 3 - Марафон КОД ДЕНЕГ
      const marathonKeyboard = new InlineKeyboard()
        .webApp('попасть на марафон ❤️', paymentUrl);

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

      // Следующее сообщение через 15 сек
      await schedulerService.schedule(
        { type: 'test_numerology_guide', userId, chatId },
        15 * 1000
      );
    }
    else if (type === 'test_numerology_guide') {
      // СООБЩЕНИЕ 4 - Нумерологический гайд
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

      // 3 ловушки через 15 сек
      await schedulerService.schedule(
        { type: 'test_traps', userId, chatId },
        15 * 1000
      );
    }
    else if (type === 'test_traps') {
      // СООБЩЕНИЕ 5 - 3 главные ловушки
      const trapsKeyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', paymentUrl);

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
          reply_markup: trapsKeyboard
        }
      );

      // "Что горит" через 15 сек
      await schedulerService.schedule(
        { type: 'test_burning', userId, chatId },
        15 * 1000
      );
    }
    else if (type === 'test_burning') {
      // СООБЩЕНИЕ 6 - Что горит прямо сейчас?
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

      // Планируем test_day2 через 10 секунд
      await schedulerService.schedule(
        { type: 'test_day2', userId, chatId },
        10 * 1000
      );
    }
    else if (type === 'test_day2') {
      // СООБЩЕНИЕ 9 - Day 2
      const day2Keyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', paymentUrl);

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
          reply_markup: day2Keyboard
        }
      );

      // Планируем test_day3 через 10 секунд
      await schedulerService.schedule(
        { type: 'test_day3', userId, chatId },
        10 * 1000
      );
    }
    else if (type === 'test_day3') {
      // СООБЩЕНИЕ 10 - Day 3
      const day3Keyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', paymentUrl);

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
          reply_markup: day3Keyboard
        }
      );

      // Планируем test_day4 через 10 секунд
      await schedulerService.schedule(
        { type: 'test_day4', userId, chatId },
        10 * 1000
      );
    }
    else if (type === 'test_day4') {
      // СООБЩЕНИЕ 11 - Day 4
      const day4Keyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', paymentUrl);

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
          reply_markup: day4Keyboard
        }
      );

      // Планируем test_day5 через 10 секунд
      await schedulerService.schedule(
        { type: 'test_day5', userId, chatId },
        10 * 1000
      );
    }
    else if (type === 'test_day5') {
      // СООБЩЕНИЕ 12 - Day 5 Final
      const day5Keyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', paymentUrl);

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
          parse_mode: 'HTML',
          reply_markup: day5Keyboard
        }
      );

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

    // 🆕 Check for gift activation link (start=present_{recipient_tg_id})
    const startPayload = ctx.match;

    // 📊 Парсим и сохраняем UTM метки из deep link (first touch attribution)
    const utmData = parseUtmFromPayload(startPayload);
    if (Object.keys(utmData).length > 0) {
      await saveUtmToUser(userId, utmData);
      logger.info({ userId, utmData }, 'UTM parsed from start payload');
    }

    if (startPayload && startPayload.startsWith('present_')) {
      const recipientTgId = parseInt(startPayload.substring(8)); // Remove 'present_' prefix
      if (recipientTgId === userId) {
        // Получатель перешел по своей ссылке - активируем подарок
        await funnels.activateGiftSubscription(userId, chatId);
      } else {
        // Кто-то другой перешел по ссылке
        await ctx.reply('❌ Эта ссылка предназначена для другого пользователя.');
      }
      return;
    }

    // Legacy: Check for old gift activation link (start=gift_{token})
    if (startPayload && startPayload.startsWith('gift_')) {
      const token = startPayload.substring(5); // Remove 'gift_' prefix
      await funnels.handleGiftActivation(userId, token, chatId);
      return;
    }

    // 🧪 Deep link для тестовой обычной воронки (start=test_start_full)
    // ВАЖНО: Проверяем ДО isPro, чтобы оплаченные пользователи тоже могли тестировать
    if (startPayload === 'test_start_full') {
      logger.info({ userId }, 'User testing FULL /start funnel via deep link');

      // Отменяем все предыдущие задачи
      await schedulerService.cancelAllUserTasks(userId);

      const keyboard = new InlineKeyboard()
        .text('Получить доступ', 'test_get_access_full');

      // Отправляем видео без подписи (Telegram ограничивает caption до 1024 символов)
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9676',
        {}
      );

      // Отправляем текст отдельным сообщением с кнопкой
      await telegramService.sendMessage(
        chatId,
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
        `<b>Дальше — либо по-старому.\n` +
        `Либо по-настоящему.</b>`,
        {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        }
      );

      // Schedule fast 10-second reminder
      await schedulerService.schedule(
        {
          type: 'test_start_reminder',
          userId,
          chatId,
        },
        10 * 1000
      );
      return;
    }

    // 🧪 Deep link для тестовой club воронки (start=test_club_full)
    // ВАЖНО: Проверяем ДО isPro, чтобы оплаченные пользователи тоже могли тестировать
    if (startPayload === 'test_club_full') {
      logger.info({ userId }, 'User testing FULL club funnel via deep link');

      // Get or create user in database
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, userId))
        .limit(1);

      let testUser = existingUser;
      if (!testUser) {
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: userId,
            username: ctx.from?.username || null,
            firstName: ctx.from?.first_name || null,
            lastName: ctx.from?.last_name || null,
          })
          .returning();
        testUser = newUser;
      }

      // Отменяем все предыдущие задачи
      await schedulerService.cancelAllUserTasks(userId);

      // Сбрасываем прогресс club воронки
      await db
        .delete(clubFunnelProgress)
        .where(eq(clubFunnelProgress.userId, testUser.id));

      // Запускаем club воронку с флагом тестового режима
      await clubFunnel.startClubFunnel(testUser.id, chatId, userId, true);
      return;
    }

    // 🔍 Check if user already exists and has paid FIRST (before any funnels)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, userId))
      .limit(1);

    // ✅ If user has PAID (isPro = true), return to current onboarding step
    // Don't redirect them to club funnel or sales funnel
    if (user && user.isPro) {
      logger.info({ userId, onboardingStep: user.onboardingStep }, 'Paid user /start - returning to onboarding step');

      // Этап 1: Ожидание кодового слова
      if (user.onboardingStep === 'awaiting_keyword') {
        await telegramService.sendVideo(
          chatId,
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
        return;
      }

      // Этап 2: Ожидание кнопки "готово" - показать приветственное сообщение
      if (user.onboardingStep === 'awaiting_ready') {
        // Повторно отправляем сообщение с 4 задачами
        const keyboard = new InlineKeyboard()
          .url('перейти в канал', 'https://t.me/+mwJ5e0d78GYzNDRi')
          .row()
          .webApp('вступить в чат города', `${process.env.WEBAPP_URL}?tab=chats`)
          .row()
          .webApp('открыть штаб', process.env.WEBAPP_URL!)
          .row()
          .url('приложение', 'http://qr.numschool-web.ru/')
          .row()
          .text('готово', 'onboarding_ready');

        await telegramService.sendPhoto(
          chatId,
          'https://t.me/mate_bot_open/9357',
          {
            caption:
              `<b>🗝 Ключ принят. Добро пожаловать домой, родная!</b>\n\n` +
              `Я горжусь тобой. Ты посмотрела видео, услышала меня и приняла наши правила. Теперь ты — часть нашего сообщества.\n\n` +
              `<b>ТВОИ ПЕРВЫЕ ШАГИ (СДЕЛАЙ ПРЯМО СЕЙЧАС):</b>\n\n` +
              `1️⃣ Канал клуба – это наше главное инфо-поле. Все анонсы, ссылки на эфиры и послания от меня будут здесь. 👉 Вступить и закрепить канал.\n\n` +
              `2️⃣ Твой город – найди свой город в списке. Там тебя уже ждут живые люди, с которыми ты скоро встретишься оффлайн. Напиши им: "Привет, я с вами!". 👉 Выбрать город.\n\n` +
              `3️⃣ Твой штаб-приложение, где хранится вся информация – нажми на кнопку приложения. Там уже открыт доступ к практикам. 👉 Открыть штаб.\n` +
              `4️⃣ Доступ к приложению ментального здоровья  👉 приложение\n\n` +
              `🛑 Не откладывай. Сделай эти три действия сейчас.\n\n` +
              `Как только вступишь во все чаты — жми кнопку ГОТОВО внизу.»`,
            parse_mode: 'HTML',
            reply_markup: keyboard
          }
        );
        return;
      }

      // Этап 3: Онбординг завершён - показать меню
      if (user.onboardingStep === 'onboarding_complete') {
        await funnels.sendMenuMessage(chatId);
        return;
      }

      // 🆕 Пользователь с подпиской, но БЕЗ онбординга (импортирован из старой базы)
      // Запускаем полную воронку, но после roadmap показываем "Ключ принят" вместо покупки
      if (!user.onboardingStep) {
        logger.info({ userId, telegramId: user.telegramId }, 'Imported user first activation - starting club funnel for imported');

        // Запускаем специальную воронку для импортированных пользователей
        await clubFunnel.startClubFunnelForImported(user.id, chatId, user.telegramId);
        return;
      }
    }

    // 🆕 Check for club funnel link (start=club or start=club_XXX) - only for non-paying users
    // Поддерживаемые форматы (utm_campaign utm_medium utm_source utm_content):
    // - club - без метки (utm_campaign=club)
    // - club_insta - utm_campaign=club, utm_medium=insta
    // - club_insta_shapka - utm_campaign=club, utm_medium=insta, utm_source=shapka
    // - club_insta_shapka_promo - utm_campaign=club, utm_medium=insta, utm_source=shapka, utm_content=promo
    if (startPayload === 'club' || startPayload?.startsWith('club_')) {
      // Парсим UTM из payload: club_MEDIUM_SOURCE_CONTENT
      let utmMedium: string | null = null;
      let utmSource: string | null = null;
      let utmContent: string | null = null;

      if (startPayload !== 'club') {
        const parts = startPayload.substring(5).split('_'); // убираем "club_" и разбиваем по "_"
        utmMedium = parts[0] || null; // первая часть = medium (insta, tgchannel, etc.)
        utmSource = parts[1] || null; // вторая часть = source (shapka, stories, etc.)
        utmContent = parts.slice(2).join('_') || null; // остальное = content
      }

      // Get or create user in database
      let clubUser = user; // Reuse user from above query
      if (!clubUser) {
        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: userId,
            username: ctx.from?.username || null,
            firstName: ctx.from?.first_name || null,
            lastName: ctx.from?.last_name || null,
          })
          .returning();
        clubUser = newUser;
      }

      // Сохраняем UTM-метки в metadata пользователя (только непустые)
      const currentMetadata = (clubUser.metadata as Record<string, unknown>) || {};
      const utmData: Record<string, string> = { utm_campaign: 'club' };
      if (utmMedium) utmData.utm_medium = utmMedium;
      if (utmSource) utmData.utm_source = utmSource;
      if (utmContent) utmData.utm_content = utmContent;

      await db
        .update(users)
        .set({
          metadata: {
            ...currentMetadata,
            ...utmData,
          },
        })
        .where(eq(users.telegramId, userId));

      logger.info({ userId, ...utmData }, 'Club funnel started with UTM');

      await clubFunnel.startClubFunnel(clubUser.id, chatId, userId);
      return;
    }

    // ❌ Если пользователь НЕ оплатил - запустить продажную воронку

    // 🆕 Парсинг UTM для start_XXX ссылок (start_MEDIUM_SOURCE_CONTENT)
    // Примеры: start_tiktok, start_insta_reels, start_insta_reels_promo
    if (startPayload?.startsWith('start_')) {
      let utmMedium: string | null = null;
      let utmSource: string | null = null;
      let utmContent: string | null = null;

      const parts = startPayload.substring(6).split('_'); // убираем "start_" и разбиваем по "_"
      utmMedium = parts[0] || null;
      utmSource = parts[1] || null;
      utmContent = parts.slice(2).join('_') || null;

      // Сохраняем UTM-метки в metadata пользователя
      const currentUser = user || await db.select().from(users).where(eq(users.telegramId, userId)).limit(1).then(r => r[0]);
      if (currentUser) {
        const currentMetadata = (currentUser.metadata as Record<string, unknown>) || {};
        const utmData: Record<string, string> = { utm_campaign: 'start' };
        if (utmMedium) utmData.utm_medium = utmMedium;
        if (utmSource) utmData.utm_source = utmSource;
        if (utmContent) utmData.utm_content = utmContent;

        await db
          .update(users)
          .set({
            metadata: {
              ...currentMetadata,
              ...utmData,
            },
          })
          .where(eq(users.telegramId, userId));

        logger.info({ userId, ...utmData }, 'Start funnel with UTM');
      }
    }

    // 🧹 Очистка всех запланированных задач при перезапуске /start (обычная + club воронка)
    // ⚡ Используем batch метод для эффективности
    await schedulerService.cancelUserTasksByTypes(userId, [
      'start_reminder',
      'five_min_reminder',
      'burning_question_reminder',
      'payment_reminder',
      'final_reminder',
      'day2_reminder',
      'day3_reminder',
      'day4_reminder',
      'day5_final',
      'club_auto_progress',
    ]);

    // Сбрасываем тестовый режим club воронки (если был включён)
    clubFunnel.setTestMode(false);

    logger.info({ userId }, 'Start command - cancelled all pending tasks from both funnels');

    const keyboard = new InlineKeyboard()
      .text('Получить доступ', 'get_access');

    // Send video first (without caption - Telegram limit is 1024 chars for captions)
    await telegramService.sendVideo(
      chatId,
      'https://t.me/mate_bot_open/9676',
      {}
    );

    // Then send text message with button separately
    await ctx.reply(
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
      `<b>Дальше — либо по-старому.\n` +
      `Либо по-настоящему.</b>`,
      {
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

    // 📊 Получаем UTM из metadata и добавляем к URL оплаты
    const utmData = await getUtmFromUser(userId);
    const webAppUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

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

// 🧪 TEST: Handle "Получить доступ" для тестовой воронки с ускоренными таймерами
bot.callbackQuery('test_get_access_full', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;

    // Cancel test reminder since user clicked
    await schedulerService.cancelUserTasksByType(userId, 'test_start_reminder');

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', paymentUrl);

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

    const marathonKeyboard = new InlineKeyboard()
      .webApp('попасть на марафон ❤️', paymentUrl);

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

    // Следующее сообщение через 15 сек (вместо 20 мин)
    await schedulerService.schedule(
      { type: 'test_numerology_guide', userId, chatId },
      15 * 1000
    );

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in test_get_access_full handler');
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

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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
      // 🛡️ Всегда отправляем в личку пользователю, а не в группу
      await clubFunnel.handleClubReady(user.id, ctx.from.id);
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
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleBirthDateConfirmed(user.id, ctx.from.id, birthDate);
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
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleBirthDateRejected(user.id, ctx.from.id);
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
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleClubActivate(user.id, ctx.from.id);
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
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleClubGetStyle(user.id, ctx.from.id);
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
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleClubGetScale(user.id, ctx.from.id, ctx.from.id);
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
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleClubCheckSubscription(user.id, ctx.from.id, ctx.from.id);
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
      // 🛡️ Всегда отправляем в личку пользователю
      // Для isPro пользователей показываем версию без покупки
      if (user.isPro) {
        await clubFunnel.handleClubGetRoadmapImported(user.id, ctx.from.id);
      } else {
        await clubFunnel.handleClubGetRoadmap(user.id, ctx.from.id);
      }
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
      // 🛡️ Всегда отправляем в личку пользователю
      // Для импортированных пользователей (isPro=true) показываем "Ключ принят"
      if (user.isPro) {
        await clubFunnel.handleClubStartRouteImported(user.id, ctx.from.id);
      } else {
        await clubFunnel.handleClubStartRoute(user.id, ctx.from.id, user);
      }
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_start_route callback');
  }
});

// 🆕 Club funnel for imported users - "Готов(а)" button
bot.callbackQuery('club_ready_imported', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleClubReady(user.id, ctx.from.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_ready_imported callback');
  }
});

// 🆕 Club funnel for imported users - "Начать маршрут" button -> "Ключ принят"
bot.callbackQuery('club_start_route_imported', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleClubStartRouteImported(user.id, ctx.from.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_start_route_imported callback');
  }
});

// Club funnel - "подробнее 🧐" button
bot.callbackQuery('club_more_info', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      // 🛡️ Всегда отправляем в личку пользователю
      await clubFunnel.handleClubMoreInfo(user.id, ctx.from.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in club_more_info callback');
  }
});

// 🆕 Menu - back button (only for paid users)
bot.callbackQuery('menu_back', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from.id;
    const hasPaid = await checkPaymentStatus(userId);

    if (!hasPaid) {
      await ctx.reply('Меню доступно только участникам клуба 🔒');
      return;
    }

    await funnels.sendMenuMessage(ctx.chat.id);
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in menu_back callback');
  }
});

// 🆕 Menu - instruction video (only for paid users)
bot.callbackQuery('menu_instruction', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from.id;
    const hasPaid = await checkPaymentStatus(userId);

    if (!hasPaid) {
      await ctx.reply('Инструкция доступна только участникам клуба 🔒');
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('вернуться в меню', 'menu_back');

    await telegramService.sendVideo(
      ctx.chat.id,
      'https://t.me/mate_bot_open/9641',
      {
        caption: 'Внимательно посмотри видео-инструкцию по экосистеме клуба, чтобы ты не потерялась и во всём разобралась ✨',
        reply_markup: keyboard,
        parse_mode: 'HTML',
      }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in menu_instruction callback');
  }
});

// 🆕 Menu - gift subscription (only for paid users)
bot.callbackQuery('menu_gift_subscription', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from.id;
    const hasPaid = await checkPaymentStatus(userId);

    if (!hasPaid) {
      await ctx.reply('Подарить подписку могут только участники клуба 🔒');
      return;
    }

    const user = await funnels.getUserByTgId(userId);
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
  // 🛡️ Игнорируем сообщения в групповых чатах (только личные сообщения)
  if (ctx.chat.type !== 'private') return;

  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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
  // 🛡️ Игнорируем сообщения в групповых чатах (только личные сообщения)
  if (ctx.chat.type !== 'private') return;

  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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
  // 🛡️ Игнорируем сообщения в групповых чатах (только личные сообщения)
  if (ctx.chat.type !== 'private') return;

  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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
  // 🛡️ Игнорируем сообщения в групповых чатах (только личные сообщения)
  if (ctx.chat.type !== 'private') return;

  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://hranitel.daniillepekhin.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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

// 🆕 /menu command - show post-onboarding menu (only for paid users)
bot.command('menu', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    // Check if user has active subscription
    const hasPaid = await checkPaymentStatus(userId);

    if (!hasPaid) {
      // User doesn't have subscription - redirect to payment funnel
      logger.info({ userId }, '/menu called by non-paid user, redirecting to payment');

      const keyboard = new InlineKeyboard()
        .text('Получить доступ', 'get_access');

      await telegramService.sendMessage(
        chatId,
        `<b>Меню доступно только участникам клуба 🔒</b>\n\n` +
        `Чтобы получить доступ к клубу «КОД УСПЕХА», нажми кнопку ниже 👇`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard
        }
      );
      return;
    }

    // User has subscription - show menu
    await funnels.sendMenuMessage(chatId);
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
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

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
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

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

// ============================================================================
// 🧪 ТЕСТОВЫЕ КОМАНДЫ ДЛЯ АДМИНОВ
// ============================================================================

// Список админов (telegram IDs)
const ADMIN_IDS = [
  288589382, // Даниил
  // Добавьте сюда другие ID админов
];

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(userId);
}

// /test_start - тестовый просмотр обычной воронки /start (как будто новый пользователь)
bot.command('test_start', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    if (!isAdmin(userId)) {
      await ctx.reply('❌ Эта команда доступна только админам.');
      return;
    }

    logger.info({ userId }, 'Admin testing /start funnel');

    const keyboard = new InlineKeyboard()
      .text('Получить доступ', 'get_access');

    await telegramService.sendMessage(
      chatId,
      '🧪 <b>ТЕСТОВЫЙ РЕЖИМ: Обычная воронка /start</b>\n\n' +
      '<i>Это тестовый просмотр воронки. Таймеры НЕ запускаются.</i>\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━',
      { parse_mode: 'HTML' }
    );

    // Send video first (without caption - Telegram limit is 1024 chars for captions)
    await telegramService.sendVideo(
      chatId,
      'https://t.me/mate_bot_open/9676',
      {}
    );

    // Then send text message with button separately
    await telegramService.sendMessage(
      chatId,
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
      `<b>Дальше — либо по-старому.\n` +
      `Либо по-настоящему.</b>`,
      {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

    await ctx.reply(
      '✅ Воронка /start отправлена.\n\n' +
      '📌 Нажми "Получить доступ" чтобы увидеть следующее сообщение (билет + марафон)'
    );

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /test_start command');
    await ctx.reply('❌ Ошибка при тестировании воронки');
  }
});

// /test_club - тестовый просмотр club воронки (нумерологическая воронка до оплаты)
bot.command('test_club', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    if (!isAdmin(userId)) {
      await ctx.reply('❌ Эта команда доступна только админам.');
      return;
    }

    logger.info({ userId }, 'Admin testing club funnel');

    // Получаем или создаем пользователя
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, userId))
      .limit(1);

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          telegramId: userId,
          username: ctx.from?.username || null,
          firstName: ctx.from?.first_name || null,
          lastName: ctx.from?.last_name || null,
        })
        .returning();
      user = newUser;
    }

    await telegramService.sendMessage(
      chatId,
      '🧪 <b>ТЕСТОВЫЙ РЕЖИМ: Club воронка (нумерология)</b>\n\n' +
      '<i>Это тестовый просмотр воронки до оплаты. Таймеры работают в обычном режиме.</i>\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━',
      { parse_mode: 'HTML' }
    );

    // Сбрасываем прогресс club воронки для чистого теста
    await db
      .delete(clubFunnelProgress)
      .where(eq(clubFunnelProgress.userId, user.id));

    // Запускаем club воронку
    await clubFunnel.startClubFunnel(user.id, chatId, String(userId));

    await ctx.reply(
      '✅ Club воронка запущена.\n\n' +
      '📌 Введи дату рождения в формате ДД.ММ.ГГГГ чтобы продолжить'
    );

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /test_club command');
    await ctx.reply('❌ Ошибка при тестировании club воронки');
  }
});

// /test_start_full - ПОЛНЫЙ тест обычной воронки с ускоренными таймерами (10 сек вместо часов)
bot.command('test_start_full', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    logger.info({ userId }, 'User testing FULL /start funnel with fast timers');

    // Отменяем все предыдущие задачи
    await schedulerService.cancelAllUserTasks(userId);

    const keyboard = new InlineKeyboard()
      .text('Получить доступ', 'test_get_access_full');

    // Send video first (without caption - Telegram limit is 1024 chars for captions)
    await telegramService.sendVideo(
      chatId,
      'https://t.me/mate_bot_open/9676',
      {}
    );

    // Then send text message with button separately
    await telegramService.sendMessage(
      chatId,
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
      `<b>Дальше — либо по-старому.\n` +
      `Либо по-настоящему.</b>`,
      {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

    // Schedule fast 10-second reminder (вместо 120 сек)
    await schedulerService.schedule(
      {
        type: 'test_start_reminder',
        userId,
        chatId,
      },
      10 * 1000 // 10 секунд
    );

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /test_start_full command');
    await ctx.reply('❌ Ошибка при тестировании воронки');
  }
});

// /test_club_full - ПОЛНЫЙ тест club воронки с ускоренными таймерами
bot.command('test_club_full', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    logger.info({ userId }, 'User testing FULL club funnel with fast timers');

    // Получаем или создаем пользователя
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, userId))
      .limit(1);

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          telegramId: userId,
          username: ctx.from?.username || null,
          firstName: ctx.from?.first_name || null,
          lastName: ctx.from?.last_name || null,
        })
        .returning();
      user = newUser;
    }

    // Отменяем все предыдущие задачи
    await schedulerService.cancelAllUserTasks(userId);

    // Сбрасываем прогресс club воронки
    await db
      .delete(clubFunnelProgress)
      .where(eq(clubFunnelProgress.userId, user.id));

    // Запускаем club воронку с флагом тестового режима
    await clubFunnel.startClubFunnel(user.id, chatId, String(userId), true); // true = test mode with fast timers

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /test_club_full command');
    await ctx.reply('❌ Ошибка при тестировании club воронки');
  }
});

// /admin - показать список тестовых команд
bot.command('admin', async (ctx) => {
  try {
    const userId = ctx.from!.id;

    if (!isAdmin(userId)) {
      await ctx.reply('❌ Эта команда доступна только админам.');
      return;
    }

    await ctx.reply(
      '🔧 <b>Админ-панель тестирования</b>\n\n' +
      '<b>Быстрый просмотр (без таймеров):</b>\n' +
      '/test_start - первое сообщение воронки /start\n' +
      '/test_club - первое сообщение club воронки\n\n' +
      '<b>Полный тест (ускоренные таймеры):</b>\n' +
      '/test_start_full - вся воронка /start (таймеры 10-35 сек)\n' +
      '/test_club_full - вся club воронка (таймеры 10-15 сек)\n\n' +
      '<b>Ссылки для реального теста:</b>\n' +
      '• Обычная: t.me/hranitelkodbot?start=test\n' +
      '• Club: t.me/hranitelkodbot?start=club\n\n' +
      '<i>⚠️ Тесты не влияют на ваш статус оплаты</i>',
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /admin command');
  }
});

// /getmyid - получить ID чата (не показывается в меню)
bot.command('getmyid', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const userId = ctx.from?.id;
    const chatType = ctx.chat.type;
    const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Личный чат';

    await ctx.reply(
      `📍 <b>Информация о чате</b>\n\n` +
      `<b>Chat ID:</b> <code>${chatId}</code>\n` +
      `<b>Тип:</b> ${chatType}\n` +
      `<b>Название:</b> ${chatTitle}\n` +
      `<b>Ваш User ID:</b> <code>${userId}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /getmyid command');
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

// 🆕 Message handler - keyword "КАРТА" validation + Club funnel birthdate input
bot.on('message:text', async (ctx) => {
  // 🛡️ Игнорируем сообщения в групповых чатах (только личные сообщения)
  if (ctx.chat.type !== 'private') {
    return;
  }

  try {
    const userId = ctx.from.id;
    const rawText = ctx.message.text?.trim() || '';
    // Normalize text for keyword validation (trim whitespace, uppercase)
    const text = rawText.toUpperCase();
    const user = await funnels.getUserByTgId(userId);

    // Проверка кодового слова "КАРТА"
    if (text === 'КАРТА' && user) {
      // Случай 1: Пользователь на этапе awaiting_keyword - стандартный флоу
      if (user.onboardingStep === 'awaiting_keyword') {
        await funnels.handleKeywordSuccess(user.id, ctx.chat.id);
        return;
      }

      // Случай 2: Мигрированный пользователь с isPro и onboarding_complete
      // Они уже оплатили, но не прошли онбординг с кодовым словом
      if (user.isPro && user.onboardingStep === 'onboarding_complete') {
        logger.info({ userId, telegramId: user.telegramId }, 'Migrated user entered keyword КАРТА, starting onboarding');
        await funnels.handleKeywordSuccess(user.id, ctx.chat.id);
        return;
      }
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

// 🛡️ Chat member update handler - проверка подписки при вступлении в канал/чаты
bot.on('chat_member', async (ctx) => {
  try {
    const update = ctx.chatMember;
    const chatId = update.chat.id;
    const userId = update.new_chat_member.user.id;
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;

    // Проверяем только случаи когда пользователь вступает (был не участником, стал участником)
    const wasNotMember = ['left', 'kicked', 'restricted'].includes(oldStatus) || oldStatus === undefined;
    const isMemberNow = ['member', 'administrator', 'creator'].includes(newStatus);

    if (wasNotMember && isMemberNow) {
      logger.info({ chatId, userId, oldStatus, newStatus }, 'User joining chat, checking subscription...');
      await subscriptionGuardService.handleJoinAttempt(chatId, userId);
    }
  } catch (error) {
    logger.error({ error }, 'Error in chat_member handler');
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
