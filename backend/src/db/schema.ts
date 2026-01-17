import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
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

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: text('telegram_id').unique().notNull(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  photoUrl: text('photo_url'),
  languageCode: text('language_code').default('ru'),

  // Gamification
  level: integer('level').default(1).notNull(),
  experience: integer('experience').default(0).notNull(),
  energies: integer('energies').default(0).notNull(), // Энергии (вместо EP)
  streak: integer('streak').default(0).notNull(),
  lastActiveDate: timestamp('last_active_date'),

  // Subscription
  isPro: boolean('is_pro').default(false).notNull(),
  subscriptionExpires: timestamp('subscription_expires'),

  // Settings
  role: userRoleEnum('role').default('user').notNull(),
  settings: jsonb('settings').default({}),
  metadata: jsonb('metadata').default({}), // NEW: для metka и других данных из старой БД

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_telegram_id_idx').on(table.telegramId),
  index('users_level_idx').on(table.level),
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

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('energy_transactions_user_id_idx').on(table.userId),
  index('energy_transactions_created_at_idx').on(table.createdAt),
  index('energy_transactions_type_idx').on(table.type),
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

// Live Streams
export const liveStreams = pgTable('live_streams', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  scheduledAt: timestamp('scheduled_at').notNull(),
  streamUrl: text('stream_url'),
  host: text('host'), // Кристина, Продюсер, etc
  status: streamStatusEnum('status').default('scheduled').notNull(),
  epReward: integer('ep_reward').default(100).notNull(), // Награда за онлайн присутствие

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('live_streams_scheduled_at_idx').on(table.scheduledAt),
  index('live_streams_status_idx').on(table.status),
]);

// Stream Attendance
export const streamAttendance = pgTable('stream_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  streamId: uuid('stream_id').references(() => liveStreams.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  watchedOnline: boolean('watched_online').default(false).notNull(), // true если был онлайн
  energiesEarned: integer('energies_earned').default(0).notNull(),
}, (table) => [
  uniqueIndex('stream_attendance_stream_user_idx').on(table.streamId, table.userId),
  index('stream_attendance_user_id_idx').on(table.userId),
  index('stream_attendance_stream_id_idx').on(table.streamId),
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
  orderIndex: integer('order_index').default(0).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('content_items_type_idx').on(table.type),
  index('content_items_key_number_idx').on(table.keyNumber),
  index('content_items_month_program_idx').on(table.monthProgram),
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

export const liveStreamsRelations = relations(liveStreams, ({ many }) => ({
  attendance: many(streamAttendance),
}));

export const streamAttendanceRelations = relations(streamAttendance, ({ one }) => ({
  stream: one(liveStreams, {
    fields: [streamAttendance.streamId],
    references: [liveStreams.id],
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
export type LiveStream = typeof liveStreams.$inferSelect;
export type NewLiveStream = typeof liveStreams.$inferInsert;
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
