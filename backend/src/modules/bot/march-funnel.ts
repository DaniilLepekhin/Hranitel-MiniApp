/**
 * 🌸 MARCH FUNNEL — Квиз-диагностика архетипа эксперта
 * Триггер: /start march (или /start march_...)
 *
 * Шаги:
 * 1. Сообщение-приветствие с кнопкой "начать диагностику"
 * 2. Вопрос о доходе (текстовый ввод или 2 мин таймаут)
 * 3. Подтверждение "спасибо"
 * 4-8. Вопросы Q1-Q5 (inline кнопки 1️⃣-5️⃣)
 * 9. Анимация 9983
 * 10. Через 5 сек — результат с типажом + кнопка оплаты
 */

import { InlineKeyboard } from 'grammy';
import { db } from '@/db';
import { users, paymentAnalytics } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { schedulerService } from '@/services/scheduler.service';
import { TelegramService } from '@/services/telegram.service';
import { logger } from '@/utils/logger';
import { redis } from '@/utils/redis';

// ============================================================================
// TELEGRAM SERVICE
// ============================================================================

let telegramService: TelegramService | null = null;

export function initMarchFunnelTelegramService(api: any) {
  telegramService = new TelegramService(api);
}

function getTelegramService(): TelegramService {
  if (!telegramService) {
    throw new Error('MarchFunnel: TelegramService not initialized');
  }
  return telegramService;
}

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

const WEBAPP_PURCHASE_URL = 'https://app.successkod.com/payment_form_club.html';
const INCOME_TIMEOUT_MS = 2 * 60 * 1000; // 2 минуты
const RESULT_DELAY_MS = 5 * 1000;        // 5 секунд

// Медиа-файлы
const MEDIA = {
  step1:     'https://t.me/mate_bot_open/9974',
  income:    'https://t.me/mate_bot_open/9976',
  q1:        'https://t.me/mate_bot_open/9977',
  q2:        'https://t.me/mate_bot_open/9978',
  q3:        'https://t.me/mate_bot_open/9979',
  q4:        'https://t.me/mate_bot_open/9980',
  q5:        'https://t.me/mate_bot_open/9981',
  animation: 'https://t.me/mate_bot_open/9983',
};

// Картинки типажей (массивы)
const ARCHETYPE_IMAGES: Record<string, string[]> = {
  'Архитектор смысла': [
    'https://t.me/mate_bot_open/9984',
    'https://t.me/mate_bot_open/9985',
    'https://t.me/mate_bot_open/9986',
    'https://t.me/mate_bot_open/9987',
    'https://t.me/mate_bot_open/9988',
    'https://t.me/mate_bot_open/9989',
    'https://t.me/mate_bot_open/9990',
  ],
  'Создательница атмосферы': [
    'https://t.me/mate_bot_open/9991',
    'https://t.me/mate_bot_open/9992',
    'https://t.me/mate_bot_open/9993',
    'https://t.me/mate_bot_open/9994',
    'https://t.me/mate_bot_open/9995',
    'https://t.me/mate_bot_open/9996',
    'https://t.me/mate_bot_open/9997',
    'https://t.me/mate_bot_open/9998',
    'https://t.me/mate_bot_open/9999',
  ],
  'Голос лидера': [
    'https://t.me/mate_bot_open/10000',
    'https://t.me/mate_bot_open/10001',
    'https://t.me/mate_bot_open/10002',
    'https://t.me/mate_bot_open/10003',
    'https://t.me/mate_bot_open/10004',
    'https://t.me/mate_bot_open/10005',
    'https://t.me/mate_bot_open/10006',
    'https://t.me/mate_bot_open/10007',
    'https://t.me/mate_bot_open/10008',
  ],
  'Мастер реализации': [
    'https://t.me/mate_bot_open/10009',
    'https://t.me/mate_bot_open/10010',
    'https://t.me/mate_bot_open/10011',
    'https://t.me/mate_bot_open/10012',
    'https://t.me/mate_bot_open/10013',
    'https://t.me/mate_bot_open/10014',
    'https://t.me/mate_bot_open/10015',
    'https://t.me/mate_bot_open/10016',
    'https://t.me/mate_bot_open/10017',
  ],
  'Хранительница глубины': [
    'https://t.me/mate_bot_open/10018',
    'https://t.me/mate_bot_open/10019',
    'https://t.me/mate_bot_open/10020',
    'https://t.me/mate_bot_open/10021',
    'https://t.me/mate_bot_open/10022',
    'https://t.me/mate_bot_open/10023',
    'https://t.me/mate_bot_open/10024',
    'https://t.me/mate_bot_open/10025',
    'https://t.me/mate_bot_open/10026',
  ],
};

