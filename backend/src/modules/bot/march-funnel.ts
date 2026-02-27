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
  // Картинки для типажей
  architektur: (n: number) => `https://t.me/mate_bot_open/${9983 + n}`,   // 9984-9990
  atmosphere:  (n: number) => `https://t.me/mate_bot_open/${9990 + n}`,   // 9991-9999
  leader:      (n: number) => `https://t.me/mate_bot_open/${9999 + n}`,   // 10000-10008
  master:      (n: number) => `https://t.me/mate_bot_open/${10008 + n}`,  // 10009-10017
  guardian:    (n: number) => `https://t.me/mate_bot_open/${10017 + n}`,  // 10018-10026
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

// Картинки типажей (выбираем первую из диапазона)
function getArchetypeImage(archetype: ArchetypeLabel): string {
  switch (archetype) {
    case 'Архитектор смысла':      return MEDIA.architektur(1);  // 9984
    case 'Создательница атмосферы': return MEDIA.atmosphere(1);  // 9991
    case 'Голос лидера':           return MEDIA.leader(1);       // 10000
    case 'Мастер реализации':      return MEDIA.master(1);       // 10009
    case 'Хранительница глубины':  return MEDIA.guardian(1);     // 10018
  }
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
  `<b>Вопрос 1/5</b>\n\nКак ты обычно создаёшь свой контент или продукты?\n\n` +
  `1️⃣ Строю чёткую систему с концепцией, структурой и смыслами\n` +
  `2️⃣ Создаю атмосферу — через образы, истории и ощущения\n` +
  `3️⃣ Говорю смело и прямо — веду за собой, влияю\n` +
  `4️⃣ Делаю, тестирую, довожу до результата — быстро и чётко\n` +
  `5️⃣ Погружаюсь глубоко, работаю с сутью, без спешки`,

  // Q2
  `<b>Вопрос 2/5</b>\n\nЧто чаще всего говорят о тебе клиенты или аудитория?\n\n` +
  `1️⃣ "Ты объясняешь сложное так, что всё встаёт на своё место"\n` +
  `2️⃣ "Рядом с тобой хочется остаться — создаёшь особую атмосферу"\n` +
  `3️⃣ "Ты вдохновляешь и заряжаешь энергией действовать"\n` +
  `4️⃣ "С тобой — результат. Всё конкретно и по делу"\n` +
  `5️⃣ "Ты видишь то, что другие не замечают. Глубоко и точно"`,

  // Q3
  `<b>Вопрос 3/5</b>\n\nКак ты принимаешь решения в работе?\n\n` +
  `1️⃣ Анализирую, выстраиваю логику, ищу концепцию\n` +
  `2️⃣ Доверяю ощущениям и красоте момента\n` +
  `3️⃣ Решаю быстро и уверенно — интуиция + опыт\n` +
  `4️⃣ Смотрю на цифры, результат, эффективность\n` +
  `5️⃣ Обдумываю долго, но решение получается мудрым и точным`,

  // Q4
  `<b>Вопрос 4/5</b>\n\nЧто тебе даётся легче всего в продвижении?\n\n` +
  `1️⃣ Писать — тексты, статьи, смыслы, структуру\n` +
  `2️⃣ Создавать визуал, съёмки, эстетику, настроение\n` +
  `3️⃣ Выступать, говорить, вести эфиры и сцену\n` +
  `4️⃣ Продавать, закрывать сделки, выстраивать воронки\n` +
  `5️⃣ Работать один на один, исследовать, создавать глубокий контент`,

  // Q5
  `<b>Вопрос 5/5</b>\n\nЧего тебе не хватает для выхода на новый уровень дохода?\n\n` +
  `1️⃣ Чёткой стратегии и системы монетизации\n` +
  `2️⃣ Большей аудитории, которая ценит то, что я создаю\n` +
  `3️⃣ Смелости заявить о себе громче и шире\n` +
  `4️⃣ Правильных инструментов и команды\n` +
  `5️⃣ Времени и пространства для глубокой работы`,
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

  let incomeBlock: string;
  if (income === 0) {
    incomeBlock = `\n💰 <b>Потенциал твоей модели: от ${formatNumber(potential)} ₽/мес</b> — это реальный ориентир для твоего типажа.\n`;
  } else {
    const efficiency = Math.round((income / potential) * 100);
    const gap = 100 - efficiency;
    incomeBlock =
      `\n📊 Твой текущий доход: <b>${formatNumber(income)} ₽/мес</b>\n` +
      `💰 Потенциал твоей модели: <b>${formatNumber(potential)} ₽/мес</b>\n` +
      `📉 Ты используешь <b>${efficiency}%</b> своего потенциала\n` +
      `🔓 Ты недозарабатываешь <b>${formatNumber(difference)} ₽</b> в месяц — это ${gap}% незапущенного ресурса\n`;
  }

  const archetypeTexts: Record<ArchetypeLabel, string> = {
    'Архитектор смысла':
      `✨ <b>Твой типаж — Архитектор смысла</b>\n\n` +
      `Ты создаёшь не просто контент — ты строишь системы. Люди приходят к тебе за ясностью, структурой и концепцией. Ты умеешь превращать сложное в понятное, хаос — в маршрут.\n\n` +
      `Твоя сила: глубина, смысл, интеллект.\n` +
      `Твоя точка роста: научиться продавать свою систему — дорого и уверенно.\n` +
      incomeBlock +
      `\n🚀 В клубе «КОД УСПЕХА» ты выстроишь модель монетизации своего смысла — и включишь тот самый потенциал, который уже есть внутри.`,

    'Создательница атмосферы':
      `✨ <b>Твой типаж — Создательница атмосферы</b>\n\n` +
      `Ты создаёшь мир, в который хочется войти. Люди остаются рядом с тобой, потому что рядом с тобой — красиво, тепло, по-настоящему. Ты продаёшь через ощущения.\n\n` +
      `Твоя сила: эстетика, доверие, среда.\n` +
      `Твоя точка роста: перевести атмосферу в систему дохода, не теряя себя.\n` +
      incomeBlock +
      `\n🚀 В клубе «КОД УСПЕХА» ты научишься монетизировать свой стиль и атмосферу — и раскроешь потенциал, который ждёт своего часа.`,

    'Голос лидера':
      `✨ <b>Твой типаж — Голос лидера</b>\n\n` +
      `Ты рождена вести за собой. Твои слова зажигают, твоя энергия заряжает, твоя уверенность двигает людей к действию. Ты — лицо, голос, сила.\n\n` +
      `Твоя сила: влияние, харизма, смелость.\n` +
      `Твоя точка роста: выстроить систему, которая работает даже без тебя 24/7.\n` +
      incomeBlock +
      `\n🚀 В клубе «КОД УСПЕХА» ты создашь масштабируемую модель дохода — и наконец заработаешь столько, сколько стоит твой уровень влияния.`,

    'Мастер реализации':
      `✨ <b>Твой типаж — Мастер реализации</b>\n\n` +
      `Ты не говоришь — ты делаешь. Результаты, конкретика, эффективность — это твой язык. Ты решаешь задачи там, где другие только думают.\n\n` +
      `Твоя сила: скорость, результат, надёжность.\n` +
      `Твоя точка роста: поднять чек и перестать продавать своё время — перейти на продукт.\n` +
      incomeBlock +
      `\n🚀 В клубе «КОД УСПЕХА» ты упакуешь свою экспертность в продукт с высоким чеком — и включишь потенциал, который ты уже заработала.`,

    'Хранительница глубины':
      `✨ <b>Твой типаж — Хранительница глубины</b>\n\n` +
      `Ты видишь суть там, где другие видят поверхность. Твоя работа — это трансформация, а не информация. Люди приходят к тебе за настоящим, глубоким, живым.\n\n` +
      `Твоя сила: глубина, интуиция, мудрость.\n` +
      `Твоя точка роста: стать видимой и дать своей глубине монетизацию.\n` +
      incomeBlock +
      `\n🚀 В клубе «КОД УСПЕХА» ты раскроешь модель, при которой глубина = деньги. Пора выйти из тени и зарабатывать на своей силе.`,
  };

  return archetypeTexts[archetype];
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
        `✨ Ты можешь вести блог <b>годами</b>. А можешь выстроить <b>модель, которая продаёт 💰</b>\n\n` +
        `За 5 вопросов мы определим твой архетип эксперта и покажем — сколько ты <b>реально можешь зарабатывать</b>, исходя из твоего типажа.\n\n` +
        `Это не просто тест. Это — зеркало твоего потенциала.\n\n` +
        `Готова увидеть цифры? 👇`,
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
        `<b>Вопрос 0/5</b>\n\n` +
        `Какой твой средний доход в месяц сейчас?\n\n` +
        `Введи цифру (например: <code>80000</code>) — это нужно, чтобы мы посчитали твой потенциал.\n\n` +
        `<i>Если ты пока не зарабатываешь на экспертизе — просто напиши 0 или пропусти (подождём 2 минуты).</i>`,
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
    `Спасибо 🤍 Записала твою текущую точку. Сейчас посмотрим, сколько ты недозарабатываешь.`,
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

    // Отправляем анимацию
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
  const img = getArchetypeImage(archetype);
  const paymentUrl = await buildPaymentUrl(telegramId);

  const keyboard = new InlineKeyboard()
    .webApp('💫 оформить подписку', paymentUrl);

  await getTelegramService().sendPhoto(chatId, img, {
    caption: resultText,
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
