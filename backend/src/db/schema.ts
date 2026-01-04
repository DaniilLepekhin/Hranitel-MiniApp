import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const courseCategoryEnum = pgEnum('course_category', ['mindset', 'spiritual', 'esoteric', 'health']);
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant']);

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
  streak: integer('streak').default(0).notNull(),
  lastActiveDate: timestamp('last_active_date'),

  // Subscription
  isPro: boolean('is_pro').default(false).notNull(),
  subscriptionExpires: timestamp('subscription_expires'),

  // Settings
  role: userRoleEnum('role').default('user').notNull(),
  settings: jsonb('settings').default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_telegram_id_idx').on(table.telegramId),
  index('users_level_idx').on(table.level),
]);

// Courses
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  category: courseCategoryEnum('category').default('mindset').notNull(),
  coverUrl: text('cover_url'),
  isPremium: boolean('is_premium').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('courses_category_idx').on(table.category),
  index('courses_sort_order_idx').on(table.sortOrder),
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  courseProgress: many(courseProgress),
  favorites: many(favorites),
  meditationHistory: many(meditationHistory),
  achievements: many(userAchievements),
  xpHistory: many(xpHistory),
  chatMessages: many(chatMessages),
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