// Коэффициенты типажей (ответ → типаж)
const ARCHETYPE_LABELS = [
  'Архитектор смысла',      // ответ 1
  'Создательница атмосферы', // ответ 2
  'Голос лидера',           // ответ 3
  'Мастер реализации',      // ответ 4
  'Хранительница глубины',  // ответ 5
] as const;

type ArchetypeLabel = typeof ARCHETYPE_LABELS[number];

const ARCHETYPE_COEFFICIENT: Record<ArchetypeLabel, number> = {
  'Архитектор смысла':      3.0,
  'Создательница атмосферы': 2.5,
  'Голос лидера':           4.0,
  'Мастер реализации':      3.5,
  'Хранительница глубины':  3.0,
};

// Все картинки типажа
function getArchetypeImages(archetype: ArchetypeLabel): string[] {
  return ARCHETYPE_IMAGES[archetype] ?? [];
}

// ============================================================================
// REDIS: хранение состояния воронки
// Ключ: march:state:{telegramId}
// Значение: JSON с полями: step, income, answers (5 ответов)
// TTL: 1 час
// ============================================================================

const STATE_TTL = 3600;
const STATE_PREFIX = 'march:state:';

interface MarchState {
  step: 'start' | 'awaiting_income' | 'awaiting_q1' | 'awaiting_q2' | 'awaiting_q3' | 'awaiting_q4' | 'awaiting_q5' | 'done';
  income: number;
  answers: number[]; // длина 0-5, каждый ответ 1-5
  chatId: number;
}

