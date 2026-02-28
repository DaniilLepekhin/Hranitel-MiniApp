import { Elysia, t } from 'elysia';
import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { config, getWebAppUrl } from '@/config';
import { logger } from '@/utils/logger';
import { webhookRateLimit } from '@/middlewares/rateLimit';
import { db, users, courses, courseProgress, meditations, clubFunnelProgress } from '@/db';
import { paymentAnalytics } from '@/db/schema';

// Утилита: null-безопасная очистка UTM значений (убирает строку 'null'/'undefined')
const safeUtm = (v: string | null | undefined): string | null =>
  (!v || v === 'null' || v === 'undefined') ? null : v;
// Строит metka из трёх составляющих: campaign_medium_source
const buildMetka = (c: string | null, m: string | null, s: string | null): string | null =>
  [c, m, s].filter(Boolean).join('_') || null;
import { eq, desc } from 'drizzle-orm';
import { gamificationService } from '@/modules/gamification/service';
import { schedulerService, type ScheduledTask } from '@/services/scheduler.service';
import { TelegramService } from '@/services/telegram.service';
import { stateService } from '@/services/state.service';
import { subscriptionGuardService } from '@/services/subscription-guard.service';
import { decadesService } from '@/services/decades.service';
import { hashtagParserService } from '@/services/hashtag-parser.service';
// 🆕 Post-payment funnels
import * as funnels from './post-payment-funnels';
// 🆕 Club funnel (numerology-based pre-payment funnel)
import * as clubFunnel from './club-funnel';
// 🆕 Women funnel (women empowerment pre-payment funnel)
import * as womenFunnel from './women-funnel';
// 🆕 Probudis funnel (awakening pre-payment funnel)
import * as probudisFunnel from './probudis-funnel';
// 🌸 March funnel (archetype quiz)
import * as marchFunnel from './march-funnel';

// Initialize bot
export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Initialize bot info (required for webhooks)
await bot.init();

// Remove global menu commands (will be set individually per user after payment)
await bot.api.setMyCommands([]);

// 🚫 MIDDLEWARE: Обработка сообщений из групповых чатов
// Воронки работают ТОЛЬКО в личных чатах с ботом
// В групповых чатах обрабатываем: команды, системные сообщения, хештеги для геймификации
bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (chatId && chatId < 0) {
    // 🔍 DEBUG: логируем ВСЕ входящие сообщения из групп (временно)
    const debugText = ctx.message?.text || ctx.message?.caption || '';
    if (debugText && /#/.test(debugText)) {
      logger.info(`[BOT_GROUP_DEBUG] chatId=${chatId}, from=${ctx.from?.id}, text="${debugText.substring(0, 100)}"`);
    }

    // Пропускаем команду /create_decade для групп
    const text = ctx.message?.text || '';
    if (text.startsWith('/create_decade')) {
      await next();
      return;
    }
    // Пропускаем системные сообщения (изменение названия чата и т.д.)
    if (ctx.message?.new_chat_title) {
      await next();
      return;
    }

    // 🔄 Автоматическое обнаружение миграции: если сообщение содержит migrate_to/from_chat_id
    if (ctx.message?.migrate_to_chat_id) {
      await next(); // Пропускаем в обработчик миграции
      return;
    }
    if (ctx.message?.migrate_from_chat_id) {
      await next(); // Пропускаем в обработчик миграции
      return;
    }

    // 🎮 ГЕЙМИФИКАЦИЯ: Парсим хештеги в сообщениях
    if (ctx.message && (ctx.message.text || ctx.message.caption)) {
      await hashtagParserService.processGroupMessage(ctx);
    }

    // Остальные сообщения игнорируем (не вызываем next)
    return;
  }
  await next();
});

// Initialize Telegram service
const telegramService = new TelegramService(bot.api);

// Initialize telegram service for funnels
funnels.initTelegramService(bot.api);
// Initialize telegram service for club funnel
clubFunnel.initClubFunnelTelegramService(bot.api);
// Initialize telegram service for women funnel
womenFunnel.initWomenFunnelTelegramService(bot.api);
// Initialize telegram service for probudis funnel
probudisFunnel.initProbudisFunnelTelegramService(bot.api);
// Initialize telegram service for march funnel
marchFunnel.initMarchFunnelTelegramService(bot.api);
// Initialize subscription guard service
subscriptionGuardService.init(bot.api);
// Initialize decades service
decadesService.init(bot.api);

// 🚫 Helper to check if chat is a group/channel (negative ID)
// Воронки работают только в личных чатах с ботом
function isGroupChat(chatId: number): boolean {
  return chatId < 0;
}

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
    'club', 'women', 'probudis', 'march', 'test_start_full', 'test_club_full', 'test_women_full', 'test_probudis_full', 'test_start', 'test_club', 'test_women', 'test_probudis', 'test'
  ];

  // Проверяем на зарезервированные префиксы
  if (payload.startsWith('present_') || payload.startsWith('gift_') || payload.startsWith('probudis_') || payload.startsWith('march_')) {
    return {};
  }

  // Проверяем на точные совпадения с зарезервированными
  if (reservedPayloads.includes(payload)) {
    return {};
  }

  // Парсим UTM метки: campaign_medium_source_content_term
  // Пример: club_tgchannel → campaign=club, medium=tgchannel
  //         club_insta_direct → campaign=club, medium=insta, source=direct
  const parts = payload.split('_');

  const utmData: UtmData = {
    raw_payload: payload
  };

  if (parts.length >= 1 && parts[0]) utmData.utm_campaign = parts[0];
  if (parts.length >= 2 && parts[1]) utmData.utm_medium = parts[1];
  if (parts.length >= 3 && parts[2]) utmData.utm_source = parts[2];
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

// Хелпер для построения payment URL из UTM данных scheduler task
function getPaymentUrlFromUtm(utmData?: Record<string, string>): string {
  let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
  if (utmData && Object.keys(utmData).length > 0) {
    const params = new URLSearchParams(utmData as Record<string, string>);
    paymentUrl = `${paymentUrl}?${params.toString()}`;
  }
  return paymentUrl;
}

