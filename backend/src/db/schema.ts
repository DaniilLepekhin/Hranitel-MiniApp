import { pgTable, uuid, text, integer, bigint, boolean, timestamp, pgEnum, jsonb, index, uniqueIndex, numeric, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const courseCategoryEnum = pgEnum('course_category', ['mindset', 'spiritual', 'esoteric', 'health']);
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant']);
export const energyTransactionTypeEnum = pgEnum('energy_transaction_type', ['income', 'expense']);
export const shopCategoryEnum = pgEnum('shop_category', ['elite', 'secret', 'savings']);
export const shopItemTypeEnum = pgEnum('shop_item_type', ['raffle_ticket', 'lesson', 'discount']);
export const streamStatusEnum = pgEnum('stream_status', ['scheduled', 'live', 'ended']);
export const contentTypeEnum = pgEnum('content_type', ['course', 'podcast', 'stream_record', 'practice']);
export const practiceContentTypeEnum = pgEnum('practice_content_type', ['markdown', 'html']);
export const clubFunnelStepEnum = pgEnum('club_funnel_step', [
  'start',
  'awaiting_ready',
  'awaiting_birthdate',
  'birthdate_confirmed',
  'showing_star',
  'showing_archetype',
  'awaiting_style_button',
  'showing_style',
  'awaiting_subscribe',
  'subscribed',
  'showing_scale',
  'awaiting_roadmap',
  'showing_roadmap',
  'awaiting_purchase',
  'completed',
  // Character test funnel steps
  'character_test_birthdate_confirmed',
  'character_test_showing_star',
  'character_test_archetype',
  'character_test_style',
  'character_test_scale',
  'character_test_complete'
]);

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).unique().notNull(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  photoUrl: text('photo_url'),
  languageCode: text('language_code').default('ru'),

  // Contact information
  email: text('email'), // Email из формы оплаты
  phone: text('phone'), // Телефон из формы оплаты

  // Geography
  city: text('city'), // Город пользователя для рейтингов и команд
  cityChatId: integer('city_chat_id'), // ID записи из city_chats_ik (старая БД)

  // Gamification
  level: integer('level').default(1).notNull(),
  experience: integer('experience').default(0).notNull(),
  energies: integer('energies').default(0).notNull(), // Энергии (вместо EP)
  streak: integer('streak').default(0).notNull(),
  lastActiveDate: timestamp('last_active_date'),

  // Subscription
  isPro: boolean('is_pro').default(false).notNull(),
  subscriptionExpires: timestamp('subscription_expires'),
  lavaContactId: text('lava_contact_id'), // Lava contact_id for subscription management
  autoRenewalEnabled: boolean('auto_renewal_enabled').default(true).notNull(), // Автопродление включено

  // 🆕 Onboarding & Gift subscription fields
  firstPurchaseDate: timestamp('first_purchase_date'), // Дата первой успешной покупки
  gifted: boolean('gifted').default(false).notNull(), // Подписка получена в подарок
  giftedBy: bigint('gifted_by', { mode: 'number' }), // tg_id дарителя
  onboardingStep: text('onboarding_step').$type<
    | 'awaiting_keyword'      // Ждет ввод кодового слова "УСПЕХ"
    | 'keyword_entered'       // Кодовое слово введено
    | 'awaiting_ready'        // Ждет нажатия кнопки "ГОТОВО"
    | 'onboarding_complete'   // Онбординг завершен
    | 'selecting_gift_user'   // Выбирает друга для подарка
    | null
  >(),

  // Ambassador
  isAmbassador: boolean('is_ambassador').default(false).notNull(),

  // Settings
  role: userRoleEnum('role').default('user').notNull(),
  settings: jsonb('settings').default({}),
  metadata: jsonb('metadata').default({}), // NEW: для metka и других данных из старой БД

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_telegram_id_idx').on(table.telegramId),
  index('users_level_idx').on(table.level),
  index('users_city_idx').on(table.city), // Индекс для рейтингов по городам
]);

// Courses (12 Keys)
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  category: courseCategoryEnum('category').default('mindset').notNull(),
  coverUrl: text('cover_url'),
  isPremium: boolean('is_premium').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),

  // NEW: 12 Keys system
  keyNumber: integer('key_number'), // 1-12
  monthTheme: text('month_theme'), // "Идентичность", "Ниша и смысл", etc
  unlockCondition: jsonb('unlock_condition').default({}), // Условия разблокировки

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('courses_category_idx').on(table.category),
  index('courses_sort_order_idx').on(table.sortOrder),
  index('courses_key_number_idx').on(table.keyNumber),
]);

