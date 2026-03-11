// Подавляем TimeoutNegativeWarning из postgres.js (баг библиотеки, не влияет на работу)
process.on('warning', (warning) => {
  if (warning.name === 'TimeoutNegativeWarning') return;
  console.warn(warning);
});

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { cookie } from '@elysiajs/cookie';

import { config, isDevelopment } from '@/config';
import { logger, logRequest } from '@/utils/logger';
import { redis, cache, closeRedisConnection } from '@/utils/redis';
import { db, closeDatabaseConnection } from '@/db';
import { users } from '@/db/schema';
import { errorHandler } from '@/middlewares/errorHandler';

// 🆕 Professional middlewares (senior-level)
import { authRateLimiter, paymentRateLimiter } from '@/middlewares/rate-limiter';
import { securityHeaders, apiSecurityHeaders } from '@/middlewares/security-headers';
import { auditLogger } from '@/middlewares/audit-logger';
import { hotCache, userCache } from '@/middlewares/cache';
import { metricsMiddleware, metricsEndpoint } from '@/middlewares/metrics';

// Modules
import { authModule } from '@/modules/auth';
import { usersModule } from '@/modules/users';
import { coursesModule } from '@/modules/courses';
import { meditationsModule } from '@/modules/meditations';
import { gamificationModule } from '@/modules/gamification';
// AI and Bot modules disabled - not needed for webapp-only deployment
// import { aiModule } from '@/modules/ai';
import { botModule } from '@/modules/bot';
import { setupWebhook } from '@/setup-webhook';

// New modules for КОД ДЕНЕГ 4.0
import { energyPointsRoutes } from '@/modules/energy-points';
import { shopRoutes } from '@/modules/shop';
import { teamsRoutes } from '@/modules/teams';
import { streamsRoutes } from '@/modules/streams';
import { reportsRoutes } from '@/modules/reports';
import { cityChatModule } from '@/modules/city-chats';
import { contentModule } from '@/modules/content';
import { ratingsRoutes } from '@/modules/ratings';
import { analyticsModule } from '@/modules/analytics';
import { lavaPaymentWebhook } from '@/modules/webhooks/lava-payment';
import { cloudpaymentsWebhook } from '@/modules/webhooks/cloudpayments';
import { lavatopWebhook } from '@/modules/webhooks/lavatop';
import { adminRoutes } from '@/modules/admin';
import { leaderTestModule } from '@/modules/leader-test';
import { leaderSurveyRoutes } from '@/modules/leader-survey';
import { feedbackSurveyRoutes } from '@/modules/feedback-survey';
import { geographySurveyRoutes } from '@/modules/geography-survey';
import { decadesModule } from '@/modules/decades';
import { sessionsModule } from '@/modules/sessions';
import { referralModule } from '@/modules/referral';