async function getState(telegramId: number): Promise<MarchState | null> {
  if (!redis) return null;
  const raw = await redis.get(`${STATE_PREFIX}${telegramId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MarchState;
  } catch {
    return null;
  }
}

async function setState(telegramId: number, state: MarchState): Promise<void> {
  if (!redis) return;
  await redis.setex(`${STATE_PREFIX}${telegramId}`, STATE_TTL, JSON.stringify(state));
}

async function clearState(telegramId: number): Promise<void> {
  if (!redis) return;
  await redis.del(`${STATE_PREFIX}${telegramId}`);
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/** Проверяем, является ли текст числом (доход) */
// ============================================================================
// АНАЛИТИКА — логируем каждый шаг квиза в payment_analytics
// ============================================================================

async function logMarchStep(telegramId: number, eventType: string): Promise<void> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, telegramId),
      columns: { metadata: true },
    });
    const meta = (user?.metadata as Record<string, unknown>) || {};
    const utmCampaign = (meta.utm_campaign as string) || 'march';
    const utmMedium   = (meta.utm_medium   as string) || null;
    const utmSource   = (meta.utm_source   as string) || null;

    await db.insert(paymentAnalytics).values({
      telegramId,
      eventType,
      utmCampaign,
      utmMedium:  utmMedium  === 'null' ? null : utmMedium,
      utmSource:  utmSource  === 'null' ? null : utmSource,
      metka: [utmCampaign, utmMedium, utmSource].filter(v => v && v !== 'null').join('_') || null,
    });
  } catch (e) {
    logger.warn({ error: e, telegramId, eventType }, 'MarchFunnel: failed to log step');
  }
}

export function parseMarchIncome(text: string): number | null {
  // Убираем пробелы, заменяем запятые на точки, убираем всё нецифровое кроме точки
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const val = parseFloat(cleaned);
  if (isNaN(val) || val < 0) return null;
  return Math.round(val);
}

/** Определяем типаж по массиву ответов (берём максимально встречающийся вариант) */
function calcArchetype(answers: number[]): ArchetypeLabel {
  const counts = [0, 0, 0, 0, 0]; // для ответов 1-5
  for (const a of answers) {
    if (a >= 1 && a <= 5) counts[a - 1]++;
  }
  let maxIdx = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[maxIdx]) maxIdx = i;
  }
  return ARCHETYPE_LABELS[maxIdx];
}

/** Формируем URL оплаты с UTM */
async function buildPaymentUrl(telegramId: number): Promise<string> {
  const url = new URL(WEBAPP_PURCHASE_URL);
  try {
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    if (user) {
      const meta = (user.metadata as any) || {};
      if (meta.utm_source)   url.searchParams.set('utm_source', meta.utm_source);
      if (meta.utm_medium)   url.searchParams.set('utm_medium', meta.utm_medium);
      if (meta.utm_campaign) url.searchParams.set('utm_campaign', meta.utm_campaign);
      if (meta.utm_content)  url.searchParams.set('utm_content', meta.utm_content);
      if (meta.utm_term)     url.searchParams.set('utm_term', meta.utm_term);
      url.searchParams.set('client_id', String(user.telegramId));
      if (user.username) url.searchParams.set('platform_id', user.username);
    }
  } catch (e) {
    logger.warn({ error: e }, 'MarchFunnel: failed to get user for payment URL');
  }
  return url.toString();
}

/** Кнопка с цифрами 1-5 */
function makeQuestionKeyboard(qNumber: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('1️⃣', `march_q${qNumber}_1`)
    .text('2️⃣', `march_q${qNumber}_2`)
    .text('3️⃣', `march_q${qNumber}_3`)
    .text('4️⃣', `march_q${qNumber}_4`)
    .text('5️⃣', `march_q${qNumber}_5`);
}

// ============================================================================
// ТЕКСТЫ ВОПРОСОВ
// ============================================================================

const QUESTION_TEXTS = [
  // Q1
  `<b>💫 вопрос 1 / 5 </b>\n\n<b>Что тебе ближе в ведении блога? 👇</b>\n\n` +
  `1️⃣ Объяснять сложное просто, структурировать\n` +
  `2️⃣ Делать красиво, атмосферно, через образ\n` +
  `3️⃣ Вести эфиры, вдохновлять, быть голосом\n` +
  `4️⃣ Давать конкретные шаги и инструкции\n` +
  `5️⃣ Сомневаться, но глубоко анализировать`,

  // Q2
  `<b>💫 вопрос 2 / 5 </b>\n\n<b>Как ты чаще продаёшь? 💬</b>\n\n` +
  `1️⃣ Через экспертные посты\n\n` +
  `2️⃣ Через личные истории\n\n` +
  `3️⃣ Через эфиры и прогрев\n\n` +
  `4️⃣ Через консультации / диагностики\n\n` +
  `5️⃣ Почти не продаю, стесняюсь`,

  // Q3
  `<b>💫 вопрос 3 / 5\n\nГде у тебя чаще всего затык? ⚡</b>\n\n` +
  `1️⃣ Нет чёткого оффера\n\n` +
  `2️⃣ Много контента, мало продаж\n\n` +
  `3️⃣ Нестабильные запуски / продажи\n\n` +
  `4️⃣ Страх продавать\n\n` +
  `5️⃣ Нет системы`,

  // Q4
  `<b>💫 Вопрос 4 / 5\n\nЧто тебе сейчас важнее? 🎯</b>\n\n` +
  `1️⃣ Стать узнаваемой\n\n` +
  `2️⃣ Выйти на стабильный доход\n\n` +
  `3️⃣ Запустить продукт\n\n` +
  `4️⃣ Масштабировать\n\n` +
  `5️⃣ Понять свою стратегию`,

  // Q5
  `<b>💫 Вопрос 5 / 5\n\nКак ты принимаешь решения в бизнесе? 🧠</b>\n\n` +
  `1️⃣ Сначала анализирую всё до деталей\n\n` +
  `2️⃣ Строю план и стратегию\n\n` +
  `3️⃣ Ориентируюсь на чувство и атмосферу\n\n` +
  `4️⃣ Действую быстро и через людей\n\n` +
  `5️⃣ Смотрю на результат и цифры`,
];

// ============================================================================
// ТЕКСТЫ РЕЗУЛЬТАТОВ
// ============================================================================

function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU');
}

function buildResultText(archetype: ArchetypeLabel, income: number): string {
  const coeff = ARCHETYPE_COEFFICIENT[archetype];
  const potential = Math.round(income * coeff);
  const difference = potential - income;
  const efficiency = income > 0 ? Math.round((income / potential) * 100) : 0;
  const gap = 100 - efficiency;

  const fmt = formatNumber;

  // Блок с цифрами (подставляется в каждый типаж)
  const moneyBlock = (coeff_str: string) => income === 0
    ? `Коэффициент твоего типажа: <b>×${coeff_str}</b>\n\n` +
      `Текущий доход:\n<b>0 ₽ / месяц</b>\n\n` +
      `Твой потенциальный доход:\n<b>от ${fmt(potential)} ₽ / месяц</b>\n\n` +
      `<b>🔥 Хочешь узнать, как включить этот потенциал?</b>`
    : `Коэффициент твоего типажа: <b>×${coeff_str}</b>\n\n` +
      `Текущий доход:\n<b>${fmt(income)} ₽ / месяц</b>\n\n` +
      `Твой потенциальный доход:\n<b>${fmt(potential)} ₽ / месяц</b>\n\n` +
      `Ты используешь сейчас:\n<b>${efficiency}%</b> своего потенциала.\n\n` +
      `Разница — это:\n<b>${fmt(difference)} ₽ в месяц</b>\n\n` +
      `<b>Это значит, что ${gap}% твоих возможностей пока не монетизируются.</b>`;

  const texts: Record<ArchetypeLabel, string> = {
    'Архитектор смысла':
      `<b>👑 ТИПАЖ: АРХИТЕКТОР СМЫСЛА</b>\n\n` +
      `Ты — не про шум 🔕\n` +
      `Ты — про структуру 🧩\n\n` +
      `Ты не можешь просто «вести блог».\n` +
      `Тебе нужно понимать:\n\n` +
      `— зачем 🎯\n` +
      `— для кого 👤\n` +
      `— по какой логике 🧠\n` +
      `— к какому результату 📈\n\n` +
      `Ты видишь систему там, где другие видят поток мыслей.\n` +
      `Ты умеешь соединять точки 🔗\n` +
      `Ты чувствуешь, когда в словах нет смысла.\n\n` +
      `И именно поэтому к тебе тянутся 🤍\n\n\n` +
      `<b>📊 ТВОЙ ДЕНЕЖНЫЙ ПОТЕНЦИАЛ</b>\n\n` +
      `Твой типаж — стратегический.\n\n` +
      `Это не про всплески ⚡\n` +
      `Это про системный рост 📈\n\n` +
      moneyBlock('3') + `\n\n` +
      `Это не "мечта".\n` +
      `Это логичная модель при включённой системе.\n\n` +
      `Ты не зарабатываешь меньше, чем можешь.\n` +
      `Ты зарабатываешь ровно настолько, насколько выстроена твоя система.\n\n` +
      `<b>🔥 Хочешь за 30 дней перестать усложнять и начать зарабатывать системно?</b>\n\n` +
      `<b>👇 ЖМИ, ЧТОБЫ УЗНАТЬ ПОШАГОВЫЙ ПЛАН👇</b>`,

    'Создательница атмосферы':
      `<b>🎨 ТИПАЖ: СОЗДАТЕЛЬНИЦА АТМОСФЕРЫ</b>\n\n` +
      `Ты — про ощущение ✨\n` +
      `Про энергию 🌿\n` +
      `Про состояние 🤍\n\n` +
      `Ты не продаёшь знания.\n` +
      `Ты создаёшь пространство, в которое хочется войти 🕯️\n\n` +
      `Люди идут к тебе не только за результатом.\n` +
      `Они идут за ощущением рядом с тобой 💫\n\n` +
      `И в этом — твоя сила.\n\n\n` +
      `<b>📊 ТВОЙ ДЕНЕЖНЫЙ ПОТЕНЦИАЛ</b>\n\n` +
      `Твой типаж — притягательный 💎\n\n` +
      moneyBlock('2.5') + `\n\n` +
      `Это те деньги, которые уходят\n` +
      `в «мне неудобно предложить» 🤍\n\n` +
      `А атмосфера без предложения\n` +
      `не превращается в стабильный доход.\n\n` +
      `<b>🔥 Хочешь за 30 дней перестать стесняться предложения и начать зарабатывать через свою энергию?\n\n` +
      `👇 ЖМИ, ЧТОБЫ УЗНАТЬ ПОШАГОВЫЙ ПЛАН👇</b>`,

    'Голос лидера':
      `<b>🎤 ТИПАЖ: ГОЛОС ЛИДЕРА</b>\n\n` +
      `Ты — не просто эксперт.\n` +
      `Ты — влияние 🔥\n\n` +
      `Ты умеешь говорить так, что за тобой идут.\n` +
      `Ты можешь собрать вокруг себя людей 👥\n` +
      `Ты заряжаешь ⚡\n\n` +
      `Ты не про «тихо делаю».\n` +
      `Ты про проявление 🎙\n\n` +
      `И когда ты в ресурсе —\n` +
      `всё начинает двигаться 🚀\n\n` +
      `<b>📊 ТВОЙ ДЕНЕЖНЫЙ ПОТЕНЦИАЛ</b>\n\n` +
      `Твой типаж — масштабный 💎\n` +
      moneyBlock('4') + `\n\n` +
      `Это те деньги, которые ты теряешь\n` +
      `из-за отсутствия повторяемой модели ⚙\n\n` +
      `Харизма без системы\n` +
      `не превращается в стабильный доход.\n\n` +
      `<b>🔥 Хочешь за 30 дней упаковать своё влияние в масштабируемую систему продаж?\n\n` +
      `👇 ЖМИ, ЧТОБЫ УЗНАТЬ ПОШАГОВЫЙ ПЛАН👇</b>`,

    'Мастер реализации':
      `<b>🔧 ТИПАЖ: МАСТЕР РЕАЛИЗАЦИИ</b>\n\n` +
      `Ты — не про разговоры.\n` +
      `Ты — про результат 🎯\n\n` +
      `Ты не вдохновляешь ради вдохновения.\n` +
      `Ты показываешь, <b>как сделать 🔎</b>\n\n` +
      `С тобой понятно.\n` +
      `С тобой конкретно.\n` +
      `С тобой по шагам 📌\n\n` +
      `И именно поэтому тебе доверяют 🤝\n\n` +
      `<b>📊 ТВОЙ ДЕНЕЖНЫЙ ПОТЕНЦИАЛ</b>\n\n` +
      `Твой типаж — продуктивный 💎\n` +
      moneyBlock('3.5') + `\n\n` +
      `Ты делаешь.\n` +
      `Но не всегда считаешь.\n\n` +
      `Это те деньги, которые ты теряешь\n` +
      `из-за отсутствия повторяемой модели ⚙\n\n` +
      `Полезность без упаковки\n` +
      `не превращается в масштабируемый доход.\n\n` +
      `Труд без стратегии\n` +
      `не даёт роста.\n\n` +
      `<b>🔥 Хочешь за 30 дней превратить свою практичность в систему, которая стабильно приносит деньги?\n\n` +
      `👇 ЖМИ, ЧТОБЫ УЗНАТЬ ПОШАГОВЫЙ ПЛАН 👇</b>`,

    'Хранительница глубины':
      `<b>🤍 ТИПАЖ: ХРАНИТЕЛЬНИЦА ГЛУБИНЫ</b>\n\n` +
      `Ты — не про громкость 🔕\n` +
      `Ты — про смысл ✨\n\n` +
      `Ты не выходишь "в люди" ради внимания.\n` +
      `Ты выходишь, когда есть что сказать 🎙\n\n` +
      `Ты чувствуешь глубже 🤍\n` +
      `Смотришь шире 🌊\n` +
      `Замечаешь то, что другие не видят 👁\n\n` +
      `И именно поэтому тебе доверяют самые внимательные.\n\n` +
      `<b>📊 ТВОЙ ДЕНЕЖНЫЙ ПОТЕНЦИАЛ</b>\n\n` +
      `Твой типаж — глубокий 💎\n` +
      moneyBlock('3') + `\n\n` +
      `Это те деньги, которые остаются\n` +
      `в «я ещё подумаю» 🤍\n\n` +
      `Глубина без позиции\n` +
      `не становится стабильным доходом.\n\n` +
      `<b>🔥 Хочешь за 30 дней перестать сомневаться и начать монетизировать свою глубину?\n\n` +
      `👇 ЖМИ, ЧТОБЫ УЗНАТЬ ПОШАГОВЫЙ ПЛАН 👇</b>`,
  };

  return texts[archetype];
}

// ============================================================================
// ШАГ 1 — Старт воронки
// ============================================================================

export async function startMarchFunnel(telegramId: number, chatId: number): Promise<void> {
  // Отменяем старые задачи march воронки
  await schedulerService.cancelUserTasksByTypes(telegramId, [
    'march_income_timeout',
    'march_result_delay',
  ]);

  // Сбрасываем состояние
  await setState(telegramId, {
    step: 'start',
    income: 0,
    answers: [],
    chatId,
  });

  const keyboard = new InlineKeyboard()
    .text('🔘 начать диагностику', 'march_start');

  await getTelegramService().sendPhoto(
    chatId,
    MEDIA.step1,
    {
      caption:
        `✨ Ты можешь вести блог <b>годами.</b>\n` +
        `А можешь выстроить <b>модель, которая продаёт 💰</b>\n\n` +
        `За <b>5 вопросов</b> ты узнаешь:\n\n` +
        `<b>— 🔎 какой ты архетип эксперта\n` +
        `— 🚀 через что тебе легче продавать\n` +
        `— 💸 твой потенциал дохода\n` +
        `— ⚠️ где ты теряешь деньги</b>\n\n` +
        `Готова увидеть свою реальную точку роста? 👇`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );

  logger.info({ telegramId, chatId }, 'MarchFunnel: step 1 sent');
}

// ============================================================================
// ШАГ 2 — Вопрос о доходе (после кнопки "начать диагностику")
// ============================================================================

export async function handleMarchStart(telegramId: number, chatId: number): Promise<void> {
  const state = await getState(telegramId);
  if (!state) {
    // Воронка не была инициализирована — запускаем заново
    await startMarchFunnel(telegramId, chatId);
    return;
  }

  await setState(telegramId, { ...state, step: 'awaiting_income', chatId });
  await logMarchStep(telegramId, 'march_q0'); // нажал «Начать»

  await getTelegramService().sendPhoto(
    chatId,
    MEDIA.income,
    {
      caption:
        `<b>💫 вопрос 0 / 5 \n\nКакой твой средний доход в месяц сейчас? 💰</b>\n\n` +
        `Напиши сумму цифрами (без пробелов и символов).\n\n` +
        `<u>Например: 150000</u>\n\n` +
        `<b>⚠ Важно: укажи реальный средний доход, а не желаемый.</b>`,
      parse_mode: 'HTML',
    }
  );

  // Планируем авто-переход через 2 минуты, если нет ввода
  await schedulerService.schedule(
    {
      type: 'march_income_timeout',
      userId: telegramId,
      chatId,
      data: {},
    },
    INCOME_TIMEOUT_MS
  );

  logger.info({ telegramId }, 'MarchFunnel: step 2 (income) sent, timeout scheduled');
}

// ============================================================================
// ОБРАБОТКА ТЕКСТОВОГО ВВОДА — доход
// ============================================================================

export async function handleMarchIncomeInput(telegramId: number, chatId: number, text: string): Promise<boolean> {
  const state = await getState(telegramId);
  if (!state || state.step !== 'awaiting_income') return false;

  const income = parseMarchIncome(text);
  if (income === null) {
    await getTelegramService().sendMessage(
      chatId,
      `❌ Пожалуйста, введи число (например: <code>50000</code>) или <code>0</code> если пока нет дохода.`,
      { parse_mode: 'HTML' }
    );
    return true; // обработали, но не продвинули
  }

  // Отменяем таймаут дохода
  await schedulerService.cancelUserTasksByType(telegramId, 'march_income_timeout');

  await setState(telegramId, { ...state, income, step: 'awaiting_q1' });
  await logMarchStep(telegramId, 'march_income'); // ввёл доход
  await sendIncomeAck(chatId);
  await sendQuestion(telegramId, chatId, 1, state);

  return true;
}

// ============================================================================
// ТАЙМАУТ ДОХОДА (автоматический переход)
// ============================================================================

export async function handleMarchIncomeTimeout(telegramId: number, chatId: number): Promise<void> {
  const state = await getState(telegramId);
  if (!state || state.step !== 'awaiting_income') return;

  await setState(telegramId, { ...state, income: 0, step: 'awaiting_q1' });
  await logMarchStep(telegramId, 'march_income'); // таймаут — income=0
  await sendIncomeAck(chatId);
  await sendQuestion(telegramId, chatId, 1, state);

  logger.info({ telegramId }, 'MarchFunnel: income timeout, proceeding with income=0');
}

// ============================================================================
// ПОДТВЕРЖДЕНИЕ ДОХОДА (шаг 3)
// ============================================================================

async function sendIncomeAck(chatId: number): Promise<void> {
  await getTelegramService().sendMessage(
    chatId,
    `Спасибо 🤍\nЗаписала твою текущую точку.\nСейчас посмотрим, сколько ты недозарабатываешь.`,
    { parse_mode: 'HTML' }
  );
}

// ============================================================================
// ВОПРОСЫ Q1-Q5
// ============================================================================

async function sendQuestion(telegramId: number, chatId: number, qNumber: number, _state: MarchState): Promise<void> {
  const imgKey = `q${qNumber}` as keyof typeof MEDIA;
  const img = MEDIA[imgKey] as string;
  const text = QUESTION_TEXTS[qNumber - 1];
  const keyboard = makeQuestionKeyboard(qNumber);

  await getTelegramService().sendPhoto(chatId, img, {
    caption: text,
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

export async function handleMarchAnswer(telegramId: number, chatId: number, qNumber: number, answer: number): Promise<void> {
  const state = await getState(telegramId);
  if (!state) return;

  const expectedStep = `awaiting_q${qNumber}` as MarchState['step'];
  if (state.step !== expectedStep) return;

  const newAnswers = [...state.answers, answer];
  await logMarchStep(telegramId, `march_q${qNumber}`); // Q1-Q5 ответил

  if (qNumber < 5) {
    const nextStep = `awaiting_q${qNumber + 1}` as MarchState['step'];
    await setState(telegramId, { ...state, answers: newAnswers, step: nextStep });
    await sendQuestion(telegramId, chatId, qNumber + 1, state);
  } else {
    // Все 5 вопросов отвечены — показываем анимацию и планируем результат
    await setState(telegramId, { ...state, answers: newAnswers, step: 'done' });

    // Отправляем анимацию (GIF)
    try {
      await getTelegramService().sendAnimation(chatId, MEDIA.animation);
    } catch (e) {
      logger.warn({ error: e }, 'MarchFunnel: failed to send animation');
    }

    // Через 5 секунд — результат
    await schedulerService.schedule(
      {
        type: 'march_result_delay',
        userId: telegramId,
        chatId,
        data: { answers: newAnswers, income: state.income },
      },
      RESULT_DELAY_MS
    );

    logger.info({ telegramId, answers: newAnswers, income: state.income }, 'MarchFunnel: all answers collected, result scheduled');
  }
}

// ============================================================================
// РЕЗУЛЬТАТ
// ============================================================================

export async function sendMarchResult(telegramId: number, chatId: number, answers: number[], income: number): Promise<void> {
  const archetype = calcArchetype(answers);
  const resultText = buildResultText(archetype, income);
  const images = getArchetypeImages(archetype);
  const paymentUrl = await buildPaymentUrl(telegramId);

  // 1. Отправляем медиагруппу (все картинки типажа)
  if (images.length > 0) {
    const mediaGroup = images.map(url => ({ type: 'photo' as const, media: url }));
    try {
      await getTelegramService().sendMediaGroup(chatId, mediaGroup);
    } catch (e) {
      logger.warn({ error: e, archetype }, 'MarchFunnel: failed to send media group, sending single photo');
      // Fallback: отправляем первую картинку
      await getTelegramService().sendPhoto(chatId, images[0], {});
    }
  }

  // 2. Отправляем текст с кнопкой оплаты
  const keyboard = new InlineKeyboard()
    .webApp('💫 оформить подписку', paymentUrl);

  await getTelegramService().sendMessage(chatId, resultText, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });

  await logMarchStep(telegramId, 'march_result'); // получил расшифровку архетипа

  // Очищаем состояние
  await clearState(telegramId);

  logger.info({ telegramId, archetype, income }, 'MarchFunnel: result sent');
}

// ============================================================================
// ПРОВЕРКА — находится ли пользователь в march воронке (для text handler)
// ============================================================================

export async function isUserInMarchFunnel(telegramId: number): Promise<boolean> {
  const state = await getState(telegramId);
  return state !== null && state.step === 'awaiting_income';
}