// Course Days (lessons)
export const courseDays = pgTable('course_days', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  dayNumber: integer('day_number').notNull(),
  title: text('title').notNull(),
  content: text('content'),

  // Media
  audioUrl: text('audio_url'),
  videoUrl: text('video_url'),
  pdfUrl: text('pdf_url'),

  // Extended content
  welcomeContent: text('welcome_content'),
  courseInfo: text('course_info'),
  meditationGuide: text('meditation_guide'),
  additionalContent: text('additional_content'),
  giftContent: text('gift_content'),
  streamLink: text('stream_link'),

  isPremium: boolean('is_premium').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('course_days_course_id_idx').on(table.courseId),
  uniqueIndex('course_days_course_day_idx').on(table.courseId, table.dayNumber),
]);

// Course Progress
export const courseProgress = pgTable('course_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  currentDay: integer('current_day').default(1).notNull(),
  completedDays: jsonb('completed_days').default([]).$type<number[]>(),
  lastAccessedAt: timestamp('last_accessed_at').defaultNow().notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('course_progress_user_course_idx').on(table.userId, table.courseId),
  index('course_progress_user_id_idx').on(table.userId),
]);

// Favorites
export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('favorites_user_course_idx').on(table.userId, table.courseId),
  index('favorites_user_id_idx').on(table.userId),
]);

// Meditations
export const meditations = pgTable('meditations', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  duration: integer('duration').notNull(), // in seconds
  coverUrl: text('cover_url'),
  audioUrl: text('audio_url'),
  audioSeries: jsonb('audio_series').default([]).$type<{ title: string; url: string }[]>(),
  category: text('category').default('relaxation'),
  isPremium: boolean('is_premium').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('meditations_category_idx').on(table.category),
  index('meditations_sort_order_idx').on(table.sortOrder),
]);

// Meditation History
export const meditationHistory = pgTable('meditation_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  meditationId: uuid('meditation_id').references(() => meditations.id, { onDelete: 'cascade' }).notNull(),
  durationListened: integer('duration_listened').default(0).notNull(), // in seconds
  completed: boolean('completed').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('meditation_history_user_id_idx').on(table.userId),
  index('meditation_history_meditation_id_idx').on(table.meditationId),
]);

// Achievements
export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').unique().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  icon: text('icon'),
  xpReward: integer('xp_reward').default(0).notNull(),
  condition: jsonb('condition').default({}).$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// User Achievements
export const userAchievements = pgTable('user_achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  achievementId: uuid('achievement_id').references(() => achievements.id, { onDelete: 'cascade' }).notNull(),
  unlockedAt: timestamp('unlocked_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('user_achievements_user_achievement_idx').on(table.userId, table.achievementId),
  index('user_achievements_user_id_idx').on(table.userId),
]);

// XP History
export const xpHistory = pgTable('xp_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull(),
  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('xp_history_user_id_idx').on(table.userId),
  index('xp_history_created_at_idx').on(table.createdAt),
]);

// Chat Messages (AI)
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: chatRoleEnum('role').notNull(),
  content: text('content').notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('chat_messages_user_id_idx').on(table.userId),
  index('chat_messages_created_at_idx').on(table.createdAt),
]);

// ============================================================================
// NEW TABLES FOR КОД ДЕНЕГ 4.0
// ============================================================================

// Energy Points Transactions
export const energyTransactions = pgTable('energy_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  amount: integer('amount').notNull(),
  type: energyTransactionTypeEnum('type').notNull(), // income | expense
  reason: text('reason').notNull(), // "Просмотр урока", "Покупка билета", etc
  metadata: jsonb('metadata').default({}),

  // Срок жизни баллов — 6 месяцев (по документу "Геймификация")
  expiresAt: timestamp('expires_at'), // NULL = не истекает (для expense), дата = когда сгорит (для income)
  isExpired: boolean('is_expired').default(false).notNull(), // true = баллы просрочены (не удалены, можно восстановить)

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('energy_transactions_user_id_idx').on(table.userId),
  index('energy_transactions_created_at_idx').on(table.createdAt),
  index('energy_transactions_type_idx').on(table.type),
  index('energy_transactions_expires_idx').on(table.expiresAt),
]);

// Shop Items
export const shopItems = pgTable('shop_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  category: shopCategoryEnum('category').notNull(), // elite | secret | savings
  price: integer('price').notNull(), // в Energy Points
  imageUrl: text('image_url'),
  itemType: shopItemTypeEnum('item_type').notNull(), // raffle_ticket | lesson | discount
  itemData: jsonb('item_data').default({}), // Специфичные данные для типа товара
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('shop_items_category_idx').on(table.category),
  index('shop_items_sort_order_idx').on(table.sortOrder),
  index('shop_items_is_active_idx').on(table.isActive),
]);