// Task processor callback for scheduled tasks
async function processScheduledTask(task: ScheduledTask): Promise<void> {
  const { type, userId, chatId, data } = task;
  const isTestMode = data?.isTestMode === true;
  const testDelay = 10 * 1000; // 10 секунд для тестового режима

  // 🚫 Игнорируем групповые чаты и каналы (chatId < 0)
  if (isGroupChat(chatId)) {
    logger.info({ userId, chatId, taskType: type }, 'Ignoring scheduled task for group chat/channel');
    return;
  }

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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl)
      .row()
      .text('Я не готов 🤔', 'not_ready_1');

    const simpleKeyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

    if (type === 'start_reminder') {
      // СООБЩЕНИЕ 2 - 5-minute reminder - показываем билет с информацией о подписке
      const msg2Keyboard = new InlineKeyboard()
        .webApp('Оплатить ❤️', paymentUrl);

      await telegramService.sendPhoto(
        chatId,
        'https://t.me/mate_bot_open/9686',
        {
          caption:
            `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
            `<b>Информация о подписке на клуб:</b>\n\n` +
            `👉🏼 1 месяц = 2000 ₽\n` +
            `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: марафон КОД ДЕНЕГ, обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
            `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
            `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
            `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
            `Получить доступ в закрытый канал 👇🏼`,
          reply_markup: msg2Keyboard,
          parse_mode: 'HTML'
        }
      );

      // Mark user as awaiting payment
      await stateService.setState(userId, 'awaiting_payment');

      // Schedule следующее сообщение воронки через 5 минут (если не оплатил)
      await schedulerService.schedule(
        {
          type: 'start_marathon_5min',
          userId,
          chatId,
        },
        5 * 60 * 1000 // 5 minutes
      );
    } else if (type === 'start_marathon_5min') {
      // 🆕 START воронка: Отзывы участников марафона (через 5 минут после билета)
      const marathonKeyboard = new InlineKeyboard()
        .webApp('попасть на марафон ❤️', paymentUrl);

      // Отправляем 9 видео-отзывов участников альбомом (максимум 10 в одном альбоме)
      const videoMedia = [
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9713' },
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9714' },
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9715' },
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9716' },
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9717' },
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9718' },
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9719' },
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9720' },
        { type: 'video' as const, media: 'https://t.me/mate_bot_open/9721' },
      ];

      // Отправляем как альбом
      await telegramService.sendMediaGroup(chatId, videoMedia);

      // Отправляем текст с кнопкой
      await telegramService.sendMessage(
        chatId,
        `<b>ЭТО ЛЮДИ, КОТОРЫЕ ЗА 3 ДНЯ ВПЕРВЫЕ УВИДЕЛИ, ГДЕ У НИХ ДЕНЬГИ </b>\n\n` +
        `На марафоне они:\n` +
        `— <b>увидели</b> свою <b>денежную</b> механику\n` +
        `— поняли, что именно <b>мешает росту</b>\n` +
        `— сделали <b>первые действия</b> туда, где <b>есть результат</b>\n\n` +
        `И да — у многих первые деньги пришли уже в процессе.\n\n` +
        `<b>‼️ ЭТОТ МАРАФОН Я ПРОВОЖУ В ПЕРВЫЙ И ПОСЛЕДНИЙ РАЗ</b>\n\n` +
        `Это совершенно другой и новый формат.\n` +
        `30 дней работы.\n` +
        `3 дня подряд со мной в прямом эфире.\n\n` +
        `Даже если ты уже была раньше на моих марафонах —\n` +
        `<b>это не повтор .</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: marathonKeyboard
        }
      );

      // Через 5 минут - нумерологический гайд (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'numerology_guide_reminder',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
        },
        isTestMode ? testDelay : 5 * 60 * 1000
      );
    } else if (type === 'numerology_guide_reminder') {
      // Нумерологический гайд через 5 минут после марафона (если не оплатил)
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

      // Через 5 минут после гайда отправляем результаты участников (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'start_results_10min',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
        },
        isTestMode ? testDelay : 5 * 60 * 1000
      );
    } else if (type === 'start_results_10min') {
      // 🆕 Результаты участников марафона через 5 минут после гайда
      const resultsKeyboard = new InlineKeyboard()
        .webApp('💫 хочу на марафон', paymentUrl);

      // Отправляем видео без подписи
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/10041',
        {}
      );

      // Отправляем текст отдельным сообщением
      await telegramService.sendMessage(
        chatId,
        `<b>🔥 РЕЗУЛЬТАТЫ УЧАСТНИКОВ МАРАФОНА 🔥</b>\n\n` +
        `Можно дальше говорить:\n` +
        `«рынок сложный»,\n` +
        `«сейчас не время»,\n` +
        `«надо ещё поучиться».\n\n` +
        `А можно — собрать систему и начать зарабатывать.\n\n` +
        `<b>Вот что происходит за 30 дней:</b>\n\n` +
        `📍 Была: хаос в продажах, посты есть — оплат нет.\n` +
        `Сейчас: понятный продукт, ежедневные диалоги, первые стабильные оплаты.\n\n` +
        `📍 Была: страх назвать цену и ощущение «я навязываюсь».\n` +
        `Сейчас: спокойные предложения, чёткая структура диалога, закрытие без уговоров.\n\n` +
        `📍 Была: доход скачет от запуска к запуску.\n` +
        `Сейчас: выстроена система продаж, понятные цифры, прогнозируемый результат.\n\n` +
        `<b>❗ Никто не получает «волшебную кнопку».</b>\n` +
        `Они получают модель, которую можно повторять.\n\n` +
        `<b>На марафоне вы:</b>\n` +
        `🔓 Соберёте продукт, который действительно покупают\n` +
        `📊 Построите систему продаж на каждый день\n` +
        `🧠 Уберёте психологические блоки, которые режут доход\n` +
        `📈 Создадите контент, который ведёт к оплатам`,
        {
          parse_mode: 'HTML',
          reply_markup: resultsKeyboard
        }
      );

      // Через 5 минут - картинки 2026 (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'start_2026_images_15min',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
        },
        isTestMode ? testDelay : 5 * 60 * 1000
      );
    } else if (type === 'start_2026_images_15min') {
      // 🆕 Картинки 2026 через 5 минут после результатов
      const images2026Keyboard = new InlineKeyboard()
        .webApp('иду с вами 😍', paymentUrl);

      // Отправляем медиа-группу (6 картинок)
      await telegramService.sendMediaGroup(chatId, [
        { type: 'photo', media: 'https://t.me/mate_bot_open/10042' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10043' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10044' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10045' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10046' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10047' },
      ]);

      // Отправляем текст отдельным сообщением
      await telegramService.sendMessage(
        chatId,
        `<b>КАК СДЕЛАТЬ 2026 ГОД ЛУЧШИМ В ТВОЕЙ ЖИЗНИ? ✨\n` +
        `Ответ здесь.\n\n` +
        `что ты продаёшь • как продаёшь • сколько зарабатываешь 💰</b>\n\n` +
        `Именно для этого — <b>30-дневный марафон по запуску продукта и выстраиванию продаж.</b>\n\n` +
        `<b>Тебе сюда, если:</b>\n` +
        `— доход нестабильный\n` +
        `— есть— продажи идут «волнами»\n` +
        `— устала от хаоса и хочешь масштаб\n\n` +
        `<b>🔥 Что будет за 30 дней:\n` +
        `— соберём продукт, который покупают\n` +
        `— выстроим контент под продажи\n` +
        `— настроим диалоги и закрытие в оплату\n` +
        `— создадим ежедневную систему продаж\n` +
        `— пропишем стратегию под 2026 год\n\n` +
        `30 дней внутри закрытого клуба</b>\n` +
        `ежедневная работа\n` +
        `разборы\n` +
        `контроль\n` +
        `цифры\n\n` +
        `<b>🎯 В результате ты получишь:\n` +
        `— понятную модель продаж</b>\n` +
        `— стабильные диалоги\n` +
        `— первые или регулярные оплаты\n` +
        `— ощущение контроля над деньгами\n\n` +
        `Продажи открыты.\n\n` +
        `Если хочешь, чтобы <b>2026 стал годом системы и роста, заходи 🚀</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: images2026Keyboard
        }
      );

      // Через 10 минут - история Кристины (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'start_kristina_25min',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
        },
        isTestMode ? testDelay : 10 * 60 * 1000
      );
    } else if (type === 'start_kristina_25min') {
      // 🆕 История Кристины через 10 минут после картинок
      const kristinaKeyboard = new InlineKeyboard()
        .webApp('🌟 иду на марафон', paymentUrl);

      // Отправляем видео без подписи
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9679',
        {}
      );

      // Отправляем текст отдельным сообщением
      await telegramService.sendMessage(
        chatId,
        `<b>Путь от работы в МЧС с долгами к свободе и стабильности 🌟</b>\n\n` +
        `Расскажу историю Кристины, которая совмещала обучение цифровой психологии с основной работой — работой в МЧС. \n\n` +
        `✅ Точка А: \n` +
        `– 30 лет, работа за 27 500 ₽ \n` +
        `– Долги 1,5 млн ₽, сложные отношения, зависимость от мамы и алкоголя \n` +
        `– Не занималась собой, не могла сказать «нет»\n\n` +
        `✅Точка Б: \n` +
        `— Рассталась с токсичным мужчиной \n` +
        `— Занимается спортом, наладила отношения с родными \n` +
        `— Доход вырос до 1,7 млн ₽\n\n` +
        `<b>Запусти цепочку изменений в своей жизни и активируй свой код успеха на марафоне 🔽</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: kristinaKeyboard
        }
      );

      // Через 20 минут - 3 ловушки (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'five_min_reminder',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
        },
        isTestMode ? testDelay : 20 * 60 * 1000
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

      // Schedule 20-minute "Что горит" reminder (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'burning_question_reminder',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
        },
        isTestMode ? testDelay : 20 * 60 * 1000
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

      // Schedule 60-minute energy/Tatiana reminder (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'energy_tatiana_reminder',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
        },
        isTestMode ? testDelay : 60 * 60 * 1000
      );
    } else if (type === 'energy_tatiana_reminder') {
      // 🆕 СООБЩЕНИЕ: Видео об энергии (история Татьяны) - через 60 мин после топиков
      const energyKeyboard = new InlineKeyboard()
        .webApp('❤️ я с вами', paymentUrl);

      // Отправляем видео 9680
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9680',
        {}
      );

      // Отправляем текст отдельным сообщением
      await telegramService.sendMessage(
        chatId,
        `<b>НИ НА ЧТО НЕТ ЭНЕРГИИ‼️ Цели не зажигают! Знакомо? </b>\n\n` +
        `Вы принимаете БАДы, медитируете, но ничего не меняется. Причина в том, что вы не следуете своему пути. \n\n` +
        `Энергия есть у тех, кто реализует свой потенциал.\n\n` +
        `Так, моя ученица Татьяна после обучения на цифрового психолога:\n\n` +
        `✅ Вышла на доход 300к - 400к \n` +
        `✅ Оплатила путешествие с ребенком в Черногорию за 500к \n` +
        `✅ Начала проявляться в блоге\n\n` +
        `Кто хочет также? 😍\n\n` +
        `<b>Начни делать первые шаги к своему предназначению на марафоне ⬇️</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: energyKeyboard
        }
      );

      // Schedule payment_reminder через 60 минут (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'payment_reminder',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
        },
        isTestMode ? testDelay : 60 * 60 * 1000
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

      // Schedule day 2 reminder at 10:00 Moscow time (или 10 сек в тестовом режиме)
      const delayToDay2 = isTestMode ? testDelay : getDelayUntilMoscowTime(10, 0);
      await schedulerService.schedule(
        {
          type: 'day2_reminder',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
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
      const delayToDay3 = isTestMode ? testDelay : 25 * 60 * 60 * 1000; // 25 hours (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'day3_reminder',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
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
      const delayToDay4 = isTestMode ? testDelay : 24 * 60 * 60 * 1000; // 24 hours (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'day4_reminder',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
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
      const delayToDay5 = isTestMode ? testDelay : 24 * 60 * 60 * 1000; // 24 hours (или 10 сек в тестовом режиме)
      await schedulerService.schedule(
        {
          type: 'day5_final',
          userId,
          chatId,
          data: isTestMode ? { isTestMode: true } : undefined,
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
          parse_mode: 'HTML',
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
      const { odUserId, step, isTestMode, ignoreIsPro } = task.data || {};
      if (odUserId && chatId && step) {
        await clubFunnel.handleClubAutoProgress(odUserId, chatId, step, isTestMode, ignoreIsPro);
      }
    }
    // 🆕 Women funnel dogrev (20 minutes after first message)
    else if (type === 'women_dogrev_20m') {
      const utmData = task.data?.utmData || {};
      await womenFunnel.sendWomenDogrev(String(userId), chatId, utmData);

      // Через 5 минут - нумерологический гайд (или 1 минуту для теста)
      await schedulerService.schedule(
        {
          type: 'women_guide_5min',
          userId,
          chatId,
          data: { utmData },
        },
        5 * 60 * 1000 // 5 минут
      );
    }
    else if (type === 'women_guide_5min') {
      // Нумерологический гайд через 5 минут после марафона (если не оплатил)
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

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

      // Через 5 минут после гайда отправляем результаты участников (или 1 минуту для теста)
      await schedulerService.schedule(
        {
          type: 'women_results_10min',
          userId,
          chatId,
          data: { utmData },
        },
        5 * 60 * 1000 // 5 минут
      );
    }
    else if (type === 'women_results_10min') {
      // Результаты участников марафона через 5 минут после гайда
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

      const resultsKeyboard = new InlineKeyboard()
        .webApp('💫 хочу на марафон', paymentUrl);

      // Отправляем видео без подписи
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9677',
        {}
      );

      // Отправляем текст отдельным сообщением
      await telegramService.sendMessage(
        chatId,
        `<b>🔥 РЕЗУЛЬТАТЫ УЧАСТНИКОВ МАРАФОНА «КОД ДЕНЕГ» 🔥</b>\n\n` +
        `Ты можешь продолжать думать, что «это просто не твоё время»…А можешь — как эти девушки — зайти в свой код и изменить всё.\n\n` +
        `📍 <b>Была "проклятым ребёнком", которую не принимали в семье</b>— Через 3 недели после марафона: доход вырос в 2,5 раза, мама впервые за много лет поздравила с днём рождения и подарила подарок.\n\n` +
        `📍 <b>Осталась без работы, с тревогой, страхом и денежным потолком</b>— Сейчас: стабильный доход от 100.000 ₽, работает с удовольствием и спит спокойно.\n\n` +
        `📍 <b>Чувствовала себя "зажатой", лишний вес, страх перед деньгами</b>— Итог: минус 8 кг, новая энергия и доход 550.000 ₽\n\n` +
        `❗ Эти девушки не получили «волшебную таблетку». Они просто нашли себя.\n\n` +
        `На марафоне <b>«Код денег»</b> ты:\n` +
        `🔓 Расшифруешь, что мешает тебе расти\n` +
        `💎 Узнаешь, в чём твоя сила и путь\n` +
        `📈 Получишь личный план выхода на новый уровень\n\n` +
        `✨ Энергия. Деньги. Уважение. Спокойствие.\n` +
        `Всё начинается <b>с тебя и твоего кода 🔽</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: resultsKeyboard
        }
      );

      // Через 5 минут - картинки 2026 (или 1 минуту для теста)
      await schedulerService.schedule(
        {
          type: 'women_images_15min',
          userId,
          chatId,
          data: { utmData },
        },
        5 * 60 * 1000 // 5 минут
      );
    }
    else if (type === 'women_images_15min') {
      // Картинки 2026 через 5 минут после результатов
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

      const images2026Keyboard = new InlineKeyboard()
        .webApp('иду с вами 😍', paymentUrl);

      // Отправляем медиа-группу (6 картинок)
      await telegramService.sendMediaGroup(chatId, [
        { type: 'photo', media: 'https://t.me/mate_bot_open/9666' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9667' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9668' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9669' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9670' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9671' }
      ]);

      // Отправляем текст с кнопкой
      await telegramService.sendMessage(
        chatId,
        `<b>Вот так выглядит закрытый клуб внутри.</b>\n\n` +
        `Это не чат и не курс.\n` +
        `Это — <b>живая среда</b>, где ты перестаёшь быть одна.\n\n` +
        `<b>2026 год будет решающим.</b>\n` +
        `Ты либо войдёшь в свою силу.\n` +
        `Либо останешься там же, где сейчас.\n\n` +
        `Готова идти? 🔽`,
        {
          parse_mode: 'HTML',
          reply_markup: images2026Keyboard
        }
      );

      // Через 10 минут - история Кристины (или 1 минуту для теста)
      await schedulerService.schedule(
        {
          type: 'women_kristina_25min',
          userId,
          chatId,
          data: { utmData },
        },
        5 * 60 * 1000 // 5 минут
      );
    }
    else if (type === 'women_kristina_25min') {
      // История Кристины через 10 минут после картинок
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

      const kristinaKeyboard = new InlineKeyboard()
        .webApp('Хочу на марафон ❤️', paymentUrl);

      // Отправляем видео
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9655',
        {
          caption:
            `<b>Личная история Кристины Егиазаровой.</b>\n\n` +
            `Основательница самого большого клуба предназначения в России — рассказывает, как нашла свой путь.\n\n` +
            `Смотри и чувствуй, кто она на самом деле 🤍`,
          parse_mode: 'HTML',
          reply_markup: kristinaKeyboard
        }
      );

      // Через 5 минут - история успеха (МЧС) (или 1 минуту для теста)
      await schedulerService.schedule(
        {
          type: 'women_success_story',
          userId,
          chatId,
          data: { utmData },
        },
        5 * 60 * 1000 // 5 минут
      );
    }
    else if (type === 'women_success_story') {
      // История успеха (МЧС) через 5 минут после истории Кристины
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

      const successKeyboard = new InlineKeyboard()
        .webApp('Запустить изменения 🔥', paymentUrl);

      await telegramService.sendMessage(
        chatId,
        `<b>Путь от работы в МЧС с долгами к свободе и стабильности 🌟</b>\n\n` +
        `Расскажу историю Кристины, которая совмещала обучение цифровой психологии с основной работой — работой в МЧС.\n\n` +
        `✅ <b>Точка А:</b>\n` +
        `– 30 лет, работа за 27 500 ₽\n` +
        `– Долги 1,5 млн ₽, сложные отношения, зависимость от мамы и алкоголя\n` +
        `– Не занималась собой, не могла сказать «нет»\n\n` +
        `✅ <b>Точка Б:</b>\n` +
        `— Рассталась с токсичным мужчиной\n` +
        `— Занимается спортом, наладила отношения с родными\n` +
        `— Доход вырос до 1,7 млн ₽\n\n` +
        `Запусти цепочку изменений в своей жизни и активируй свой код успеха на марафоне КОД ДЕНЕГ 🔽`,
        {
          parse_mode: 'HTML',
          reply_markup: successKeyboard
        }
      );

      // Через 20 минут - 3 ловушки (или 1 минуту для теста)
      await schedulerService.schedule(
        {
          type: 'women_traps_20min',
          userId,
          chatId,
          data: { utmData },
        },
        5 * 60 * 1000 // 5 минут
      );
    }
    else if (type === 'women_traps_20min') {
      // 3 ловушки эксперта через 20 минут после истории успеха
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

      const trapsKeyboard = new InlineKeyboard()
        .webApp('Оформить подписку 🔥', paymentUrl);

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

      // Через 20 минут - горящие темы (или 1 минуту для теста)
      await schedulerService.schedule(
        {
          type: 'women_burning_topics',
          userId,
          chatId,
          data: { utmData },
        },
        5 * 60 * 1000 // 5 минут
      );
    }
    else if (type === 'women_burning_topics') {
      // Горящие темы - выбор проблемы
      const topicsKeyboard = new InlineKeyboard()
        .text('💸 Деньги и финансы', 'topic_money')
        .row()
        .text('💼 Работа и карьера', 'topic_career')
        .row()
        .text('❤️ Отношения', 'topic_relationships')
        .row()
        .text('🎯 Цель и смысл', 'topic_purpose')
        .row()
        .text('⚡️ Энергия и здоровье', 'topic_energy');

      await telegramService.sendMessage(
        chatId,
        `<b>Что горит прямо сейчас? 🔥</b>\n\n` +
        `Только честно.\n` +
        `Чтобы не грузить лишним — выбери, что сейчас важнее всего 👇`,
        {
          parse_mode: 'HTML',
          reply_markup: topicsKeyboard
        }
      );

      // Через 60 минут - видео об энергии (Татьяна)
      const utmData = task.data?.utmData || {};
      await schedulerService.schedule(
        {
          type: 'women_energy_tatiana',
          userId,
          chatId,
          data: { utmData },
        },
        60 * 60 * 1000 // 60 минут
      );
    }
    else if (type === 'women_energy_tatiana') {
      // Видео об энергии (история Татьяны) через 60 минут после топиков
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

      const energyKeyboard = new InlineKeyboard()
        .webApp('❤️ я с вами', paymentUrl);

      // Отправляем видео 9680
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9680',
        {}
      );

      // Отправляем текст отдельным сообщением
      await telegramService.sendMessage(
        chatId,
        `<b>НИ НА ЧТО НЕТ ЭНЕРГИИ‼️ Цели не зажигают! Знакомо?</b>\n\n` +
        `Татьяна тоже через это прошла: работала менеджером по закупкам, чувствовала себя загнанной белкой в колесе. А сейчас сама нанимает людей себе в команду.\n\n` +
        `Свобода — это не просто состояние. Это — результат пути, который начался с одного решения: больше не быть в этом одной.\n\n` +
        `И ты тоже не одна. Мы рядом. ❤️\n\n` +
        `Пройди свой путь не из одиночества, а в поле.\n` +
        `Нажми на кнопку и зайди в клуб 👇`,
        {
          parse_mode: 'HTML',
          reply_markup: energyKeyboard
        }
      );

      // Через 60 минут - payment reminder
      await schedulerService.schedule(
        {
          type: 'women_payment_reminder',
          userId,
          chatId,
          data: { utmData },
        },
        60 * 60 * 1000 // 60 минут
      );
    }
    else if (type === 'women_payment_reminder') {
      // "Это не просто клуб" через 60 минут после видео Татьяны
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

      const paymentKeyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', paymentUrl)
        .row()
        .text('я не готов 🤔', 'not_ready_3');

      // Send video first
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9348'
      );

      // Send text as separate message
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
          reply_markup: paymentKeyboard
        }
      );

      // Планируем день 2 на следующий день в 10:00 МСК
      const delayToDay2 = getDelayUntilMoscowTime(10, 0);
      await schedulerService.schedule(
        {
          type: 'women_day2_reminder',
          userId,
          chatId,
          data: { utmData },
        },
        delayToDay2
      );
    }
    else if (type === 'women_day2_reminder') {
      // День 2 - 10:00 Moscow time
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

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

      // Планируем день 3 через 25 часов в 11:00 МСК
      await schedulerService.schedule(
        {
          type: 'women_day3_reminder',
          userId,
          chatId,
          data: { utmData },
        },
        25 * 60 * 60 * 1000 // 25 часов
      );
    }
    else if (type === 'women_day3_reminder') {
      // День 3 - 11:00 Moscow time
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

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

      // Планируем день 4 через 24 часа в 11:00 МСК
      await schedulerService.schedule(
        {
          type: 'women_day4_reminder',
          userId,
          chatId,
          data: { utmData },
        },
        24 * 60 * 60 * 1000 // 24 часа
      );
    }
    else if (type === 'women_day4_reminder') {
      // День 4 - 11:00 Moscow time
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

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

      // Планируем день 5 (финальное) через 24 часа в 11:00 МСК
      await schedulerService.schedule(
        {
          type: 'women_day5_final',
          userId,
          chatId,
          data: { utmData },
        },
        24 * 60 * 60 * 1000 // 24 часа
      );
    }
    else if (type === 'women_day5_final') {
      // День 5 - 11:00 Moscow time - Final reminder
      const utmData = task.data?.utmData || {};
      let paymentUrl = 'https://app.successkod.com/payment_form_club.html';
      if (utmData && Object.keys(utmData).length > 0) {
        const params = new URLSearchParams(utmData as Record<string, string>);
        paymentUrl = `${paymentUrl}?${params.toString()}`;
      }

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
    // =====================================================================
    // 🌅 PROBUDIS FUNNEL - полная цепочка
    // Последовательность: билет → КОД ДЕНЕГ → гайд → результаты → 
    // картинки 2026 → МЧС → 3 ловушки → горящие темы → Татьяна → 
    // "не просто клуб" → day2 → day3 → day4 → day5
    // =====================================================================
    // ШАГ 2: Билет (через 5 мин после первого сообщения ИЛИ по кнопке)
    else if (type === 'probudis_dogrev_5m') {
      const { utmData, isTestMode } = task.data || {};
      await probudisFunnel.sendProbudisDogrev(String(userId), chatId, utmData, isTestMode);
    }
    // ШАГ 3: КОД ДЕНЕГ видео-отзывы (через 5 мин после билета)
    else if (type === 'probudis_success_stories') {
      const { utmData, isTestMode } = task.data || {};
      await probudisFunnel.sendProbudisSuccessStories(String(userId), chatId, utmData, isTestMode);
    }
    // ШАГ 4: Нумерологический гайд (через 5 мин)
    else if (type === 'probudis_guide') {
      const { utmData, isTestMode } = task.data || {};
      const guideKeyboard = new InlineKeyboard()
        .url('Скачать гайд ❤️', 'https://t.me/kristina_egiazarova_bot?start=leadmagnit180126');

      await telegramService.sendPhoto(chatId, 'https://t.me/mate_bot_open/9370', {
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
      });

      // → через 5 мин: результаты участников
      const timeout = isTestMode ? 10 * 1000 : 5 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_results', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // ШАГ 5: Результаты участников марафона (через 5 мин)
    else if (type === 'probudis_results') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const resultsKeyboard = new InlineKeyboard().webApp('💫 хочу на марафон', paymentUrl);

      await telegramService.sendVideo(chatId, 'https://t.me/mate_bot_open/9677', {});
      await telegramService.sendMessage(chatId,
        `<b>🔥 РЕЗУЛЬТАТЫ УЧАСТНИКОВ МАРАФОНА «КОД ДЕНЕГ» 🔥</b>\n\n` +
        `Ты можешь продолжать думать, что «это просто не твоё время»…А можешь — как эти девушки — зайти в свой код и изменить всё.\n\n` +
        `📍 <b>Была "проклятым ребёнком", которую не принимали в семье</b>— Через 3 недели после марафона: доход вырос в 2,5 раза, мама впервые за много лет поздравила с днём рождения и подарила подарок.\n\n` +
        `📍 <b>Осталась без работы, с тревогой, страхом и денежным потолком</b>— Сейчас: стабильный доход от 100.000 ₽, работает с удовольствием и спит спокойно.\n\n` +
        `📍 <b>Чувствовала себя "зажатой", лишний вес, страх перед деньгами</b>— Итог: минус 8 кг, новая энергия и доход 550.000 ₽\n\n` +
        `❗ Эти девушки не получили «волшебную таблетку». Они просто нашли себя.\n\n` +
        `На марафоне <b>«Код денег»</b> ты:\n` +
        `🔓 Расшифруешь, что мешает тебе расти\n` +
        `💎 Узнаешь, в чём твоя сила и путь\n` +
        `📈 Получишь личный план выхода на новый уровень\n\n` +
        `✨ Энергия. Деньги. Уважение. Спокойствие.\n` +
        `Всё начинается <b>с тебя и твоего кода 🔽</b>`,
        { parse_mode: 'HTML', reply_markup: resultsKeyboard }
      );

      // → через 5 мин: картинки клуба 2026
      const timeout = isTestMode ? 10 * 1000 : 5 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_images', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // ШАГ 6: Картинки клуба 2026 "КАК СДЕЛАТЬ 2026 ГОД ЛУЧШИМ" (через 5 мин)
    else if (type === 'probudis_images') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const imagesKeyboard = new InlineKeyboard().webApp('иду с вами 😍', paymentUrl);

      await telegramService.sendMediaGroup(chatId, [
        { type: 'photo', media: 'https://t.me/mate_bot_open/9666' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9667' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9668' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9669' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9670' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/9671' }
      ]);
      await telegramService.sendMessage(chatId,
        `<b>КАК СДЕЛАТЬ 2026 ГОД ЛУЧШИМ В ТВОЕЙ ЖИЗНИ? ✨\n` +
        `Ответ здесь.</b>\n\n` +
        `2026 становится другим не потому, что повезло.\n` +
        `А потому что у тебя есть <b>основа:\n` +
        `кто ты • на чём зарабатываешь • куда идёшь 🧭</b>\n\n` +
        `Именно для этого мы сделали\n` +
        `<b>марафон «КОД ДЕНЕГ» — 30 дней 💰</b>\n\n` +
        `<b>Тебе сюда, если:</b>\n` +
        `— чувствуешь, что выросла, а доход не догнал\n` +
        `— деньги приходят нестабильно, несмотря на усилия\n` +
        `— устала тащить всё одна и хочешь систему\n` +
        `— хочешь <b>двигаться</b>, а не бесконечно разбираться\n\n` +
        `<b>Что будет на марафоне 👇\n` +
        `4 ключевых эфира + месяц в клубе:</b>\n\n` +
        `— стиль и позиционирование ✨\n` +
        `— разбор слепых зон и утечек денег\n` +
        `— сборка <b>одного продукта</b> на год\n` +
        `— <b>дорожная карта из точки А в точку Б 🗺</b>\n\n` +
        `включение в <b>Десятки</b> и клубную среду 🤍\n\n` +
        `<b>В результате ты получаешь:</b>\n` +
        `— фокус и структуру\n` +
        `— движение без выгорания\n` +
        `— поддержку и среду\n` +
        `— эфиры, разборы, практики и подкасты\n\n` +
        `<b>Продажи открыты.\n` +
        `📍 Старт марафона — 1 февраля.</b>\n\n` +
        `Если хочешь, чтобы 2026 действительно стал твоим годом —<b> жми кнопку ниже</b> 👇`,
        { parse_mode: 'HTML', reply_markup: imagesKeyboard }
      );

      // → через 10 мин: история МЧС
      const timeout = isTestMode ? 10 * 1000 : 10 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_success_story', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // ШАГ 7: История МЧС (через 10 мин)
    else if (type === 'probudis_success_story') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const successKeyboard = new InlineKeyboard().webApp('🌟 иду на марафон', paymentUrl);

      await telegramService.sendMessage(chatId,
        `<b>Путь от работы в МЧС с долгами к свободе и стабильности 🌟</b>\n\n` +
        `Расскажу историю Кристины, которая совмещала обучение цифровой психологии с основной работой — работой в МЧС.\n\n` +
        `✅ <b>Точка А:</b>\n` +
        `– 30 лет, работа за 27 500 ₽\n` +
        `– Долги 1,5 млн ₽, сложные отношения, зависимость от мамы и алкоголя\n` +
        `– Не занималась собой, не могла сказать «нет»\n\n` +
        `✅ <b>Точка Б:</b>\n` +
        `— Рассталась с токсичным мужчиной\n` +
        `— Занимается спортом, наладила отношения с родными\n` +
        `— Доход вырос до 1,7 млн ₽\n\n` +
        `Запусти цепочку изменений в своей жизни и активируй свой код успеха на марафоне КОД ДЕНЕГ 🔽`,
        { parse_mode: 'HTML', reply_markup: successKeyboard }
      );

      // → через 20 мин: 3 ловушки
      const timeout = isTestMode ? 10 * 1000 : 20 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_traps', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // ШАГ 8: 3 ловушки (через 20 мин)
    else if (type === 'probudis_traps') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const trapsKeyboard = new InlineKeyboard()
        .webApp('оформить подписку ❤️', paymentUrl)
        .row()
        .text('я не готов 🤔', 'probudis_not_ready');

      await telegramService.sendVideo(chatId, 'https://t.me/mate_bot_open/9250', {
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
      });

      // → через 20 мин: горящие темы
      const timeout = isTestMode ? 10 * 1000 : 20 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_burning_topics', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // ШАГ 9: Горящие темы (через 20 мин или по кнопке "я не готов")
    else if (type === 'probudis_burning_topics') {
      const { utmData, isTestMode } = task.data || {};
      const topicsKeyboard = new InlineKeyboard()
        .text('💸 Деньги и финансы', 'topic_money')
        .row()
        .text('💼 Работа и карьера', 'topic_career')
        .row()
        .text('❤️ Отношения', 'topic_relationships')
        .row()
        .text('🎯 Цель и смысл', 'topic_purpose')
        .row()
        .text('⚡️ Энергия и здоровье', 'topic_energy');

      await telegramService.sendMessage(chatId,
        `<b>Что горит прямо сейчас? 🔥</b>\n\n` +
        `Только честно.\n` +
        `Чтобы не грузить лишним — выбери, что сейчас важнее всего 👇`,
        { parse_mode: 'HTML', reply_markup: topicsKeyboard }
      );

      // → через 60 мин: Татьяна энергия
      const timeout = isTestMode ? 15 * 1000 : 60 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_energy_tatiana', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // ШАГ 10: Татьяна энергия (через 60 мин)
    else if (type === 'probudis_energy_tatiana') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const energyKeyboard = new InlineKeyboard().webApp('❤️ я с вами', paymentUrl);

      await telegramService.sendVideo(chatId, 'https://t.me/mate_bot_open/9680', {});
      await telegramService.sendMessage(chatId,
        `<b>НИ НА ЧТО НЕТ ЭНЕРГИИ‼️ Цели не зажигают! Знакомо?</b>\n\n` +
        `Татьяна тоже через это прошла: работала менеджером по закупкам, чувствовала себя загнанной белкой в колесе. А сейчас сама нанимает людей себе в команду.\n\n` +
        `Свобода — это не просто состояние. Это — результат пути, который начался с одного решения: больше не быть в этом одной.\n\n` +
        `И ты тоже не одна. Мы рядом. ❤️\n\n` +
        `Пройди свой путь не из одиночества, а в поле.\n` +
        `Нажми на кнопку и зайди в клуб 👇`,
        { parse_mode: 'HTML', reply_markup: energyKeyboard }
      );

      // → через 60 мин: "не просто клуб"
      const timeout = isTestMode ? 15 * 1000 : 60 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_payment_reminder', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // ШАГ 11: "Это не просто клуб" (через 60 мин)
    else if (type === 'probudis_payment_reminder') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const paymentKeyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', paymentUrl)
        .row()
        .text('я не готов 🤔', 'not_ready_3');

      await telegramService.sendVideo(chatId, 'https://t.me/mate_bot_open/9348');
      await telegramService.sendMessage(chatId,
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
        { parse_mode: 'HTML', reply_markup: paymentKeyboard }
      );

      // → День 2: на следующий день в 10:00 МСК
      const delayToDay2 = isTestMode ? 20 * 1000 : getDelayUntilMoscowTime(10, 0);
      await schedulerService.schedule(
        { type: 'probudis_day2', userId, chatId, data: { utmData, isTestMode } }, delayToDay2
      );
    }
    // DAY 2
    else if (type === 'probudis_day2') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const day2Keyboard = new InlineKeyboard().webApp('Оформить подписку ❤️', paymentUrl);

      await telegramService.sendVideo(chatId, 'https://t.me/mate_bot_open/9349', {
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
      });

      const timeout = isTestMode ? 20 * 1000 : 25 * 60 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_day3', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // DAY 3
    else if (type === 'probudis_day3') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const day3Keyboard = new InlineKeyboard().webApp('Оформить подписку ❤️', paymentUrl);

      await telegramService.sendVideo(chatId, 'https://t.me/mate_bot_open/9350', {
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
      });

      const timeout = isTestMode ? 20 * 1000 : 24 * 60 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_day4', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // DAY 4
    else if (type === 'probudis_day4') {
      const { utmData, isTestMode } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const day4Keyboard = new InlineKeyboard().webApp('Оформить подписку ❤️', paymentUrl);

      await telegramService.sendVideo(chatId, 'https://t.me/mate_bot_open/9351', {
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
      });

      const timeout = isTestMode ? 20 * 1000 : 24 * 60 * 60 * 1000;
      await schedulerService.schedule(
        { type: 'probudis_day5', userId, chatId, data: { utmData, isTestMode } }, timeout
      );
    }
    // DAY 5 - финальное
    else if (type === 'probudis_day5') {
      const { utmData } = task.data || {};
      const paymentUrl = getPaymentUrlFromUtm(utmData);
      const day5Keyboard = new InlineKeyboard().webApp('Оформить подписку ❤️', paymentUrl);

      await telegramService.sendPhoto(chatId, 'https://t.me/mate_bot_open/9352', {
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
      });
    }
    // 🌸 MARCH FUNNEL — авто-таймаут дохода (2 мин) и задержка результата (5 сек)
    else if (type === 'march_income_timeout') {
      await marchFunnel.handleMarchIncomeTimeout(userId, chatId);
    }
    else if (type === 'march_result_delay') {
      const { answers, income } = task.data || {};
      if (Array.isArray(answers)) {
        await marchFunnel.sendMarchResult(userId, chatId, answers, income ?? 0);
      }
    }

    // 🆕 PAYMENT NOT COMPLETED — через 10 мин после payment_attempt (общее для всех воронок)
    // НЕ влияет на воронки, просто отправляет сообщение
    else if (type === 'payment_not_completed') {
      // Если мы дошли сюда — значит isPro = false (проверка выше не сработала)
      // Значит пользователь НЕ оплатил после ввода данных
      const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', await getUtmFromUser(userId));
      const retryKeyboard = new InlineKeyboard()
        .webApp('Повторить оплату ❤️', paymentUrl);

      await telegramService.sendMessage(chatId,
        `<b>⚠️ Оплата не прошла? Спокойно. Разберёмся.</b>\n\n` +
        `Вы нажали кнопку оплаты клуба, но платёж не завершился.\n` +
        `В 99% случаев причина техническая и решается за пару минут.\n\n` +
        `Вот основные варианты:\n\n` +
        `<b>💳 Недостаточно средств на карте</b>\n` +
        `Иногда банально не хватает суммы для списания.\n` +
        `👉 Проверьте баланс и попробуйте снова.\n\n` +
        `<b>🔐 Ошибка при вводе кода подтверждения (3DS)</b>\n` +
        `Код от банка может быть:\n` +
        `— введён неверно\n` +
        `— просрочен\n` +
        `— не введён вовсе\n\n` +
        `👉 Вводите код сразу и не закрывайте страницу оплаты.\n\n` +
        `<b>🏦 Банк отклонил операцию</b>\n` +
        `Причины могут быть разные:\n` +
        `— банк посчитал платёж подозрительным\n` +
        `— ограничение на онлайн-операции\n` +
        `— карта временно заблокирована\n\n` +
        `👉 Позвоните в банк или попробуйте оплатить другой картой.\n\n` +
        `<b>❗ Вы нажали «Отменить»</b>\n` +
        `Если на экране ввода карты была нажата кнопка «Отменить» — платёж автоматически прекращается.\n` +
        `👉 Просто повторите попытку.\n\n` +
        `<b>⏳ Окно оплаты было закрыто</b>\n` +
        `Если вы открыли страницу и закрыли её — система считает оплату незавершённой.\n` +
        `👉 Нажмите кнопку оплаты заново и доведите процесс до конца.\n\n` +
        `<b>📅 Истёк срок действия карты</b>\n` +
        `👉 Проверьте дату действия и корректность введённых данных.\n\n` +
        `<b>🌍 Карта не подходит для оплаты</b>\n` +
        `Возможные причины:\n` +
        `— карта не поддерживает оплату в выбранной валюте\n` +
        `— банк находится под санкциями\n` +
        `— ограничения по международным операциям — вы выбрали оплату не в той валюте\n\n` +
        `👉 Попробуйте другую карту.\n\n` +
        `<b>⚙️ Временная техническая ошибка</b>\n` +
        `Иногда сбой происходит на стороне платёжной системы.\n` +
        `👉 Обновите страницу и попробуйте снова через 5–10 минут.\n\n` +
        `<b>📌 Что сделать сейчас:</b>\n` +
        `1️⃣ Повторить оплату\n` +
        `2️⃣ Проверить данные карты\n` +
        `3️⃣ Попробовать другую карту\n` +
        `4️⃣ При необходимости написать в поддержку @Egiazarova_support_bot\n\n` +
        `<b>Важно:</b>\n` +
        `✨ Деньги не списываются без подтверждения.\n` +
        `✨ Если платёж не прошёл — средства остаются у вас.\n\n` +
        `<b>Если вы хотели попасть в клуб — просто завершите оплату.\n` +
        `Доступ активируется сразу после успешного платежа 🤍</b>`,
        { parse_mode: 'HTML', reply_markup: retryKeyboard }
      );

      logger.info({ userId, chatId }, '💳 Payment not completed reminder sent');
    }
    // 🧪 TEST: Ускоренная тестовая воронка /start (ПОЛНЫЕ тексты, ускоренные таймеры)
    else if (type === 'test_start_reminder') {
      // СООБЩЕНИЕ 2 - Тестовое напоминание (10 сек вместо 120)
      const msg2Keyboard = new InlineKeyboard()
        .webApp('Оплатить ❤️', paymentUrl);

      await telegramService.sendPhoto(
        chatId,
        'https://t.me/mate_bot_open/9686',
        {
          caption:
            `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
            `<b>Информация о подписке на клуб:</b>\n\n` +
            `👉🏼 1 месяц = 2000 ₽\n` +
            `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: марафон КОД ДЕНЕГ, обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
            `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
            `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
            `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
            `После оплаты вернитесь в этот бот. Здесь откроется доступ к клубу «КОД УСПЕХА» ❤️\n\n` +
            `Получить доступ в закрытый канал 👇🏼`,
          reply_markup: msg2Keyboard,
          parse_mode: 'HTML'
        }
      );

      // СООБЩЕНИЕ 3 - Отзывы участников марафона (9 видео)
      const marathonKeyboard = new InlineKeyboard()
        .webApp('попасть на марафон ❤️', paymentUrl);

      // Отправляем 9 видео-отзывов
      const videoUrls = [
        'https://t.me/mate_bot_open/9713',
        'https://t.me/mate_bot_open/9714',
        'https://t.me/mate_bot_open/9715',
        'https://t.me/mate_bot_open/9716',
        'https://t.me/mate_bot_open/9717',
        'https://t.me/mate_bot_open/9718',
        'https://t.me/mate_bot_open/9719',
        'https://t.me/mate_bot_open/9720',
        'https://t.me/mate_bot_open/9721',
      ];

      for (const videoUrl of videoUrls) {
        await telegramService.sendVideo(chatId, videoUrl, {});
      }

      // Отправляем текст с кнопкой
      await telegramService.sendMessage(
        chatId,
        `<b>ЭТО ЛЮДИ, КОТОРЫЕ ЗА 3 ДНЯ ВПЕРВЫЕ УВИДЕЛИ, ГДЕ У НИХ ДЕНЬГИ </b>\n\n` +
        `На марафоне они:\n` +
        `— <b>увидели</b> свою <b>денежную</b> механику\n` +
        `— поняли, что именно <b>мешает росту</b>\n` +
        `— сделали <b>первые действия</b> туда, где <b>есть результат</b>\n\n` +
        `И да — у многих первые деньги пришли уже в процессе.\n\n` +
        `<b>‼️ ЭТОТ МАРАФОН Я ПРОВОЖУ В ПЕРВЫЙ И ПОСЛЕДНИЙ РАЗ</b>\n\n` +
        `Это совершенно другой и новый формат.\n` +
        `30 дней работы.\n` +
        `3 дня подряд со мной в прямом эфире.\n\n` +
        `Даже если ты уже была раньше на моих марафонах —\n` +
        `<b>это не повтор .</b>`,
        {
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

      // Планируем test_energy_tatiana через 10 секунд (в обычной воронке - 60 мин)
      await schedulerService.schedule(
        { type: 'test_energy_tatiana', userId, chatId },
        10 * 1000
      );
    }
    else if (type === 'test_energy_tatiana') {
      // 🆕 СООБЩЕНИЕ: Видео об энергии (история Татьяны) - тестовая версия
      const energyKeyboard = new InlineKeyboard()
        .webApp('❤️ я с вами', paymentUrl);

      // Отправляем видео 9680
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9680',
        {}
      );

      // Отправляем текст отдельным сообщением
      await telegramService.sendMessage(
        chatId,
        `<b>НИ НА ЧТО НЕТ ЭНЕРГИИ‼️ Цели не зажигают! Знакомо? </b>\n\n` +
        `Вы принимаете БАДы, медитируете, но ничего не меняется. Причина в том, что вы не следуете своему пути. \n\n` +
        `Энергия есть у тех, кто реализует свой потенциал.\n\n` +
        `Так, моя ученица Татьяна после обучения на цифрового психолога:\n\n` +
        `✅ Вышла на доход 300к - 400к \n` +
        `✅ Оплатила путешествие с ребенком в Черногорию за 500к \n` +
        `✅ Начала проявляться в блоге\n\n` +
        `Кто хочет также? 😍\n\n` +
        `<b>Начни делать первые шаги к своему предназначению на марафоне ⬇️</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: energyKeyboard
        }
      );

      // Планируем test_payment_reminder через 10 секунд
      await schedulerService.schedule(
        { type: 'test_payment_reminder', userId, chatId },
        10 * 1000
      );
    }
    else if (type === 'test_payment_reminder') {
      // СООБЩЕНИЕ: "Это не просто клуб" - тестовая версия
      const msg8Keyboard = new InlineKeyboard()
        .webApp('Оформить подписку ❤️', paymentUrl)
        .row()
        .text('я не готов 🤔', 'not_ready_3');

      // Send video first
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9348'
      );

      // Send text as separate message
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

    // 🔍 DEBUG: Log the received payload
    logger.info({ userId, chatId, startPayload }, '🔍 /start command received with payload');

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

      // 🔥 Сбрасываем onboardingStep и club_funnel_progress чтобы предыдущие тесты не мешали
      const [testUser] = await db.select().from(users).where(eq(users.telegramId, userId)).limit(1);
      if (testUser) {
        await db.update(users).set({ onboardingStep: null }).where(eq(users.id, testUser.id));
        await db.delete(clubFunnelProgress).where(eq(clubFunnelProgress.userId, testUser.id));
      }

      // 📊 Получаем UTM из metadata и добавляем к URL оплаты
      const testUtmData = await getUtmFromUser(userId);
      const testWebAppUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', testUtmData);

      const keyboard = new InlineKeyboard()
        .webApp('Оплатить ❤️', testWebAppUrl)
        .row()
        .text('Что входит в оплату?', 'what_included');

      // Отправляем альбом из 10 картинок
      await telegramService.sendMediaGroup(chatId, [
        { type: 'photo', media: 'https://t.me/mate_bot_open/10028' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10029' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10030' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10031' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10032' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10033' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10034' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10035' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10036' },
        { type: 'photo', media: 'https://t.me/mate_bot_open/10037' },
      ]);

      // Отправляем текст отдельным сообщением с кнопками
      await telegramService.sendMessage(
        chatId,
        `<b>🚀 Я делаю это ОДИН РАЗ. И ПОСЛЕДНИЙ.\n\n` +
        `30 дней марафона и 3 дня эфиров, в которых всё собирается в систему 👇\n\n` +
        `ЗА 30 ДНЕЙ ВЫ:</b>\n\n` +
        `✅ Построите систему продаж, которая работает каждый день, а не «от запуска к запуску»\n` +
        `✅ Создадите свой контент-завод — чтобы клиенты приходили сами\n` +
        `✅ Получите стратегию продаж с учётом трендов 2026 года\n` +
        `✅ Перестанете «прогревать» в пустоту и начнёте зарабатывать\n\n` +
        `<b>🔥 Формат</b>\n` +
        `30 дней внутри закрытого КЛУБА\n` +
        `Ежедневная работа\n` +
        `Жёсткая система\n` +
        `Разборы\n` +
        `Контроль\n` +
        `Деньги\n\n` +
        `Мы не будем «учиться».\n` +
        `Мы будем зарабатывать.\n\n` +
        `<b>Для кого это</b>\n` +
        `— Эксперты без стабильных продаж\n` +
        `— Те, кто устал от хаоса\n` +
        `— Те, кто хочет масштаб, а не мелкие чеки\n` +
        `— Те, кто готов работать\n\n` +
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

      // 🔥 ВАЖНО: Сбрасываем onboardingStep чтобы предыдущие тесты не мешали
      await db
        .update(users)
        .set({ onboardingStep: null })
        .where(eq(users.id, testUser.id));

      // Запускаем club воронку с флагом тестового режима и ignoreIsPro=true
      // чтобы оплаченные пользователи проходили как новые
      await clubFunnel.startClubFunnel(testUser.id, chatId, userId, true, true);
      return;
    }

    // 🧪 Deep link для тестовой women воронки (start=test_women_full)
    // ВАЖНО: Проверяем ДО isPro, чтобы оплаченные пользователи тоже могли тестировать
    if (startPayload === 'test_women_full') {
      logger.info({ userId }, 'User testing FULL women funnel via deep link');

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

      // 🔥 ВАЖНО: Сбрасываем onboardingStep чтобы предыдущие тесты не мешали
      await db
        .update(users)
        .set({ onboardingStep: null })
        .where(eq(users.id, testUser.id));

      // Запускаем women воронку с флагом тестового режима (ускоренные таймеры)
      await womenFunnel.startWomenFunnel(String(userId), chatId, { utm_campaign: 'test_women_full' }, true);
      return;
    }

    // 🧪 Deep link для тестовой club воронки БЕЗ ускоренных таймеров (start=test_club)
    if (startPayload === 'test_club') {
      logger.info({ userId }, 'User testing club funnel via deep link (normal timers)');

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

      // 🔥 ВАЖНО: Сбрасываем onboardingStep чтобы предыдущие тесты не мешали
      await db
        .update(users)
        .set({ onboardingStep: null })
        .where(eq(users.id, testUser.id));

      // Запускаем club воронку БЕЗ флага тестового режима (обычные таймеры)
      // но с ignoreIsPro=true чтобы оплаченные пользователи проходили как новые
      await clubFunnel.startClubFunnel(testUser.id, chatId, userId, false, true);
      return;
    }

    // 🧪 Deep link для тестовой обычной воронки БЕЗ ускоренных таймеров (start=test_start)
    if (startPayload === 'test_start') {
      logger.info({ userId }, 'User testing /start funnel via deep link (normal timers)');

      // Отменяем все предыдущие задачи
      await schedulerService.cancelAllUserTasks(userId);

      // 🔥 Сбрасываем onboardingStep и club_funnel_progress чтобы предыдущие тесты не мешали
      const [testStartUser] = await db.select().from(users).where(eq(users.telegramId, userId)).limit(1);
      if (testStartUser) {
        await db.update(users).set({ onboardingStep: null }).where(eq(users.id, testStartUser.id));
        await db.delete(clubFunnelProgress).where(eq(clubFunnelProgress.userId, testStartUser.id));
      }

      // 📊 Получаем UTM из metadata и добавляем к URL оплаты
      const testUtmData = await getUtmFromUser(userId);
      const testWebAppUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', testUtmData);

      const keyboard = new InlineKeyboard()
        .webApp('Оплатить ❤️', testWebAppUrl)
        .row()
        .text('Что входит в оплату?', 'what_included');

      // Отправляем видео без подписи (Telegram ограничивает caption до 1024 символов)
      await telegramService.sendVideo(
        chatId,
        'https://t.me/mate_bot_open/9684',
        {}
      );

      // Отправляем текст отдельным сообщением с кнопками
      await telegramService.sendMessage(
        chatId,
        `<b>‼️Марафон «КОД ДЕНЕГ» прошло уже более 100.000 человек ⬇️</b>\n\n` +
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
        `на котором можно зарабатывать весь год,\n` +
        `и понимаешь, как внедрять его в жизнь и работу.\n\n` +
        `<b>День 4</b>\n` +
        `Дорожная карта.\n` +
        `План на месяц и маршрут на год вперёд.\n` +
        `Плюс — деление на Десятки:\n` +
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

      // БЕЗ ускоренных таймеров - обычные напоминания не запускаем для теста
      return;
    }

    // 🎭 Deep link для теста персонажа (start=character_test) - доступен ВСЕМ пользователям
    if (startPayload === 'character_test') {
      logger.info({ userId }, 'User started character test funnel');

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

      // Запускаем воронку теста персонажа (без продажи)
      await clubFunnel.startCharacterTestFunnel(testUser.id, chatId, userId);
      return;
    }

    // 🔍 Check if user already exists and has paid FIRST (before any funnels)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, userId))
      .limit(1);

    // 🆕 IMPORTANT: Check women funnel BEFORE general isPro logic
    // Women funnel должна обрабатываться даже для isPro пользователей
    if (startPayload === 'women' || startPayload?.startsWith('women_')) {
      // Women funnel для пользователей С подпиской - показываем первое видео с кнопкой Меню
      if (user && user.isPro) {
        const menuKeyboard = new InlineKeyboard()
          .text('📱 Меню', 'open_menu');

        await bot.api.sendVideo(
          chatId,
          'https://t.me/mate_bot_open/9813',
          {
            caption:
              `Женские деньги — <b>не про гонку и давление.</b>\n` +
              `Они приходят иначе.\n\n` +
              `Когда женщина пытается зарабатывать по «мужской схеме» —\n` +
              `через усилие, контроль и постоянное «надо»,\n` +
              `часто включается <b>выгорание</b>, потеря вкуса и ощущение, что жизнь проходит мимо.\n\n` +
              `💭 Деньги начинают идти тяжело,\n` +
              `💭 реализация перестаёт радовать,\n` +
              `💭 а внутренняя лёгкость исчезает.\n\n` +
              `В этом видео я рассказываю, как <b>через цифровую психологию:</b>\n` +
              `— найти своё настоящее призвание\n` +
              `— сохранить женственность и чувствительность\n` +
              `— выстроить реализацию <b>без надрыва</b>\n` +
              `— и понять, <i>в чём именно твоё предназначение</i>\n\n` +
              `Чтобы деньги приходили\n` +
              `✨ легко\n` +
              `✨ в удовольствии\n` +
              `✨ и с любовью — к себе и к жизни.\n\n` +
              `Смотри видео и почувствуй, как может быть по-другому 🤍`,
            parse_mode: 'HTML',
            reply_markup: menuKeyboard,
          }
        );

        logger.info({ userId }, 'Women funnel video sent to subscribed user');
        return;
      }

      // Women funnel для пользователей БЕЗ подписки - запускаем полную воронку
      // Парсим UTM из payload: women_MEDIUM_SOURCE_CONTENT
      let utmMedium: string | null = null;
      let utmSource: string | null = null;
      let utmContent: string | null = null;

      if (startPayload !== 'women') {
        const parts = startPayload.substring(6).split('_'); // убираем "women_" и разбиваем по "_"
        utmMedium = parts[0] || null; // первая часть = medium (insta, tgchannel, etc.)
        utmSource = parts[1] || null; // вторая часть = source (shapka, stories, etc.)
        utmContent = parts.slice(2).join('_') || null; // остальное = content
      }

      // Get or create user in database
      let womenUser = user; // Reuse user from above query
      if (!womenUser) {
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
        womenUser = newUser;
      }

      // Сохраняем utm_campaign для women воронки в metadata
      const womenUtmData = {
        utm_campaign: 'women',
        utm_medium: utmMedium,
        utm_source: utmSource,
        utm_content: utmContent,
      };

      // Получаем текущий metadata и добавляем UTM
      const currentMetadata = (womenUser.metadata as Record<string, unknown>) || {};
      const updatedMetadata = {
        ...currentMetadata,
        utm_campaign: womenUtmData.utm_campaign,
        utm_medium: womenUtmData.utm_medium,
        utm_source: womenUtmData.utm_source,
        utm_content: womenUtmData.utm_content,
        women_funnel_started_at: new Date().toISOString(),
      };

      await db
        .update(users)
        .set({
          metadata: updatedMetadata,
        })
        .where(eq(users.telegramId, userId));

      logger.info({ userId, utm: womenUtmData }, 'Starting women funnel for non-subscribed user');

      // Логируем вход в воронку
      const wMs = safeUtm(womenUtmData.utm_medium), wSr = safeUtm(womenUtmData.utm_source);
      await db.insert(paymentAnalytics).values({
        telegramId: userId,
        eventType: 'funnel_start',
        utmCampaign: 'women',
        utmMedium: wMs,
        utmSource: wSr,
        utmContent: safeUtm(womenUtmData.utm_content),
        metka: buildMetka('women', wMs, wSr),
      }).catch(() => {});

      // Запускаем women воронку
      await womenFunnel.startWomenFunnel(String(userId), chatId, womenUtmData);
      return;
    }

    // 🆕 PROBUDIS FUNNEL - "КОД УСПЕХА. ГЛАВА: ПРОБУЖДЕНИЕ"
    if (startPayload === 'probudis' || startPayload?.startsWith('probudis_')) {
      logger.info({ userId, startPayload, hasPro: user?.isPro }, '🌅 Probudis funnel triggered');
      
      // Probudis funnel для пользователей С подпиской - показываем первое видео с кнопкой Меню
      if (user && user.isPro) {
        logger.info({ userId }, '🌅 Probudis: User has subscription, showing welcome video');
        const menuKeyboard = new InlineKeyboard()
          .text('📱 Меню', 'open_menu');

        await bot.api.sendVideo(
          chatId,
          'https://t.me/mate_bot_open/9865',
          {
            caption:
              `Добро пожаловать в <b>«КОД УСПЕХА. ГЛАВА: ПРОБУЖДЕНИЕ»</b> ✨\n\n` +
              `Это твоя точка входа в новую реальность —\n` +
              `где ты перестаёшь ждать «правильного момента»\n` +
              `и начинаешь <b>создавать жизнь по собственным правилам.</b>\n\n` +
              `В этом клубе ты найдёшь:\n` +
              `💎 Поддержку сообщества, которое идёт рядом\n` +
              `🔥 Инструменты для роста и трансформации\n` +
              `🌟 Пространство для раскрытия твоего потенциала\n\n` +
              `Ты уже с нами. Добро пожаловать домой 🤍`,
            parse_mode: 'HTML',
            reply_markup: menuKeyboard,
          }
        );

        logger.info({ userId }, 'Probudis funnel video sent to subscribed user');
        return;
      }

      // Probudis funnel для пользователей БЕЗ подписки - запускаем полную воронку
      // Парсим UTM из payload: probudis_MEDIUM_SOURCE_CONTENT
      let utmMedium: string | null = null;
      let utmSource: string | null = null;
      let utmContent: string | null = null;

      if (startPayload !== 'probudis') {
        const parts = startPayload.substring(9).split('_'); // убираем "probudis_" и разбиваем по "_"
        utmMedium = parts[0] || null; // первая часть = medium (insta, tgchannel, etc.)
        utmSource = parts[1] || null; // вторая часть = source
        utmContent = parts.slice(2).join('_') || null; // остальное = content
      }

      // Get or create user in database
      let probudisUser = user; // Reuse user from above query
      if (!probudisUser) {
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
        probudisUser = newUser;
      }

      // Сохраняем utm_campaign для probudis воронки в metadata
      const probudisUtmData = {
        utm_campaign: 'probudis',
        utm_medium: utmMedium,
        utm_source: utmSource,
        utm_content: utmContent,
      };

      // Получаем текущий metadata и добавляем UTM
      const currentMetadata = (probudisUser.metadata as Record<string, unknown>) || {};
      const updatedMetadata = {
        ...currentMetadata,
        utm_campaign: probudisUtmData.utm_campaign,
        utm_medium: probudisUtmData.utm_medium,
        utm_source: probudisUtmData.utm_source,
        utm_content: probudisUtmData.utm_content,
        probudis_funnel_started_at: new Date().toISOString(),
      };

      await db
        .update(users)
        .set({
          metadata: updatedMetadata,
        })
        .where(eq(users.telegramId, userId));

      logger.info({ userId, utm: probudisUtmData }, '🌅 Starting probudis funnel for non-subscribed user');

      // Логируем вход в воронку
      const pMs = safeUtm(probudisUtmData.utm_medium), pSr = safeUtm(probudisUtmData.utm_source);
      await db.insert(paymentAnalytics).values({
        telegramId: userId,
        eventType: 'funnel_start',
        utmCampaign: 'probudis',
        utmMedium: pMs,
        utmSource: pSr,
        utmContent: safeUtm(probudisUtmData.utm_content),
        metka: buildMetka('probudis', pMs, pSr),
      }).catch(() => {});

      // Запускаем probudis воронку
      await probudisFunnel.startProbudisFunnel(String(userId), chatId, probudisUtmData);
      
      logger.info({ userId }, '🌅 Probudis funnel started, returning from /start handler');
      return;
    }

    // 🌸 MARCH FUNNEL — "/start march" или "/start march_..."
    if (startPayload === 'march' || startPayload?.startsWith('march_')) {
      logger.info({ userId, startPayload }, '🌸 March funnel triggered');

      // Get or create user in database
      let marchUser = user;
      if (!marchUser) {
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: userId,
            username: ctx.from?.username || null,
            firstName: ctx.from?.first_name || null,
            lastName: ctx.from?.last_name || null,
          })
          .returning();
        marchUser = newUser;
      }

      // Парсим UTM из payload: march_MEDIUM_SOURCE_CONTENT
      let marchUtmMedium: string | null = null;
      let marchUtmSource: string | null = null;
      let marchUtmContent: string | null = null;

      if (startPayload !== 'march') {
        const parts = startPayload.substring(6).split('_'); // убираем "march_"
        marchUtmMedium = parts[0] || null;
        marchUtmSource = parts[1] || null;
        marchUtmContent = parts.slice(2).join('_') || null;
      }

      // Сохраняем UTM
      const marchUtmData: Record<string, string> = { utm_campaign: 'march' };
      if (marchUtmMedium) marchUtmData.utm_medium = marchUtmMedium;
      if (marchUtmSource) marchUtmData.utm_source = marchUtmSource;
      if (marchUtmContent) marchUtmData.utm_content = marchUtmContent;

      const currentMeta = (marchUser.metadata as Record<string, unknown>) || {};
      // Всегда обновляем utm_campaign='march' — пользователь явно перешёл по march-ссылке
      await db.update(users).set({
        metadata: { ...currentMeta, ...marchUtmData, utm_saved_at: new Date().toISOString() },
      }).where(eq(users.telegramId, userId));

      // Логируем вход в воронку
      const mMs = safeUtm(marchUtmData.utm_medium), mSr = safeUtm(marchUtmData.utm_source);
      await db.insert(paymentAnalytics).values({
        telegramId: userId,
        eventType: 'funnel_start',
        utmCampaign: 'march',
        utmMedium: mMs,
        utmSource: mSr,
        utmContent: safeUtm(marchUtmData.utm_content),
        metka: buildMetka('march', mMs, mSr),
      }).catch(() => {});

      // Запускаем воронку (для isPro тоже — квиз доступен всем)
      await marchFunnel.startMarchFunnel(userId, chatId);
      return;
    }

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
            caption: `Ты начинаешь погружение в <b>«Код успеха. Глава: Пробуждение» ✨</b>\n\n` +
              `Чтобы двери нашей экосистемы открылись, тебе нужно принять её правила.\n\n` +
              `🎥 Посмотри видео <b>до самого конца.</b> Кристина расскажет, как устроена наша Вселенная: где искать ключи, как работает супер-апп и как найти свою стаю 😄 (чаты городов и десятки).\n\n` +
              `<b>🗝 Внимание: внутри видео спрятан секретный Ключ (кодовое слово). Без него я не смогу выдать тебе доступы к материалам и закрытым чатам.</b>\n\n` +
              `Смотри внимательно. <i>Как только услышишь слово — пиши его мне в ответ 👇🏼</i>\n\n` +
              `<tg-spoiler>подсказка: карта</tg-spoiler>`,
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
          .webApp('вступить в чат города', getWebAppUrl('?tab=chats'))
          .row()
          .webApp('открыть штаб', getWebAppUrl())
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

      // 🆕 Пользователь с подпиской, но БЕЗ онбординга (onboardingStep = null)
      // Устанавливаем awaiting_keyword и показываем первое сообщение онбординга
      if (!user.onboardingStep) {
        logger.info({ userId, telegramId: user.telegramId }, 'Paid user without onboarding - starting onboarding from keyword step');

        // Устанавливаем этап онбординга
        await db
          .update(users)
          .set({ onboardingStep: 'awaiting_keyword' })
          .where(eq(users.telegramId, userId));

        // Показываем первое сообщение онбординга (видео с кодовым словом)
        await telegramService.sendVideo(
          chatId,
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
        return;
      }
    }

    // 🆕 Check for club funnel link (start=club or start=club_XXX) - only for non-paying users
    // Поддерживаемые форматы (utm_campaign utm_medium utm_source utm_content):
    // - club - без метки (utm_campaign=club)
    // - club_insta - utm_campaign=club, utm_medium=insta
    // - club_insta_shapka - utm_campaign=club, utm_medium=insta, utm_source=shapka
    // - club_insta_shapka_promo - utm_campaign=club, utm_medium=insta, utm_source=shapka, utm_content=promo
    if ((startPayload === 'club' || startPayload?.startsWith('club_')) && !(user && user.isPro)) {
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

      // Логируем вход в воронку
      const cMs = safeUtm(utmData.utm_medium), cSr = safeUtm(utmData.utm_source);
      await db.insert(paymentAnalytics).values({
        telegramId: userId,
        eventType: 'funnel_start',
        utmCampaign: 'club',
        utmMedium: cMs,
        utmSource: cSr,
        utmContent: safeUtm(utmData.utm_content),
        metka: buildMetka('club', cMs, cSr),
      }).catch(() => {});

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

        // Логируем вход в воронку
        const sMs = safeUtm(utmData.utm_medium), sSr = safeUtm(utmData.utm_source);
        await db.insert(paymentAnalytics).values({
          telegramId: userId,
          eventType: 'funnel_start',
          utmCampaign: 'start',
          utmMedium: sMs,
          utmSource: sSr,
          utmContent: safeUtm(utmData.utm_content),
          metka: buildMetka('start', sMs, sSr),
        }).catch(() => {});
      }

      // ✅ Если пользователь с подпиской перешёл по start_XXX ссылке - показываем меню
      if (user && user.isPro) {
        logger.info({ userId }, 'Paid user clicked start_ link - showing menu');
        await funnels.sendMenuMessage(chatId);
        return;
      }
    }

    // ✅ Если пользователь с подпиской зашёл по обычному /start без параметров - показываем меню
    // (обработка onboardingStep уже была выше, тут ловим случай когда onboarding_complete)
    if (user && user.isPro && !startPayload) {
      logger.info({ userId }, 'Paid user clicked /start without params - showing menu');
      await funnels.sendMenuMessage(chatId);
      return;
    }

    // 🧹 Очистка ВСЕХ запланированных задач при перезапуске /start (start, women, probudis, club — любые)
    await schedulerService.cancelAllUserTasks(userId);

    // Сбрасываем тестовый режим club воронки (если был включён)
    clubFunnel.setTestMode(false);

    logger.info({ userId }, 'Start command - cancelled all pending tasks from both funnels');

    // 🆕 Создаём пользователя если его нет в базе (для обычного /start без club_ параметров)
    if (!user) {
      // Парсим UTM из startPayload если есть (формат: start_MEDIUM_SOURCE_CONTENT)
      let utmCampaign = 'start';
      let utmMedium: string | null = null;
      let utmSource: string | null = null;
      let utmContent: string | null = null;

      if (startPayload && startPayload.startsWith('start_')) {
        const parts = startPayload.substring(6).split('_'); // убираем "start_" и разбиваем по "_"
        utmMedium = parts[0] || null;
        utmSource = parts[1] || null;
        utmContent = parts.slice(2).join('_') || null;
      }

      const metadata: Record<string, string> = { utm_campaign: utmCampaign };
      if (utmMedium) metadata.utm_medium = utmMedium;
      if (utmSource) metadata.utm_source = utmSource;
      if (utmContent) metadata.utm_content = utmContent;

      await db
        .insert(users)
        .values({
          telegramId: userId,
          username: ctx.from?.username || null,
          firstName: ctx.from?.first_name || null,
          lastName: ctx.from?.last_name || null,
          metadata,
        });

      logger.info({ userId, ...metadata }, 'Created new user from /start command');
    }

    // 📊 Получаем UTM из metadata и добавляем к URL оплаты
    const userUtmData = await getUtmFromUser(userId);
    const webAppUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', userUtmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', webAppUrl)
      .row()
      .text('Что входит в оплату?', 'what_included');

    // Отправляем альбом из 10 картинок
    await telegramService.sendMediaGroup(chatId, [
      { type: 'photo', media: 'https://t.me/mate_bot_open/10028' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10029' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10030' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10031' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10032' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10033' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10034' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10035' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10036' },
      { type: 'photo', media: 'https://t.me/mate_bot_open/10037' },
    ]);

    // Then send text message with buttons separately
    await ctx.reply(
      `<b>🚀 Я делаю это ОДИН РАЗ. И ПОСЛЕДНИЙ.\n\n` +
      `30 дней марафона и 3 дня эфиров, в которых всё собирается в систему 👇\n\n` +
      `ЗА 30 ДНЕЙ ВЫ:</b>\n\n` +
      `✅ Построите систему продаж, которая работает каждый день, а не «от запуска к запуску»\n` +
      `✅ Создадите свой контент-завод — чтобы клиенты приходили сами\n` +
      `✅ Получите стратегию продаж с учётом трендов 2026 года\n` +
      `✅ Перестанете «прогревать» в пустоту и начнёте зарабатывать\n\n` +
      `<b>🔥 Формат</b>\n` +
      `30 дней внутри закрытого КЛУБА\n` +
      `Ежедневная работа\n` +
      `Жёсткая система\n` +
      `Разборы\n` +
      `Контроль\n` +
      `Деньги\n\n` +
      `Мы не будем «учиться».\n` +
      `Мы будем зарабатывать.\n\n` +
      `<b>Для кого это</b>\n` +
      `— Эксперты без стабильных продаж\n` +
      `— Те, кто устал от хаоса\n` +
      `— Те, кто хочет масштаб, а не мелкие чеки\n` +
      `— Те, кто готов работать\n\n` +
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

    // Schedule 5-minute reminder if user doesn't pay - shows ticket info
    await schedulerService.schedule(
      {
        type: 'start_reminder',
        userId,
        chatId,
      },
      5 * 60 * 1000 // 5 minutes
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /start command');
  }
});