const app = new Elysia()
  // 🔒 Security middlewares (first - before anything else)
  .use(securityHeaders)
  .use(auditLogger)
  // 📊 Metrics collection (track all requests)
  .use(metricsMiddleware)

  // Global plugins
  .use(errorHandler)
  .use(cookie())
  .use(
    cors({
      origin: config.CORS_ORIGIN.split(','),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Request-ID'],
    })
  )
  // Swagger docs (only in development)
  .use((app) => {
    if (isDevelopment) {
      return app.use(
        swagger({
          path: '/docs',
          documentation: {
            info: {
              title: 'Academy MiniApp 2.0 API',
              version: '1.0.0',
              description: 'API for Academy MiniApp 2.0 - Telegram WebApp for courses and meditations',
            },
            tags: [
              { name: 'Auth', description: 'Authentication endpoints' },
              { name: 'Users', description: 'User management' },
              { name: 'Courses', description: 'Courses and lessons' },
              { name: 'Meditations', description: 'Meditations' },
              { name: 'Gamification', description: 'XP, levels, achievements' },
              { name: 'AI', description: 'AI chat' },
              { name: 'Bot', description: 'Telegram bot' },
              { name: 'Energy Points', description: 'Energy Points system (КОД ДЕНЕГ 4.0)' },
              { name: 'Shop', description: 'Shop and purchases' },
              { name: 'Teams', description: 'Teams (Десятки)' },
              { name: 'Streams', description: 'Live streams' },
              { name: 'Reports', description: 'Weekly reports' },
            ],
          },
        })
      );
    }
    return app;
  })
  // Request logging
  .derive(() => ({ requestStartTime: Date.now() }))
  .onAfterHandle(({ request, path, set, requestStartTime }) => {
    if (path.startsWith('/docs') || path.startsWith('/swagger')) return;

    const duration = Date.now() - requestStartTime;
    const status = typeof set.status === 'number' ? set.status : 200;

    // 🚀 PERFORMANCE: Подсказка для Bun.serve() о сжатии
    // Bun автоматически сжимает ответы если клиент поддерживает
    set.headers['Vary'] = 'Accept-Encoding';

    logRequest(request.method, path, status, duration);
  })
  // Basic health check (liveness probe)
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }))
  // Kubernetes liveness probe (minimal check - app is alive)
  .get('/health/live', () => ({
    status: 'alive',
    timestamp: new Date().toISOString(),
  }))
  // Comprehensive readiness check (readiness probe)
  .get('/health/ready', async ({ set }) => {
    const checks: Record<string, string | number | boolean> = {};
    let overallStatus: 'ready' | 'not_ready' = 'ready';

    try {
      // Check Database connection
      try {
        await db.select().from(users).limit(1);
        checks.database = 'ok';
      } catch (error) {
        checks.database = 'failed';
        checks.database_error = error instanceof Error ? error.message : 'Unknown error';
        overallStatus = 'not_ready';
      }

      // Check Redis connection (optional)
      if (redis) {
        try {
          await redis.ping();
          checks.redis = 'ok';

          // Check scheduler queue size
          const queueSize = await redis.zcard('scheduler:queue');
          checks.scheduler_queue_size = queueSize;
        } catch (error) {
          checks.redis = 'failed';
          checks.redis_error = error instanceof Error ? error.message : 'Unknown error';
          // Redis is optional, don't mark as not_ready
          logger.warn({ error }, 'Redis health check failed');
        }
      } else {
        checks.redis = 'not_configured';
      }

      if (overallStatus === 'not_ready') {
        set.status = 503; // Service Unavailable
      }

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks
      };
    } catch (error) {
      set.status = 503;
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed',
        checks
      };
    }
  })
  // Root
  .get('/', () => ({
    name: 'КОД ДЕНЕГ 4.0 API',
    version: '2.0.0',
    docs: '/docs',
    description: 'API for КОД ДЕНЕГ Club - Telegram WebApp',
  }))
  // 📊 Prometheus metrics endpoint
  .use(metricsEndpoint)
  // API routes with rate limiting and caching
  .group('/api/v1', (app) =>
    app
      // 🔒 Use new professional rate limiter (Redis-based, distributed)
      .use(authRateLimiter)
      .use(apiSecurityHeaders)
      // 🚀 Cache layer (user-specific cache for authenticated routes)
      .use(userCache)
      .use(authModule)
      .use(usersModule)
      .use(coursesModule)
      .use(meditationsModule)
      .use(gamificationModule)
      .use(cityChatModule)
      // .use(aiModule) - disabled
      .use(botModule)
      .use(leaderTestModule)
      .use(leaderSurveyRoutes)
      .use(feedbackSurveyRoutes)
      .use(geographySurveyRoutes)
      .use(decadesModule)
      .use(sessionsModule)
      .use(referralModule)
  )
  // Analytics module (no auth required for tracking, but rate limited)
  .group('/api', (app) => app.use(paymentRateLimiter).use(analyticsModule))
  // Webhooks (no auth required)
  .group('/api', (app) => app.use(lavaPaymentWebhook).use(cloudpaymentsWebhook).use(lavatopWebhook))
  // Admin API (secret header auth)
  .group('/api', (app) => app.use(adminRoutes))
  // Content module (Путь - educational content system)
  .use(contentModule)
  // PDF proxy — отдаёт PDF через наш домен, чтобы iframe работал внутри Telegram Mini App
  .get('/api/v1/pdf-proxy', async ({ query, set }) => {
    const pdfUrl = query.url;
    if (!pdfUrl || typeof pdfUrl !== 'string') {
      set.status = 400;
      return 'Missing url parameter';
    }

    // Whitelist allowed domains
    const allowed = ['files.salebot.pro', 'store.daniillepekhin.com'];
    let hostname: string;
    try {
      hostname = new URL(pdfUrl).hostname;
    } catch {
      set.status = 400;
      return 'Invalid URL';
    }
    if (!allowed.some(d => hostname.endsWith(d))) {
      set.status = 403;
      return 'Domain not allowed';
    }

    try {
      const response = await fetch(pdfUrl, {
        headers: { 'User-Agent': 'ClubWebApp/1.0' },
        redirect: 'follow',
      });

      if (!response.ok) {
        set.status = 502;
        return `Failed to fetch PDF: ${response.status}`;
      }

      const buffer = await response.arrayBuffer();

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = 'inline';
      set.headers['Cache-Control'] = 'public, max-age=86400';

      return new Uint8Array(buffer);
    } catch (err: any) {
      logger.error({ err, pdfUrl }, 'PDF proxy error');
      set.status = 502;
      return 'Failed to fetch PDF';
    }
  })
  // New КОД ДЕНЕГ 4.0 routes (without /api/v1 prefix, already included in route definitions)
  .use(energyPointsRoutes)
  .use(shopRoutes)
  .use(teamsRoutes)
  .use(streamsRoutes)
  .use(reportsRoutes)
  // Ratings (без hotCache — Elysia 1.4.21 derive конфликтует с query parsing)
  .group('/api/v1', (app) => app.use(ratingsRoutes))
  // Start server
  .listen(Number(config.PORT));