// Shop Purchases
export const shopPurchases = pgTable('shop_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  itemId: uuid('item_id').references(() => shopItems.id, { onDelete: 'cascade' }).notNull(),
  price: integer('price').notNull(), // Цена на момент покупки
  status: text('status').default('completed').notNull(), // pending | completed | used

  purchasedAt: timestamp('purchased_at').defaultNow().notNull(),
  usedAt: timestamp('used_at'),
}, (table) => [
  index('shop_purchases_user_id_idx').on(table.userId),
  index('shop_purchases_item_id_idx').on(table.itemId),
  index('shop_purchases_status_idx').on(table.status),
]);

// Teams (Десятки)
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  metka: text('metka'), // art, relationship, etc
  cityChat: text('city_chat'), // Ссылка на чат города
  memberCount: integer('member_count').default(0).notNull(),
  maxMembers: integer('max_members').default(12).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('teams_metka_idx').on(table.metka),
]);

// Team Members
export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').default('member').notNull(), // member | leader

  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('team_members_team_user_idx').on(table.teamId, table.userId),
  index('team_members_user_id_idx').on(table.userId),
  index('team_members_team_id_idx').on(table.teamId),
]);

// Stream Recordings (записи прошедших эфиров)
export const streamRecordings = pgTable('stream_recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  recordedAt: timestamp('recorded_at').notNull(), // Дата проведения эфира
  videoUrl: text('video_url'), // Ссылка на запись
  host: text('host'), // Кристина, Продюсер, etc
  status: streamStatusEnum('status').default('scheduled').notNull(), // Оставлено для обратной совместимости
  energiesReward: integer('energies_reward').default(100).notNull(), // Награда за просмотр записи

  // Новые поля для записей
  duration: integer('duration'), // Длительность в секундах
  thumbnailUrl: text('thumbnail_url'), // Превью изображение
  viewsCount: integer('views_count').default(0).notNull(), // Количество просмотров
  category: text('category').default('general'), // general, meditation, practice, qa, workshop
  sortOrder: integer('sort_order').default(0).notNull(), // Порядок сортировки
  isPublished: boolean('is_published').default(true).notNull(), // Опубликована ли запись

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('stream_recordings_recorded_at_idx').on(table.recordedAt),
  index('stream_recordings_status_idx').on(table.status),
  index('stream_recordings_published_recorded_idx').on(table.isPublished, table.recordedAt),
  index('stream_recordings_sort_order_idx').on(table.sortOrder),
  index('stream_recordings_category_idx').on(table.category),
  index('stream_recordings_views_idx').on(table.viewsCount),
]);

// Stream Attendance (просмотры записей)
export const streamAttendance = pgTable('stream_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  streamId: uuid('stream_id').references(() => streamRecordings.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  watchedOnline: boolean('watched_online').default(false).notNull(), // true если смотрел
  energiesEarned: integer('energies_earned').default(0).notNull(),
}, (table) => [
  uniqueIndex('stream_attendance_recording_user_idx').on(table.streamId, table.userId),
  index('stream_attendance_user_id_idx').on(table.userId),
  index('stream_attendance_recording_id_idx').on(table.streamId),
]);

// Weekly Reports
export const weeklyReports = pgTable('weekly_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  weekNumber: integer('week_number').notNull(), // Номер недели в году
  content: text('content').notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  deadline: timestamp('deadline').notNull(), // Воскресенье 23:59 МСК
  energiesEarned: integer('energies_earned').default(100).notNull(),
}, (table) => [
  index('weekly_reports_user_id_idx').on(table.userId),
  index('weekly_reports_week_number_idx').on(table.weekNumber),
  uniqueIndex('weekly_reports_user_week_idx').on(table.userId, table.weekNumber),
]);

// User Keys (прогресс по 12 ключам)
export const userKeys = pgTable('user_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  keyNumber: integer('key_number').notNull(), // 1-12
  isUnlocked: boolean('is_unlocked').default(false).notNull(),
  unlockedAt: timestamp('unlocked_at'),
  progress: integer('progress').default(0).notNull(), // 0-100%
  completedAt: timestamp('completed_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('user_keys_user_key_idx').on(table.userId, table.keyNumber),
  index('user_keys_user_id_idx').on(table.userId),
  index('user_keys_key_number_idx').on(table.keyNumber),
]);

// ============================================================================
// CONTENT SYSTEM (Курсы, Подкасты, Эфиры, Практики)
// ============================================================================