// Handle "Что входит в оплату?" callback button
bot.callbackQuery('what_included', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;

    // ⚡ Отменяем start_reminder, т.к. пользователь уже увидит билет сейчас
    await schedulerService.cancelUserTasksByType(userId, 'start_reminder');

    // 📊 Получаем UTM из metadata и добавляем к URL оплаты
    const utmData = await getUtmFromUser(userId);
    const webAppUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', webAppUrl);

    // Send image with ticket info
    await telegramService.sendPhoto(
      chatId,
      'https://t.me/mate_bot_open/9686',
      {
        caption:
          `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
          `<b>Информация о подписке на клуб:</b>\n\n` +
          `👉🏼 1 месяц = 2000 ₽\n` +
          `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: марафон КОД ДЕНЕГ, обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
          `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
          `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
          `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
          `Получить доступ в закрытый канал 👇🏼`,
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

    // Mark user as awaiting payment
    await stateService.setState(userId, 'awaiting_payment');

    // Schedule видео-отзывы через 5 минут (если не оплатил)
    await schedulerService.schedule(
      {
        type: 'start_marathon_5min',
        userId,
        chatId,
      },
      5 * 60 * 1000 // 5 minutes
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in what_included handler');
  }
});

// Handle "Получить доступ" callback button (legacy - kept for backwards compatibility)
bot.callbackQuery('get_access', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;

    // 📊 Получаем UTM из metadata и добавляем к URL оплаты
    const utmData = await getUtmFromUser(userId);
    const webAppUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

    // Cancel the 120-second start reminder since user clicked the button
    await schedulerService.cancelUserTasksByType(userId, 'start_reminder');

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', webAppUrl);

    // Send image with ticket info
    await telegramService.sendPhoto(
      chatId,
      'https://t.me/mate_bot_open/9686',
      {
        caption:
          `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
          `<b>Информация о подписке на клуб:</b>\n\n` +
          `👉🏼 1 месяц = 2000 ₽\n` +
          `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: марафон КОД ДЕНЕГ, обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
          `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
          `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
          `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
          `После оплаты вернитесь в этот бот. Здесь откроется доступ к клубу «КОД УСПЕХА» ❤️\n\n` +
          `Получить доступ в закрытый канал 👇🏼`,
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

    // Mark user as awaiting payment
    await stateService.setState(userId, 'awaiting_payment');

    // Schedule марафон КОД ДЕНЕГ через 5 минут (если не оплатил)
    await schedulerService.schedule(
      {
        type: 'start_marathon_5min',
        userId,
        chatId,
      },
      5 * 60 * 1000 // 5 minutes
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in get_access handler');
  }
});

// 📱 Open menu callback - для пользователей с подпиской
bot.callbackQuery('open_menu', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;

    logger.info({ userId }, 'open_menu callback triggered');

    // Check if user has active subscription
    const hasPaid = await checkPaymentStatus(userId);

    if (!hasPaid) {
      // User doesn't have subscription - redirect to payment funnel
      logger.info({ userId }, 'open_menu called by non-paid user, redirecting to payment');

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
    logger.error({ error, userId: ctx.from?.id }, 'Error in open_menu callback');
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
    await schedulerService.cancelUserTasksByType(userId, 'start_reminder');

    // 📊 Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', paymentUrl);

    await telegramService.sendPhoto(
      chatId,
      'https://t.me/mate_bot_open/9686',
      {
        caption:
          `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
          `<b>Информация о подписке на клуб:</b>\n\n` +
          `👉🏼 1 месяц = 2000 ₽\n` +
          `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: марафон КОД ДЕНЕГ, обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
          `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
          `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
          `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
          `После оплаты вернитесь в этот бот. Здесь откроется доступ к клубу «КОД УСПЕХА» ❤️\n\n` +
          `Получить доступ в закрытый канал 👇🏼`,
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

    // 🧪 В тестовом режиме: марафон через 10 сек (вместо 5 мин)
    // Передаём isTestMode чтобы все последующие сообщения тоже использовали ускоренные таймеры
    await schedulerService.schedule(
      { type: 'start_marathon_5min', userId, chatId, data: { isTestMode: true } },
      10 * 1000 // 10 seconds for testing
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

    // Schedule energy_tatiana_reminder in 60 minutes (then payment_reminder after that)
    await schedulerService.schedule(
      {
        type: 'energy_tatiana_reminder',
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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

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

// 🌅 PROBUDIS: "я не готов" на шаге 8 (ловушки) → досрочно запускает шаг 9 (горящие темы)
bot.callbackQuery('probudis_not_ready', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;

    logger.info({ userId }, '🌅 Probudis: user clicked "я не готов" on traps step, sending burning topics');

    // Отменяем запланированный probudis_burning_topics (он придёт досрочно)
    await schedulerService.cancelUserTasksByType(userId, 'probudis_burning_topics');

    // Получаем UTM из metadata пользователя
    const utmData = await getUtmFromUser(userId);

    // Отправляем горящие темы сразу
    const topicsKeyboard = new InlineKeyboard()
      .text('💸 Деньги и финансы', 'topic_money')
      .row()
      .text('💼 Работа и карьера', 'topic_career')
      .row()
      .text('❤️ Отношения', 'topic_relationships')
      .row()
      .text('🎯 Цель и смысл', 'topic_purpose')
      .row()
      .text('⚡️ Энергия и здоровье', 'topic_energy');

    await telegramService.sendMessage(chatId,
      `<b>Что горит прямо сейчас? 🔥</b>\n\n` +
      `Только честно.\n` +
      `Чтобы не грузить лишним — выбери, что сейчас важнее всего 👇`,
      { parse_mode: 'HTML', reply_markup: topicsKeyboard }
    );

    // → через 60 мин: Татьяна энергия
    await schedulerService.schedule(
      { type: 'probudis_energy_tatiana', userId, chatId, data: { utmData } },
      60 * 60 * 1000
    );
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in probudis_not_ready callback');
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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

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

    // Schedule energy_tatiana_reminder in 60 minutes after topic
    await schedulerService.schedule(
      {
        type: 'energy_tatiana_reminder',
        userId,
        chatId,
      },
      60 * 60 * 1000 // 60 minutes
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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

    // Schedule energy_tatiana_reminder in 60 minutes after topic
    await schedulerService.schedule(
      {
        type: 'energy_tatiana_reminder',
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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

    // Schedule energy_tatiana_reminder in 60 minutes after topic
    await schedulerService.schedule(
      {
        type: 'energy_tatiana_reminder',
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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оформить подписку ❤️', paymentUrl);

    // Schedule energy_tatiana_reminder in 60 minutes after topic
    await schedulerService.schedule(
      {
        type: 'energy_tatiana_reminder',
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
// Matches 'gift_start' (old) and 'gift_start_{token}' (new format with embedded token)
bot.callbackQuery(/^gift_start/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    // Активируем подарок — ищем по recipientTgId (userId = получатель)
    const activated = await funnels.activateGiftSubscription(userId, chatId);
    if (!activated) {
      logger.warn({ userId }, 'gift_start callback: gift not found or already activated');
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
      // 🛡️ Проверяем тестовый режим - если ignoreIsPro=true, показываем форму оплаты
      const treatAsIsPro = await clubFunnel.shouldTreatAsIsPro(user.isPro, user.id);
      if (treatAsIsPro) {
        // Оплаченный пользователь - показываем keyword video
        await clubFunnel.handleClubStartRouteImported(user.id, ctx.from.id);
      } else {
        // Тестовый режим или неоплаченный - показываем форму оплаты
        await clubFunnel.handleClubStartRoute(user.id, ctx.from.id, user);
      }
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

// ============================================================================
// 🌸 MARCH FUNNEL CALLBACKS (архетип эксперта)
// ============================================================================

// March funnel - кнопка "начать диагностику"
bot.callbackQuery('march_start', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    await marchFunnel.handleMarchStart(userId, chatId);
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in march_start callback');
  }
});

// March funnel - ответы на вопросы Q1-Q5 (паттерн march_q{N}_{answer})
bot.callbackQuery(/^march_q[1-5]_[1-5]$/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const data = ctx.callbackQuery.data; // e.g. "march_q3_2"
    const match = data.match(/^march_q(\d)_(\d)$/);
    if (match) {
      const qNumber = parseInt(match[1]);
      const answer  = parseInt(match[2]);
      await marchFunnel.handleMarchAnswer(userId, chatId, qNumber, answer);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in march question callback');
  }
});

// ============================================================================
// 🎭 CHARACTER TEST FUNNEL CALLBACKS
// ============================================================================

// Start character test from menu button
bot.callbackQuery('start_character_test', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.startCharacterTestFunnel(user.id, ctx.chat.id, ctx.from.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in start_character_test callback');
  }
});

// Character test - Birthdate confirmation YES
bot.callbackQuery(/^ct_confirm_date_yes_/, async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery.data;
    const birthDate = data.replace('ct_confirm_date_yes_', '');
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user && birthDate) {
      await clubFunnel.handleCharacterTestBirthDateConfirmed(user.id, ctx.chat.id, birthDate);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in ct_confirm_date_yes callback');
  }
});

// Character test - Birthdate confirmation NO
bot.callbackQuery('ct_confirm_date_no', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleBirthDateRejected(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in ct_confirm_date_no callback');
  }
});

// Character test - "хочу активировать свой потенциал" button -> Archetype
bot.callbackQuery('character_test_activate', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleCharacterTestArchetype(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in character_test_activate callback');
  }
});

// Character test - "Получить расшифровку стиля" button
bot.callbackQuery('character_test_style', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleCharacterTestStyle(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in character_test_style callback');
  }
});

// Character test - "Где мой масштаб" button
bot.callbackQuery('character_test_scale', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleCharacterTestScale(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in character_test_scale callback');
  }
});

// Character test - "Узнать свою точку роста" button -> Final (roadmap)
bot.callbackQuery('character_test_final', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();
    const user = await funnels.getUserByTgId(ctx.from.id);
    if (user) {
      await clubFunnel.handleCharacterTestFinal(user.id, ctx.chat.id);
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in character_test_final callback');
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

// 🆕 Probudis funnel - "Узнать подробнее" button (immediately sends step 2)
bot.callbackQuery('probudis_learn_more', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    logger.info({ userId, chatId }, 'User clicked "Узнать подробнее" in probudis funnel');

    // Cancel scheduled dogrev (user clicked immediately)
    await schedulerService.cancelUserTasksByTypes(userId, ['probudis_dogrev_5m']);

    // Get UTM data from user metadata
    const rawUtm = await getUtmFromUser(userId);
    const utmData: Record<string, string> = {};
    if (rawUtm.utm_campaign) utmData.utm_campaign = rawUtm.utm_campaign;
    if (rawUtm.utm_medium) utmData.utm_medium = rawUtm.utm_medium;
    if (rawUtm.utm_source) utmData.utm_source = rawUtm.utm_source;
    if (rawUtm.utm_content) utmData.utm_content = rawUtm.utm_content;

    // Send step 2 immediately (isTestMode = false)
    await probudisFunnel.sendProbudisDogrev(String(userId), chatId, utmData, false);
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in probudis_learn_more callback');
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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

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
    const paymentUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', utmData);

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

    // 🧪 Сбрасываем тестовый режим при вызове /menu
    // Это позволяет выйти из тестового прохода воронки и вернуться к нормальному режиму
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, userId))
      .limit(1);

    if (user) {
      await clubFunnel.resetTestMode(user.id, userId);
      logger.info({ userId }, '/menu - test mode reset');
    }

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
      .webApp('🚀 Открыть приложение', getWebAppUrl());

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
      .webApp('🚀 Продолжить обучение', getWebAppUrl());

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
      .webApp('🧘 Начать медитацию', getWebAppUrl(`/meditations/${randomMeditation.id}`));

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

    // 📊 Получаем UTM из metadata и добавляем к URL оплаты
    const adminUtmData = await getUtmFromUser(userId);
    const adminWebAppUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', adminUtmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', adminWebAppUrl)
      .row()
      .text('Что входит в оплату?', 'what_included');

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
      'https://t.me/mate_bot_open/9684',
      {}
    );

    // Then send text message with buttons separately
    await telegramService.sendMessage(
      chatId,
      `<b>‼️Марафон «КОД ДЕНЕГ» прошло уже более 100.000 человек ⬇️</b>\n\n` +
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
      `на котором можно зарабатывать весь год,\n` +
      `и понимаешь, как внедрять его в жизнь и работу.\n\n` +
      `<b>День 4</b>\n` +
      `Дорожная карта.\n` +
      `План на месяц и маршрут на год вперёд.\n` +
      `Плюс — деление на Десятки:\n` +
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
      '📌 Нажми "Что входит в оплату?" чтобы увидеть информацию о билете'
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

    // 📊 Получаем UTM из metadata и добавляем к URL оплаты
    const testFullUtmData = await getUtmFromUser(userId);
    const webAppUrl = addUtmToPaymentUrl('https://app.successkod.com/payment_form_club.html', testFullUtmData);

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', webAppUrl)
      .row()
      .text('Что входит в оплату?', 'what_included');

    // Send video first (without caption - Telegram limit is 1024 chars for captions)
    await telegramService.sendVideo(
      chatId,
      'https://t.me/mate_bot_open/9684',
      {}
    );

    // Then send text message with button separately - НОВЫЙ ТЕКСТ МАРАФОНА
    await telegramService.sendMessage(
      chatId,
      `<b>‼️Марафон «КОД ДЕНЕГ» прошло уже более 100.000 человек ⬇️</b>\n\n` +
      `<b>30 дней марафона и 4 дня эфиров, в которых Кристина Егиазарова даст тебе чёткий алгоритм...</b>\n\n` +
      `<b>День 1 — КОД ДЕНЕГ</b>\n` +
      `Главное в этом эфире — это раскрытие твоего индивидуального кода. Он выявляет блоки, которые тормозят твой доход и показывает, где в тебе прячется ключ к твоим большим деньгам.\n\n` +
      `<b>День 2 — КОД ОТНОШЕНИЙ</b>\n` +
      `На втором эфире мы разберём, как отношения (личные и рабочие) влияют на доход. Твоя задача — наладить связь с окружением так, чтобы оно тебя поддерживало, а не тормозило.\n\n` +
      `<b>День 3 — КОД РЕАЛИЗАЦИИ</b>\n` +
      `Третий эфир — про действия. Я дам тебе конкретный план, основанный на твоих сильных сторонах. Ты поймёшь, что именно тебе нужно делать, чтобы выйти на новый финансовый уровень.\n\n` +
      `<b>День 4 — КОД УСПЕХА</b>\n` +
      `В финальном эфире мы соберём всё воедино. Ты получишь свою личную стратегию успеха и увидишь конкретные шаги, которые приведут тебя к росту дохода уже в ближайшие 30 дней.\n\n` +
      `<b>💰 Стоимость</b>\n` +
      `<s>3000 ₽</s>\n` +
      `<b>2000 ₽ для тебя</b>\n\n` +
      `Доступ открывается <b>сразу после входа 👇</b>`,
      {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

    // Schedule fast 10-second reminder (вместо 5 минут)
    await schedulerService.schedule(
      {
        type: 'start_reminder',
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

// /test_women - ТЕСТ women воронки (только первое сообщение)
bot.command('test_women', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    logger.info({ userId }, 'User testing women funnel (first message only)');

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

    // Запускаем women воронку БЕЗ догрева (только первое сообщение)
    await womenFunnel.startWomenFunnel(String(userId), chatId, { utm_campaign: 'test' });

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /test_women command');
    await ctx.reply('❌ Ошибка при тестировании women воронки');
  }
});

// /test_women_full - ПОЛНЫЙ тест women воронки с ускоренными таймерами
bot.command('test_women_full', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    logger.info({ userId }, 'User testing FULL women funnel with fast timers');

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

    // Запускаем women воронку с флагом тестового режима (ускоренные таймеры)
    await womenFunnel.startWomenFunnel(String(userId), chatId, { utm_campaign: 'test' }, true);

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /test_women_full command');
    await ctx.reply('❌ Ошибка при тестировании women воронки');
  }
});

// /test_probudis - тест первого сообщения probudis воронки (без таймеров)
bot.command('test_probudis', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    logger.info({ userId }, 'User testing probudis funnel (first message only)');

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

    // Запускаем probudis воронку БЕЗ догрева (только первое сообщение)
    await probudisFunnel.startProbudisFunnel(String(userId), chatId, { utm_campaign: 'test' });

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /test_probudis command');
    await ctx.reply('❌ Ошибка при тестировании probudis воронки');
  }
});

// /test_probudis_full - ПОЛНЫЙ тест probudis воронки с ускоренными таймерами
bot.command('test_probudis_full', async (ctx) => {
  try {
    const userId = ctx.from!.id;
    const chatId = ctx.chat.id;

    logger.info({ userId }, 'User testing FULL probudis funnel with fast timers');

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

    // Запускаем probudis воронку с флагом тестового режима (ускоренные таймеры)
    await probudisFunnel.startProbudisFunnel(String(userId), chatId, { utm_campaign: 'test' }, true);

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Error in /test_probudis_full command');
    await ctx.reply('❌ Ошибка при тестировании probudis воронки');
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
      '/test_club - первое сообщение club воронки\n' +
      '/test_women - первое сообщение women воронки\n' +
      '/test_probudis - первое сообщение probudis воронки\n\n' +
      '<b>Полный тест (ускоренные таймеры):</b>\n' +
      '/test_start_full - вся воронка /start (таймеры 10-35 сек)\n' +
      '/test_club_full - вся club воронка (таймеры 10-15 сек)\n' +
      '/test_women_full - вся women воронка (таймер 10 сек)\n' +
      '/test_probudis_full - вся probudis воронка (таймер 10 сек)\n\n' +
      '<b>Ссылки для реального теста:</b>\n' +
      '• Обычная: t.me/hranitelkodbot?start=test\n' +
      '• Club: t.me/hranitelkodbot?start=club\n' +
      '• Women: t.me/hranitelkodbot?start=women\n' +
      '• Probudis: t.me/hranitelkodbot?start=probudis\n\n' +
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

// /create_decade - создать десятку в текущем чате (только для лидеров, работает в группах)
bot.command('create_decade', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Без названия';
    const fromUser = ctx.from;

    if (!fromUser) {
      await ctx.reply('❌ Не удалось определить отправителя команды.');
      return;
    }

    // Проверяем что это группа
    if (chatType !== 'group' && chatType !== 'supergroup') {
      await ctx.reply('❌ Эта команда работает только в группах.\n\nДобавьте бота в группу и выполните команду там.');
      return;
    }

    logger.info(
      { chatId, chatTitle, chatType, userId: fromUser.id, username: fromUser.username },
      '/create_decade command received'
    );

    // 🛡️ Проверяем права бота в чате
    try {
      const botMember = await ctx.api.getChatMember(chatId, ctx.me.id);

      if (botMember.status !== 'administrator') {
        await ctx.reply(
          `⚠️ Бот должен быть администратором чата для создания десятки.\n\n` +
          `Пожалуйста, назначьте бота администратором с правами:\n` +
          `✅ Блокировка пользователей\n` +
          `✅ Приглашение по ссылке`
        );
        return;
      }

      const canRestrictMembers = 'can_restrict_members' in botMember && botMember.can_restrict_members;
      const canInviteUsers = 'can_invite_users' in botMember && botMember.can_invite_users;

      if (!canRestrictMembers || !canInviteUsers) {
        await ctx.reply(
          `⚠️ У бота недостаточно прав для управления десяткой.\n\n` +
          `Необходимые права:\n` +
          `${canRestrictMembers ? '✅' : '❌'} Блокировка пользователей\n` +
          `${canInviteUsers ? '✅' : '❌'} Приглашение по ссылке\n\n` +
          `Пожалуйста, дайте боту эти права.`
        );
        return;
      }
    } catch (permError) {
      logger.error({ error: permError, chatId }, 'Failed to check bot permissions');
      await ctx.reply('❌ Не удалось проверить права бота. Убедитесь, что бот является администратором.');
      return;
    }

    // 🔍 Проверяем статус лидера (3 сценария: clean/betrayal/return)
    const leaderStatus = await decadesService.checkLeaderDecadeStatus(fromUser.id, chatId);

    // Сценарий: NOT_LEADER - не лидер
    if (leaderStatus.status === 'not_leader') {
      logger.warn(
        { chatId, chatTitle, fromUserId: fromUser.id, reason: leaderStatus.reason },
        'User is not a leader - cannot create decade'
      );

      await ctx.reply(
        `⚠️ Вы не можете создать десятку.\n\n` +
        `Причина: ${leaderStatus.reason || 'Вы не являетесь лидером или не выполнены условия создания десятки.'}\n\n` +
        `Чтобы стать лидером десятки, нужно:\n` +
        `1. Иметь активную подписку\n` +
        `2. Пройти тест лидера\n` +
        `3. Указать город в профиле`
      );
      return;
    }

    // Сценарий: BETRAYAL - лидер пытается создать вторую десятку
    if (leaderStatus.status === 'betrayal') {
      logger.warn(
        {
          chatId,
          chatTitle,
          fromUserId: fromUser.id,
          existingDecade: leaderStatus.existingDecade?.id,
          existingChatId: leaderStatus.existingDecade?.tgChatId,
        },
        'Leader betrayal detected - already has active decade in another chat'
      );

      await ctx.reply(
        `🚫 Ошибка! @${fromUser.username || fromUser.first_name}, ${leaderStatus.reason}.\n\n` +
        `Правило системы: 1 Лидер = 1 Чат.\n\n` +
        `Если вы хотите сменить чат десятки, сначала расформируйте текущую через поддержку.`
      );
      return;
    }

    // Сценарий: RETURN - лидер вернулся в тот же чат (реактивация)
    if (leaderStatus.status === 'return' && leaderStatus.existingDecade) {
      logger.info(
        {
          chatId,
          chatTitle,
          fromUserId: fromUser.id,
          decadeId: leaderStatus.existingDecade.id,
        },
        'Leader using create_decade in existing decade chat - reactivating'
      );

      try {
        // Реактивируем десятку если она была деактивирована
        if (!leaderStatus.existingDecade.isActive) {
          await decadesService.reactivateDecade(leaderStatus.existingDecade.id);
        }

        await ctx.reply(
          `🤖 Десятка №${leaderStatus.existingDecade.number} города ${leaderStatus.existingDecade.city} уже существует в этом чате!\n\n` +
          `👥 Участников: ${leaderStatus.existingDecade.currentMembers}/${leaderStatus.existingDecade.maxMembers}\n\n` +
          `Статус: ${leaderStatus.existingDecade.isActive ? '✅ Активна' : '✅ Реактивирована'}`
        );
      } catch (returnError) {
        logger.error({ error: returnError, chatId }, 'Failed to handle return scenario');
        await ctx.reply('❌ Произошла ошибка при обработке. Попробуйте снова.');
      }
      return;
    }

    // Сценарий: CLEAN - создаём новую десятку
    const result = await decadesService.createDecade(chatId, fromUser.id, chatTitle);

    if (result.success && result.decade) {
      logger.info(
        { chatId, decadeId: result.decade.id, city: result.decade.city, number: result.decade.number },
        'Decade created successfully via /create_decade'
      );

      await ctx.reply(
        `🎉 Десятка №${result.decade.number} города ${result.decade.city} создана!\n\n` +
        `👥 Максимум участников: 11 (включая лидера)\n` +
        `📋 Участники будут распределяться автоматически\n\n` +
        `Ваша ссылка-приглашение:\n${result.decade.inviteLink || 'Будет создана позже'}\n\n` +
        `⚠️ Не забывайте отправлять еженедельный отчёт (светофор) по пятницам!`,
        { link_preview_options: { is_disabled: true } }
      );
    } else {
      logger.error({ chatId, error: result.error }, 'Failed to create decade via /create_decade');
      await ctx.reply(
        `❌ Ошибка при создании десятки: ${result.error}\n\nПопробуйте снова или обратитесь к администратору.`
      );
    }
  } catch (error) {
    logger.error({ error, userId: ctx.from?.id, chatId: ctx.chat?.id }, 'Error in /create_decade command');
    try {
      await ctx.reply('❌ Произошла ошибка. Попробуйте снова позже.');
    } catch {
      // ignore
    }
  }
});

// Callback handlers
bot.callbackQuery('my_courses', async (ctx) => {
  try {
    await ctx.answerCallbackQuery();

    const keyboard = new InlineKeyboard()
      .webApp('📚 Открыть курсы', getWebAppUrl('/courses'));

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
      .webApp('🧘 Открыть медитации', getWebAppUrl('/meditations'));

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
    // Normalize text for keyword validation (trim whitespace, uppercase, remove extra spaces)
    const text = rawText.toUpperCase().replace(/\s+/g, ' ').trim();
    const user = await funnels.getUserByTgId(userId);

    // 🔥 АВТОПРОПУСК: Если пользователь на awaiting_keyword и пишет ЛЮБОЕ сообщение - пропускаем дальше
    // Это решает проблему когда кодовое слово не распознаётся (латиница, опечатки и т.д.)
    if (user && user.onboardingStep === 'awaiting_keyword' && user.isPro) {
      logger.info({ userId, rawText, text }, 'User on awaiting_keyword wrote message - auto-advancing to next step');
      await funnels.handleKeywordSuccess(user.id, ctx.chat.id);
      return;
    }

    // Проверка кодового слова "КАРТА" (поддержка вариантов написания)
    // Принимаем: КАРТА, карта, Карта, KAPTA (латиница), с пробелами и т.д.
    const isKeywordKarta = text === 'КАРТА' ||
                           text === 'KAPTA' || // латиница
                           text.includes('КАРТА') ||
                           text.includes('KAPTA');

    if (isKeywordKarta && user) {
      logger.info({ userId, rawText, text, onboardingStep: user.onboardingStep }, 'User entered keyword КАРТА');

      // Случай 1: Пользователь на этапе awaiting_keyword - стандартный флоу (уже обработано выше)
      if (user.onboardingStep === 'awaiting_keyword') {
        logger.info({ userId }, 'Processing keyword for awaiting_keyword user');
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

      // Случай 3: Пользователь написал КАРТА но не на нужном этапе - логируем для отладки
      logger.warn({ userId, onboardingStep: user.onboardingStep, isPro: user.isPro }, 'User entered КАРТА but not in correct state');
    }

    // 🌸 Check if user is in march funnel awaiting income input
    const isInMarch = await marchFunnel.isUserInMarchFunnel(userId);
    if (isInMarch) {
      await marchFunnel.handleMarchIncomeInput(userId, ctx.chat.id, rawText);
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
        await clubFunnel.handleBirthDateInput(user.id, ctx.chat.id, rawText, ctx.from.id);
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

// 🔟 My chat member handler - когда бота добавляют в чат (создание десятки)
bot.on('my_chat_member', async (ctx) => {
  try {
    const update = ctx.myChatMember;
    const chatId = update.chat.id;
    const chatTitle = update.chat.title || 'Без названия';
    const chatType = update.chat.type;
    const fromUser = update.from;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;

    // Проверяем только случаи когда бота добавляют как админа в группу
    const wasNotMember = ['left', 'kicked'].includes(oldStatus) || oldStatus === undefined;
    const isAdminNow = newStatus === 'administrator';
    const isGroup = chatType === 'group' || chatType === 'supergroup';

    if (wasNotMember && isAdminNow && isGroup) {
      logger.info(
        { chatId, chatTitle, chatType, addedBy: fromUser.id, addedByUsername: fromUser.username },
        'Bot added to group as admin - checking if this is a decade creation'
      );

      // 🛡️ Проверяем права администратора бота
      const botMember = update.new_chat_member;
      const canRestrictMembers = 'can_restrict_members' in botMember && botMember.can_restrict_members;
      const canInviteUsers = 'can_invite_users' in botMember && botMember.can_invite_users;

      if (!canRestrictMembers || !canInviteUsers) {
        logger.warn(
          { chatId, chatTitle, canRestrictMembers, canInviteUsers },
          'Bot does not have required admin permissions'
        );
        try {
          await ctx.api.sendMessage(
            chatId,
            `⚠️ У бота недостаточно прав для управления десяткой.\n\n` +
            `Необходимые права:\n` +
            `✅ Блокировка пользователей (${canRestrictMembers ? 'есть' : '❌ нет'})\n` +
            `✅ Приглашение по ссылке (${canInviteUsers ? 'есть' : '❌ нет'})\n\n` +
            `Пожалуйста, дайте боту эти права и добавьте снова.`
          );
          await ctx.api.leaveChat(chatId);
        } catch (leaveError) {
          logger.error({ error: leaveError, chatId }, 'Failed to leave chat after permission check');
        }
        return;
      }

      // 🔍 Проверяем статус лидера (3 сценария: clean/betrayal/return)
      const leaderStatus = await decadesService.checkLeaderDecadeStatus(fromUser.id, chatId);

      // Сценарий: NOT_LEADER - не лидер, покидаем чат
      if (leaderStatus.status === 'not_leader') {
        logger.warn(
          { chatId, chatTitle, fromUserId: fromUser.id, reason: leaderStatus.reason },
          'User is not a leader - leaving chat'
        );

        try {
          await ctx.api.sendMessage(
            chatId,
            `⚠️ Извините, но я не могу создать десятку в этом чате.\n\n` +
            `Причина: ${leaderStatus.reason || 'Вы не являетесь лидером или не выполнены условия создания десятки.'}\n\n` +
            `Чтобы стать лидером десятки, нужно:\n` +
            `1. Иметь активную подписку\n` +
            `2. Пройти тест лидера\n` +
            `3. Указать город в профиле`
          );
          await ctx.api.leaveChat(chatId);
        } catch (leaveError) {
          logger.error({ error: leaveError, chatId }, 'Failed to leave chat');
        }
        return;
      }

      // Сценарий: BETRAYAL - лидер пытается создать вторую десятку
      if (leaderStatus.status === 'betrayal') {
        logger.warn(
          {
            chatId,
            chatTitle,
            fromUserId: fromUser.id,
            existingDecade: leaderStatus.existingDecade?.id,
            existingChatId: leaderStatus.existingDecade?.tgChatId,
          },
          'Leader betrayal detected - already has active decade in another chat'
        );

        try {
          await ctx.api.sendMessage(
            chatId,
            `🚫 Ошибка! @${fromUser.username || fromUser.first_name}, ${leaderStatus.reason}.\n\n` +
            `Правило системы: 1 Лидер = 1 Чат.\n\n` +
            `Если вы хотите сменить чат десятки, сначала расформируйте текущую через поддержку.\n\n` +
            `Я покидаю эту группу.`
          );
          await ctx.api.leaveChat(chatId);
        } catch (leaveError) {
          logger.error({ error: leaveError, chatId }, 'Failed to leave chat after betrayal detection');
        }
        return;
      }

      // Сценарий: RETURN - лидер вернул бота в тот же чат (реактивация)
      if (leaderStatus.status === 'return' && leaderStatus.existingDecade) {
        logger.info(
          {
            chatId,
            chatTitle,
            fromUserId: fromUser.id,
            decadeId: leaderStatus.existingDecade.id,
          },
          'Leader returned bot to existing decade chat - reactivating'
        );

        try {
          // Реактивируем десятку если она была деактивирована
          if (!leaderStatus.existingDecade.isActive) {
            await decadesService.reactivateDecade(leaderStatus.existingDecade.id);
          }

          await ctx.api.sendMessage(
            chatId,
            `🤖 Я снова с вами! Продолжаем вести Десятку №${leaderStatus.existingDecade.number} города ${leaderStatus.existingDecade.city}.\n\n` +
            `👥 Участников: ${leaderStatus.existingDecade.currentMembers}/${leaderStatus.existingDecade.maxMembers}`
          );
        } catch (returnError) {
          logger.error({ error: returnError, chatId }, 'Failed to handle return scenario');
        }
        return;
      }

      // Сценарий: CLEAN - создаём новую десятку
      const result = await decadesService.createDecade(chatId, fromUser.id, chatTitle);

      if (result.success && result.decade) {
        logger.info(
          { chatId, decadeId: result.decade.id, city: result.decade.city, number: result.decade.number },
          'Decade created successfully'
        );

        await ctx.api.sendMessage(
          chatId,
          `🎉 Десятка №${result.decade.number} города ${result.decade.city} создана!\n\n` +
          `👥 Максимум участников: 11 (включая лидера)\n` +
          `📋 Участники будут распределяться автоматически\n\n` +
          `Ваша ссылка-приглашение:\n${result.decade.inviteLink || 'Будет создана позже'}\n\n` +
          `⚠️ Не забывайте отправлять еженедельный отчёт (светофор) по пятницам!`,
          { link_preview_options: { is_disabled: true } }
        );
      } else {
        logger.error({ chatId, error: result.error }, 'Failed to create decade');
        await ctx.api.sendMessage(
          chatId,
          `❌ Ошибка при создании десятки: ${result.error}\n\nПопробуйте снова или обратитесь к администратору.`
        );
        await ctx.api.leaveChat(chatId);
      }
    }

    // Если бота удалили из группы - деактивировать десятку
    if (newStatus === 'left' || newStatus === 'kicked') {
      logger.info({ chatId, chatTitle }, 'Bot removed from chat');

      // Деактивировать десятку если это была десятка
      try {
        const isDecade = await decadesService.isDecadeChat(chatId);
        if (isDecade) {
          await decadesService.deactivateDecade(chatId);
          logger.info({ chatId, chatTitle }, 'Decade deactivated after bot removal');
        }
      } catch (deactivateError) {
        logger.error({ error: deactivateError, chatId }, 'Failed to deactivate decade');
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error in my_chat_member handler');
  }
});

// 🔄 Обработчик миграции группы → супергруппы
// Telegram отправляет это сообщение когда группа мигрирует, содержит новый chat_id
bot.on('message:migrate_to_chat_id', async (ctx) => {
  try {
    const oldChatId = ctx.chat.id;
    const newChatId = ctx.message.migrate_to_chat_id;

    logger.info({ oldChatId, newChatId }, 'Chat migrated from group to supergroup');

    // Обновляем chat_id десятки если это десятка
    await decadesService.handleChatMigration(oldChatId, newChatId);
  } catch (error) {
    logger.error({ error, chatId: ctx.chat?.id }, 'Error handling chat migration');
  }
});

// Обработчик migrate_from_chat_id (вызывается в новом чате)
bot.on('message:migrate_from_chat_id', async (ctx) => {
  try {
    const newChatId = ctx.chat.id;
    const oldChatId = ctx.message.migrate_from_chat_id;

    logger.info({ oldChatId, newChatId }, 'Chat migration received in new supergroup');

    // На всякий случай дублируем — обновляем chat_id десятки
    await decadesService.handleChatMigration(oldChatId, newChatId);
  } catch (error) {
    logger.error({ error, chatId: ctx.chat?.id }, 'Error handling migrate_from_chat_id');
  }
});

// 📝 Обработчик изменения названия чата - обновляем в БД для десяток
bot.on('message:new_chat_title', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const newTitle = ctx.message.new_chat_title;

    if (!newTitle) return;

    logger.info({ chatId, newTitle }, 'Chat title changed');

    // Обновить название в БД если это десятка
    await decadesService.updateChatTitle(chatId, newTitle);
  } catch (error) {
    logger.error({ error, chatId: ctx.chat?.id }, 'Error handling new_chat_title');
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

    const wasNotMember = ['left', 'kicked', 'restricted'].includes(oldStatus) || oldStatus === undefined;
    const isMemberNow = ['member', 'administrator', 'creator'].includes(newStatus);
    const wasMember = ['member', 'administrator', 'creator'].includes(oldStatus);
    const isNotMemberNow = ['left', 'kicked'].includes(newStatus);

    // 📥 ВСТУПЛЕНИЕ: пользователь вступает (был не участником, стал участником)
    if (wasNotMember && isMemberNow) {
      logger.info({ chatId, userId, oldStatus, newStatus }, 'User joining chat, checking access...');

      // 🔟 Сначала проверяем десятки
      const decadeResult = await decadesService.handleDecadeJoinAttempt(chatId, userId);
      if (decadeResult.isDecadeChat) {
        // Это чат десятки - decadesService уже обработал (ban+unban если не разрешено)
        logger.info(
          { chatId, userId, allowed: decadeResult.allowed },
          'Decade chat join attempt handled'
        );
        return; // Не проверяем дальше - десятки имеют свою логику
      }

      // 🛡️ Обычная проверка подписки для каналов/чатов города
      await subscriptionGuardService.handleJoinAttempt(chatId, userId);
    }

    // 📤 ВЫХОД: пользователь выходит (был участником, стал left/kicked)
    if (wasMember && isNotMemberNow) {
      logger.info({ chatId, userId, oldStatus, newStatus }, 'User leaving chat, updating records...');

      // 🔟 Обработать выход из десятки (real-time sync)
      await decadesService.handleDecadeLeave(chatId, userId);
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
    async ({ body, headers, set, request }) => {
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
        // Handle update — fallback to request.json() if Elysia body parsing fails
        const update = body ?? await request.json().catch(() => null);
        if (!update || !update.update_id) {
          logger.warn({ hasBody: !!body, hasUpdate: !!update }, 'Webhook received empty or invalid update');
          return { ok: true }; // Return 200 to prevent Telegram retries
        }
        logger.info({ updateId: update.update_id }, 'Processing webhook update');
        await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
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
      body: t.Any(),
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
          allowed_updates: ['message', 'callback_query', 'inline_query', 'users_shared', 'chat_member', 'my_chat_member'],
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