logger.info(
  {
    port: config.PORT,
    environment: config.NODE_ENV,
    docs: isDevelopment ? `http://localhost:${config.PORT}/docs` : undefined,
  },
  `🚀 КОД ДЕНЕГ 4.0 Backend is running`
);

// Seed shop items (idempotent — only creates missing items)
import { shopService } from '@/modules/shop/service';
shopService.ensureDefaultItems().catch((error) => {
  logger.error({ error }, 'Failed to seed shop items');
});

// Telegram webhook setup + health monitoring
import { alertsService } from '@/services/alerts.service';
import { subscriptionGuardService } from '@/services/subscription-guard.service';
import { decadesService } from '@/services/decades.service';

if (!isDevelopment) {
  setupWebhook().catch(async (error) => {
    logger.error({ error }, "Failed to setup webhook on startup");
    // Отправляем алерт о проблеме с webhook
    await alertsService.webhookError(error);
  });

  // 🏥 Периодическая проверка здоровья бота (каждые 10 минут)
  const BOT_HEALTH_CHECK_INTERVAL = 10 * 60 * 1000; // 10 минут
  setInterval(async () => {
    try {
      await alertsService.checkWebhookHealth();
    } catch (error) {
      logger.error({ error }, 'Bot health check failed');
    }
  }, BOT_HEALTH_CHECK_INTERVAL);

  // Первая проверка через 1 минуту после старта
  setTimeout(async () => {
    await alertsService.checkWebhookHealth();
  }, 60 * 1000);

  // 🔒 CRON: Проверка истекших подписок (каждый день в 00:00 по МСК)
  // Выгоняет из каналов и чатов пользователей с истекшей подпиской
  const checkExpiredSubscriptionsDaily = async () => {
    const now = new Date();
    const moscowHour = (now.getUTCHours() + 3) % 24; // UTC+3 = Moscow time

    // Запускаем в 00:00 по МСК (21:00 UTC предыдущего дня)
    if (moscowHour === 0) {
      logger.info('Running daily expired subscriptions check...');
      try {
        const result = await subscriptionGuardService.checkExpiredSubscriptions();
        logger.info({ result }, 'Daily expired subscriptions check completed');
      } catch (error) {
        logger.error({ error }, 'Daily expired subscriptions check failed');
      }
    }
  };

  // 🔔 CRON: Напоминания о продлении подписки (каждый день в 09:00 по МСК)
  // Отправляет сообщения пользователям у которых подписка истекает через 2 дня, 1 день или сегодня
  const sendRenewalRemindersDaily = async () => {
    const now = new Date();
    const moscowHour = (now.getUTCHours() + 3) % 24; // UTC+3 = Moscow time

    // Запускаем в 09:00 по МСК (06:00 UTC)
    if (moscowHour === 9) {
      logger.info('Running daily renewal reminders...');
      try {
        const result = await subscriptionGuardService.sendRenewalReminders();
        logger.info({ result }, 'Daily renewal reminders completed');
      } catch (error) {
        logger.error({ error }, 'Daily renewal reminders failed');
      }
    }
  };

  // 🔟 CRON: Синхронизация состава десяток с Telegram (каждый день в 05:00 по МСК)
  // Проверяет реальный статус каждого участника в Telegram-чате и фиксирует расхождения с БД
  const syncDecadeMembershipDaily = async () => {
    const now = new Date();
    const moscowHour = (now.getUTCHours() + 3) % 24; // UTC+3 = Moscow time

    // Запускаем в 05:00 по МСК (02:00 UTC)
    if (moscowHour === 5) {
      const mskOffset = 3 * 60 * 60 * 1000;
      const todayMskStr = new Date(now.getTime() + mskOffset).toISOString().slice(0, 10);
      const redisKey = `cron:decade-sync:${todayMskStr}`;

      const alreadyRan = await cache.exists(redisKey);
      if (alreadyRan) {
        logger.info({ date: todayMskStr, redisKey }, 'Decade sync already ran today (Redis), skipping');
        return;
      }

      logger.info('Running daily decade membership sync...');
      try {
        const result = await decadesService.syncDecadeMembership();
        logger.info({ result }, 'Daily decade membership sync completed');
        await cache.set(redisKey, { ...result, ranAt: now.toISOString() }, 25 * 3600);
      } catch (error) {
        logger.error({ error }, 'Daily decade membership sync failed');
      }
    }
  };

  // 🧹 CRON: Чистка неактивных участников десяток (каждый день в 06:00 по МСК)
  // Удаляет участников без 'Ежедневный отчет' за 30 дней (с grace period для новых)
  const cleanupInactiveDecadeMembersDaily = async () => {
    const now = new Date();
    const moscowHour = (now.getUTCHours() + 3) % 24; // UTC+3 = Moscow time

    // Запускаем в 06:00 по МСК (03:00 UTC)
    if (moscowHour === 6) {
      const mskOffset = 3 * 60 * 60 * 1000;
      const todayMskStr = new Date(now.getTime() + mskOffset).toISOString().slice(0, 10);
      const redisKey = `cron:decade-cleanup:${todayMskStr}`;

      const alreadyRan = await cache.exists(redisKey);
      if (alreadyRan) {
        logger.info({ date: todayMskStr, redisKey }, 'Decade cleanup already ran today (Redis), skipping');
        return;
      }

      logger.info('Running daily inactive decade members cleanup...');
      try {
        const result = await subscriptionGuardService.removeInactiveDecadeMembers(false);
        logger.info({ removed: result.total }, 'Daily inactive decade cleanup completed');
        await cache.set(redisKey, { total: result.total, ranAt: now.toISOString() }, 25 * 3600);
      } catch (error) {
        logger.error({ error }, 'Daily inactive decade cleanup failed');
      }
    }
  };

  // Проверяем каждый час (в :00 минут)
  const HOURLY_CHECK = 60 * 60 * 1000; // 1 час
  setInterval(checkExpiredSubscriptionsDaily, HOURLY_CHECK);
  setInterval(sendRenewalRemindersDaily, HOURLY_CHECK);
  setInterval(syncDecadeMembershipDaily, HOURLY_CHECK);
  setInterval(cleanupInactiveDecadeMembersDaily, HOURLY_CHECK);

  // Первая проверка через 5 минут после старта (если сейчас 00:xx / 09:xx / 05:xx / 06:xx МСК)
  setTimeout(checkExpiredSubscriptionsDaily, 5 * 60 * 1000);
  setTimeout(sendRenewalRemindersDaily, 5 * 60 * 1000);
  setTimeout(syncDecadeMembershipDaily, 5 * 60 * 1000);
  setTimeout(cleanupInactiveDecadeMembersDaily, 5 * 60 * 1000);
}

// Graceful shutdown with timeout
const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds max
let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
    return;
  }
  isShuttingDown = true;

  logger.warn({ signal }, 'Shutting down gracefully...');

  // Force exit after timeout
  const forceExitTimer = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    // Stop accepting new connections
    await app.stop();
    logger.info('Server stopped accepting new connections');

    // Close database connections
    await closeDatabaseConnection();
    logger.info('Database connections closed');

    // Close Redis connections
    await closeRedisConnection();
    logger.info('Redis connections closed');

    clearTimeout(forceExitTimer);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    logger.error({ error }, 'Shutdown error');
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught Exception');
  shutdown('UNCAUGHT_EXCEPTION');
});

export type App = typeof app;