// Content Items (универсальная таблица контента)
export const contentItems = pgTable('content_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: contentTypeEnum('type').notNull(), // course | podcast | stream_record | practice
  title: text('title').notNull(),
  description: text('description'),
  coverUrl: text('cover_url'),
  keyNumber: integer('key_number'), // 1-12, связь с ключами
  monthProgram: boolean('month_program').default(false), // программа месяца
  programMonth: varchar('program_month', { length: 7 }), // формат: 2026-02 (год-месяц)
  orderIndex: integer('order_index').default(0).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('content_items_type_idx').on(table.type),
  index('content_items_key_number_idx').on(table.keyNumber),
  index('content_items_month_program_idx').on(table.monthProgram),
  index('content_items_program_month_idx').on(table.programMonth),
  index('content_items_order_index_idx').on(table.orderIndex),
]);

// Content Sections (уроки внутри курса, эпизоды подкаста)
export const contentSections = pgTable('content_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  orderIndex: integer('order_index').default(0).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('content_sections_content_item_id_idx').on(table.contentItemId),
  index('content_sections_order_index_idx').on(table.orderIndex),
]);

// Videos (видео контент)
export const videos = pgTable('videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentSectionId: uuid('content_section_id').references(() => contentSections.id, { onDelete: 'cascade' }),
  contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'cascade' }), // для прямой связи с эфирами
  title: text('title').notNull(),
  description: text('description'),
  videoUrl: text('video_url').notNull(), // URL видео (YouTube, Vimeo, S3, etc.)
  rutubeUrl: text('rutube_url'), // RuTube альтернатива для России
  pdfUrl: text('pdf_url'), // Ссылка на презентацию/материалы
  durationSeconds: integer('duration_seconds'),
  thumbnailUrl: text('thumbnail_url'),
  orderIndex: integer('order_index').default(0).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('videos_content_section_id_idx').on(table.contentSectionId),
  index('videos_content_item_id_idx').on(table.contentItemId),
  index('videos_order_index_idx').on(table.orderIndex),
]);

// Video Timecodes (таймкоды для видео)
export const videoTimecodes = pgTable('video_timecodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  videoId: uuid('video_id').references(() => videos.id, { onDelete: 'cascade' }).notNull(),
  timeSeconds: integer('time_seconds').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  orderIndex: integer('order_index').default(0).notNull(),
}, (table) => [
  index('video_timecodes_video_id_idx').on(table.videoId),
  index('video_timecodes_order_index_idx').on(table.orderIndex),
]);

// User Content Progress (прогресс пользователя по видео)
export const userContentProgress = pgTable('user_content_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'cascade' }),
  videoId: uuid('video_id').references(() => videos.id, { onDelete: 'cascade' }),
  watched: boolean('watched').default(false),
  watchTimeSeconds: integer('watch_time_seconds').default(0), // сколько секунд просмотрел
  completedAt: timestamp('completed_at'),
  energiesEarned: integer('energies_earned').default(0), // сколько EP заработал

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('user_content_progress_user_video_idx').on(table.userId, table.videoId),
  index('user_content_progress_user_id_idx').on(table.userId),
  index('user_content_progress_content_item_id_idx').on(table.contentItemId),
]);

// Practice Content (текстовый контент практик)
export const practiceContent = pgTable('practice_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentItemId: uuid('content_item_id').references(() => contentItems.id, { onDelete: 'cascade' }).notNull(),
  contentType: practiceContentTypeEnum('content_type').notNull(), // markdown | html
  content: text('content').notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('practice_content_content_item_id_idx').on(table.contentItemId),
]);

// 🆕 Payments (платежи)
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('RUB'),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, completed, failed, refunded
  paymentProvider: varchar('payment_provider', { length: 50 }),
  externalPaymentId: varchar('external_payment_id', { length: 255 }),
  lavaContactId: text('lava_contact_id'), // Lava contact_id for subscription management

  // Contact information (из формы оплаты)
  name: text('name'), // Имя из формы
  email: text('email'), // Email из формы
  phone: text('phone'), // Телефон из формы

  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('payments_user_id_idx').on(table.userId),
  index('payments_status_idx').on(table.status),
  index('payments_external_id_idx').on(table.externalPaymentId),
  index('payments_created_at_idx').on(table.createdAt),
  index('payments_lava_contact_id_idx').on(table.lavaContactId),
]);

// 🆕 Payment Analytics (аналитика платежей и форм)
export const paymentAnalytics = pgTable('payment_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(), // TG ID пользователя
  eventType: varchar('event_type', { length: 50 }).notNull(), // form_open, payment_attempt, payment_success

  // UTM метки
  utmCampaign: text('utm_campaign'),
  utmMedium: text('utm_medium'),
  utmSource: text('utm_source'),
  utmContent: text('utm_content'),
  clientId: text('client_id'),
  metka: text('metka'), // Уникальная комбинация utm_campaign_utm_medium

  // Payment data (для payment_attempt и payment_success)
  paymentMethod: varchar('payment_method', { length: 10 }), // RUB, USD, EUR
  amount: numeric('amount', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 3 }),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),

  // Contact data (из формы оплаты)
  name: text('name'), // Имя из формы
  email: text('email'), // Email из формы
  phone: text('phone'), // Телефон из формы

  // Additional data
  metadata: jsonb('metadata').default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('payment_analytics_telegram_id_idx').on(table.telegramId),
  index('payment_analytics_event_type_idx').on(table.eventType),
  index('payment_analytics_metka_idx').on(table.metka),
  index('payment_analytics_utm_campaign_idx').on(table.utmCampaign),
  index('payment_analytics_payment_method_idx').on(table.paymentMethod),
  index('payment_analytics_created_at_idx').on(table.createdAt),
  index('payment_analytics_metka_event_idx').on(table.metka, table.eventType),
]);

// 🆕 Gift Subscriptions (подарочные подписки)
export const giftSubscriptions = pgTable('gift_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  gifterUserId: uuid('gifter_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // Кто дарит
  recipientTgId: integer('recipient_tg_id').notNull(), // Кому дарят (tg_id)
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }), // Связь с оплатой
  activated: boolean('activated').default(false).notNull(), // Активирован ли подарок
  activationToken: text('activation_token').notNull().unique(), // Уникальный токен для ссылки
  createdAt: timestamp('created_at').defaultNow().notNull(),
  activatedAt: timestamp('activated_at'), // Когда активирован
}, (table) => [
  index('gift_subscriptions_recipient_tg_id_idx').on(table.recipientTgId),
  index('gift_subscriptions_activation_token_idx').on(table.activationToken),
  index('gift_subscriptions_activated_idx').on(table.activated),
]);

// 🆕 Subscription History (история подписок для аналитики продлений/отписок)
export const subscriptionHistory = pgTable('subscription_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),

  // Event data
  eventType: varchar('event_type', { length: 20 }).notNull(), // 'activated' | 'renewed' | 'expired' | 'cancelled'

  // Subscription period
  periodStart: timestamp('period_start').notNull(), // Начало периода подписки
  periodEnd: timestamp('period_end').notNull(), // Конец периода подписки

  // Payment data
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  amount: numeric('amount', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 3 }).default('RUB'),

  // Source tracking
  source: varchar('source', { length: 50 }), // 'lava', 'manual', 'gift', 'migration'

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('subscription_history_user_id_idx').on(table.userId),
  index('subscription_history_telegram_id_idx').on(table.telegramId),
  index('subscription_history_event_type_idx').on(table.eventType),
  index('subscription_history_period_end_idx').on(table.periodEnd),
  index('subscription_history_created_at_idx').on(table.createdAt),
]);

// 🆕 Club Funnel Progress (воронка клуба - нумерология)
export const clubFunnelProgress = pgTable('club_funnel_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),

  // Birthdate data
  birthDate: text('birth_date'), // Format: DD.MM.YYYY
  birthDayNumber: integer('birth_day_number'), // 1-31 (день рождения)
  archetypeNumber: integer('archetype_number'), // 1-22 (номер архетипа богини)
  chislo: integer('chislo'), // Число от webhook для условной логики сообщений

  // Progress tracking
  currentStep: clubFunnelStepEnum('current_step').default('start').notNull(),
  subscribedToChannel: boolean('subscribed_to_channel').default(false),

  // Test mode flags
  isTestMode: boolean('is_test_mode').default(false), // Ускоренные таймеры
  ignoreIsPro: boolean('ignore_is_pro').default(false), // Игнорировать isPro для тестирования

  // Metadata
  starImageUrl: text('star_image_url'), // URL изображения звезды от webhook

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('club_funnel_progress_user_id_idx').on(table.userId),
  index('club_funnel_progress_telegram_id_idx').on(table.telegramId),
  index('club_funnel_progress_current_step_idx').on(table.currentStep),
]);

// 🆕 Leader Test Closed Cities (закрытые города для теста)
export const leaderTestClosedCities = pgTable('leader_test_closed_cities', {
  id: uuid('id').primaryKey().defaultRandom(),
  city: text('city').notNull().unique(), // Название города (точное совпадение)
  reason: text('reason'), // Причина закрытия (опционально)
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('leader_test_closed_cities_city_idx').on(table.city),
]);

// 🆕 Leader Test City Quotas (квоты на успешные прохождения по городам)
export const leaderTestCityQuotas = pgTable('leader_test_city_quotas', {
  id: uuid('id').primaryKey().defaultRandom(),
  city: text('city').notNull().unique(), // Название города
  maxPassed: integer('max_passed').notNull(), // Максимум успешных прохождений
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('leader_test_city_quotas_city_idx').on(table.city),
]);

// 🆕 Leader Test Starts (трекинг открытия теста)
export const leaderTestStarts = pgTable('leader_test_starts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),
  city: text('city'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('leader_test_starts_user_id_idx').on(table.userId),
  index('leader_test_starts_telegram_id_idx').on(table.telegramId),
  index('leader_test_starts_created_at_idx').on(table.createdAt),
]);

// 🆕 Leader Test Results (результаты теста на Лидера десятки)
export const leaderTestResults = pgTable('leader_test_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),

  // Test results
  passed: boolean('passed').notNull(),
  score: integer('score').notNull(), // Количество правильных ответов
  totalQuestions: integer('total_questions').notNull(),
  stopReason: text('stop_reason'), // Если провален из-за стоп-ответа

  // Answers (JSON array of answer objects)
  answers: jsonb('answers').notNull(), // [{questionId: 1, selectedOptions: ['1a', '1b']}]

  // User context at time of test
  city: text('city'),

  // 🔟 Decades integration
  canLeadDecade: boolean('can_lead_decade').default(false).notNull(), // Разрешено ли создавать десятку
  decadeId: uuid('decade_id'), // Какую десятку ведёт (null если ещё не создал)

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('leader_test_results_user_id_idx').on(table.userId),
  index('leader_test_results_telegram_id_idx').on(table.telegramId),
  index('leader_test_results_passed_idx').on(table.passed),
  index('leader_test_results_created_at_idx').on(table.createdAt),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  courseProgress: many(courseProgress),
  favorites: many(favorites),
  meditationHistory: many(meditationHistory),
  achievements: many(userAchievements),
  xpHistory: many(xpHistory),
  chatMessages: many(chatMessages),
  // NEW relations
  energyTransactions: many(energyTransactions),
  shopPurchases: many(shopPurchases),
  teamMemberships: many(teamMembers),
  streamAttendance: many(streamAttendance),
  weeklyReports: many(weeklyReports),
  userKeys: many(userKeys),
  userContentProgress: many(userContentProgress),
  clubFunnelProgress: many(clubFunnelProgress),
  subscriptionHistory: many(subscriptionHistory),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  days: many(courseDays),
  progress: many(courseProgress),
  favorites: many(favorites),
}));

export const courseDaysRelations = relations(courseDays, ({ one }) => ({
  course: one(courses, {
    fields: [courseDays.courseId],
    references: [courses.id],
  }),
}));

export const courseProgressRelations = relations(courseProgress, ({ one }) => ({
  user: one(users, {
    fields: [courseProgress.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [courseProgress.courseId],
    references: [courses.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [favorites.courseId],
    references: [courses.id],
  }),
}));

export const meditationsRelations = relations(meditations, ({ many }) => ({
  history: many(meditationHistory),
}));

export const meditationHistoryRelations = relations(meditationHistory, ({ one }) => ({
  user: one(users, {
    fields: [meditationHistory.userId],
    references: [users.id],
  }),
  meditation: one(meditations, {
    fields: [meditationHistory.meditationId],
    references: [meditations.id],
  }),
}));

export const achievementsRelations = relations(achievements, ({ many }) => ({
  userAchievements: many(userAchievements),
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, {
    fields: [userAchievements.userId],
    references: [users.id],
  }),
  achievement: one(achievements, {
    fields: [userAchievements.achievementId],
    references: [achievements.id],
  }),
}));

export const xpHistoryRelations = relations(xpHistory, ({ one }) => ({
  user: one(users, {
    fields: [xpHistory.userId],
    references: [users.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
}));

// NEW Relations
export const energyTransactionsRelations = relations(energyTransactions, ({ one }) => ({
  user: one(users, {
    fields: [energyTransactions.userId],
    references: [users.id],
  }),
}));

export const shopItemsRelations = relations(shopItems, ({ many }) => ({
  purchases: many(shopPurchases),
}));

export const shopPurchasesRelations = relations(shopPurchases, ({ one }) => ({
  user: one(users, {
    fields: [shopPurchases.userId],
    references: [users.id],
  }),
  item: one(shopItems, {
    fields: [shopPurchases.itemId],
    references: [shopItems.id],
  }),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const streamRecordingsRelations = relations(streamRecordings, ({ many }) => ({
  attendance: many(streamAttendance),
}));

export const streamAttendanceRelations = relations(streamAttendance, ({ one }) => ({
  recording: one(streamRecordings, {
    fields: [streamAttendance.streamId],
    references: [streamRecordings.id],
  }),
  user: one(users, {
    fields: [streamAttendance.userId],
    references: [users.id],
  }),
}));

export const weeklyReportsRelations = relations(weeklyReports, ({ one }) => ({
  user: one(users, {
    fields: [weeklyReports.userId],
    references: [users.id],
  }),
}));

export const userKeysRelations = relations(userKeys, ({ one }) => ({
  user: one(users, {
    fields: [userKeys.userId],
    references: [users.id],
  }),
}));

// Content System Relations
export const contentItemsRelations = relations(contentItems, ({ many }) => ({
  sections: many(contentSections),
  videos: many(videos),
  practiceContent: many(practiceContent),
  userProgress: many(userContentProgress),
}));

export const contentSectionsRelations = relations(contentSections, ({ one, many }) => ({
  contentItem: one(contentItems, {
    fields: [contentSections.contentItemId],
    references: [contentItems.id],
  }),
  videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  contentSection: one(contentSections, {
    fields: [videos.contentSectionId],
    references: [contentSections.id],
  }),
  contentItem: one(contentItems, {
    fields: [videos.contentItemId],
    references: [contentItems.id],
  }),
  timecodes: many(videoTimecodes),
  userProgress: many(userContentProgress),
}));

export const videoTimecodesRelations = relations(videoTimecodes, ({ one }) => ({
  video: one(videos, {
    fields: [videoTimecodes.videoId],
    references: [videos.id],
  }),
}));

export const userContentProgressRelations = relations(userContentProgress, ({ one }) => ({
  user: one(users, {
    fields: [userContentProgress.userId],
    references: [users.id],
  }),
  contentItem: one(contentItems, {
    fields: [userContentProgress.contentItemId],
    references: [contentItems.id],
  }),
  video: one(videos, {
    fields: [userContentProgress.videoId],
    references: [videos.id],
  }),
}));

export const practiceContentRelations = relations(practiceContent, ({ one }) => ({
  contentItem: one(contentItems, {
    fields: [practiceContent.contentItemId],
    references: [contentItems.id],
  }),
}));

export const clubFunnelProgressRelations = relations(clubFunnelProgress, ({ one }) => ({
  user: one(users, {
    fields: [clubFunnelProgress.userId],
    references: [users.id],
  }),
}));

export const subscriptionHistoryRelations = relations(subscriptionHistory, ({ one }) => ({
  user: one(users, {
    fields: [subscriptionHistory.userId],
    references: [users.id],
  }),
  payment: one(payments, {
    fields: [subscriptionHistory.paymentId],
    references: [payments.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseDay = typeof courseDays.$inferSelect;
export type NewCourseDay = typeof courseDays.$inferInsert;
export type CourseProgress = typeof courseProgress.$inferSelect;
export type Meditation = typeof meditations.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;

// NEW Types
export type EnergyTransaction = typeof energyTransactions.$inferSelect;
export type NewEnergyTransaction = typeof energyTransactions.$inferInsert;
export type ShopItem = typeof shopItems.$inferSelect;
export type NewShopItem = typeof shopItems.$inferInsert;
export type ShopPurchase = typeof shopPurchases.$inferSelect;
export type NewShopPurchase = typeof shopPurchases.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type LiveStream = typeof streamRecordings.$inferSelect;
export type NewLiveStream = typeof streamRecordings.$inferInsert;
export type StreamAttendance = typeof streamAttendance.$inferSelect;
export type NewStreamAttendance = typeof streamAttendance.$inferInsert;
export type WeeklyReport = typeof weeklyReports.$inferSelect;
export type NewWeeklyReport = typeof weeklyReports.$inferInsert;
export type UserKey = typeof userKeys.$inferSelect;
export type NewUserKey = typeof userKeys.$inferInsert;

// Content System Types
export type ContentItem = typeof contentItems.$inferSelect;
export type NewContentItem = typeof contentItems.$inferInsert;
export type ContentSection = typeof contentSections.$inferSelect;
export type NewContentSection = typeof contentSections.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type VideoTimecode = typeof videoTimecodes.$inferSelect;
export type NewVideoTimecode = typeof videoTimecodes.$inferInsert;
export type UserContentProgress = typeof userContentProgress.$inferSelect;
export type NewUserContentProgress = typeof userContentProgress.$inferInsert;
export type PracticeContent = typeof practiceContent.$inferSelect;
export type NewPracticeContent = typeof practiceContent.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentAnalytics = typeof paymentAnalytics.$inferSelect;
export type NewPaymentAnalytics = typeof paymentAnalytics.$inferInsert;
export type GiftSubscription = typeof giftSubscriptions.$inferSelect;
export type NewGiftSubscription = typeof giftSubscriptions.$inferInsert;
export type ClubFunnelProgress = typeof clubFunnelProgress.$inferSelect;
export type NewClubFunnelProgress = typeof clubFunnelProgress.$inferInsert;
export type SubscriptionHistory = typeof subscriptionHistory.$inferSelect;
export type NewSubscriptionHistory = typeof subscriptionHistory.$inferInsert;

// ============================================================================
// DECADES SYSTEM (Десятки)
// ============================================================================

// Decades (Десятки) - чаты для групп участников по 10 человек + лидер
export const decades = pgTable('decades', {
  id: uuid('id').primaryKey().defaultRandom(),
  city: text('city').notNull(), // Город десятки
  number: integer('number').notNull(), // Номер десятки в рамках города (1, 2, 3...)
  tgChatId: bigint('tg_chat_id', { mode: 'number' }).unique(), // Telegram Chat ID
  inviteLink: text('invite_link'), // Пригласительная ссылка
  leaderUserId: uuid('leader_user_id').references(() => users.id), // UUID лидера
  leaderTelegramId: bigint('leader_telegram_id', { mode: 'number' }).notNull(), // Telegram ID лидера
  chatTitle: text('chat_title'), // Название чата (опционально)

  // Счётчики участников
  currentMembers: integer('current_members').default(1).notNull(), // Текущее кол-во (включая лидера)
  maxMembers: integer('max_members').default(11).notNull(), // Макс участников (10 + лидер = 11)

  // Статусы
  isActive: boolean('is_active').default(true).notNull(), // Активна ли десятка
  isFull: boolean('is_full').default(false).notNull(), // Заполнена ли (current >= max)
  isAvailableForDistribution: boolean('is_available_for_distribution').default(false).notNull(), // Доступна ли для автоматического распределения (по умолчанию false - лидер должен активировать)

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('decades_city_number_unique').on(table.city, table.number),
  index('decades_city_idx').on(table.city),
  index('decades_leader_telegram_idx').on(table.leaderTelegramId),
  index('decades_tg_chat_idx').on(table.tgChatId),
]);

// Decade Members (Участники десяток)
export const decadeMembers = pgTable('decade_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  decadeId: uuid('decade_id').references(() => decades.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(), // Для быстрых проверок без JOIN
  isLeader: boolean('is_leader').default(false).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'), // NULL = активный участник
}, (table) => [
  index('decade_members_decade_idx').on(table.decadeId),
  index('decade_members_user_idx').on(table.userId),
  index('decade_members_telegram_idx').on(table.telegramId),
]);

// Leader Reports (Светофор) - еженедельные отчёты лидеров
export const leaderReports = pgTable('leader_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaderUserId: uuid('leader_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  decadeId: uuid('decade_id').references(() => decades.id, { onDelete: 'cascade' }).notNull(),
  weekStart: timestamp('week_start').notNull(), // Понедельник недели
  weekNumber: integer('week_number').notNull(), // Номер недели в году
  year: integer('year').notNull(), // Год

  // Статус: green = всё ок, red = есть проблема
  status: text('status').notNull(), // 'green' | 'red'
  problemDescription: text('problem_description'), // Обязательно при status='red'

  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('leader_reports_unique_weekly').on(table.decadeId, table.weekStart),
  index('leader_reports_leader_idx').on(table.leaderUserId),
  index('leader_reports_decade_idx').on(table.decadeId),
  index('leader_reports_week_idx').on(table.year, table.weekNumber),
]);

// Relations для Decades System
export const decadesRelations = relations(decades, ({ one, many }) => ({
  leader: one(users, {
    fields: [decades.leaderUserId],
    references: [users.id],
  }),
  members: many(decadeMembers),
  reports: many(leaderReports),
}));

export const decadeMembersRelations = relations(decadeMembers, ({ one }) => ({
  decade: one(decades, {
    fields: [decadeMembers.decadeId],
    references: [decades.id],
  }),
  user: one(users, {
    fields: [decadeMembers.userId],
    references: [users.id],
  }),
}));

export const leaderReportsRelations = relations(leaderReports, ({ one }) => ({
  leader: one(users, {
    fields: [leaderReports.leaderUserId],
    references: [users.id],
  }),
  decade: one(decades, {
    fields: [leaderReports.decadeId],
    references: [decades.id],
  }),
}));

// Decades Types
export type Decade = typeof decades.$inferSelect;
export type NewDecade = typeof decades.$inferInsert;
export type DecadeMember = typeof decadeMembers.$inferSelect;
export type NewDecadeMember = typeof decadeMembers.$inferInsert;
export type LeaderReport = typeof leaderReports.$inferSelect;
export type NewLeaderReport = typeof leaderReports.$inferInsert;

// ============================================================================
// User Sessions (Time in App tracking)
// ============================================================================

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),
  sessionId: text('session_id').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
  pagesVisited: integer('pages_visited').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_user_sessions_user_id').on(table.userId),
  index('idx_user_sessions_telegram_id').on(table.telegramId),
  index('idx_user_sessions_created_at').on(table.createdAt),
]);

// User Sessions Relations
export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

// User Sessions Types
export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
