import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { cookie } from '@elysiajs/cookie';

import { config, isDevelopment } from '@/config';
import { logger, logRequest } from '@/utils/logger';
import { closeRedisConnection } from '@/utils/redis';
import { closeDatabaseConnection } from '@/db';
import { errorHandler } from '@/middlewares/errorHandler';
import { apiRateLimit } from '@/middlewares/rateLimit';

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

const app = new Elysia()
  // Global plugins
  .use(errorHandler)
  .use(cookie())
  .use(
    cors({
      origin: config.CORS_ORIGIN.split(','),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

    logRequest(request.method, path, status, duration);
  })
  // Health check
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }))
  // Root
  .get('/', () => ({
    name: 'КОД ДЕНЕГ 4.0 API',
    version: '2.0.0',
    docs: '/docs',
    description: 'API for КОД ДЕНЕГ Club - Telegram WebApp',
  }))
  // API routes
  .group('/api/v1', (app) =>
    app
      .use(apiRateLimit)
      .use(authModule)
      .use(usersModule)
      .use(coursesModule)
      .use(meditationsModule)
      .use(gamificationModule)
      .use(cityChatModule)
      // .use(aiModule) - disabled
      .use(botModule)
  )
  // Content module (Путь - educational content system)
  .use(contentModule)
  // New КОД ДЕНЕГ 4.0 routes (without /api/v1 prefix, already included in route definitions)
  .use(energyPointsRoutes)
  .use(shopRoutes)
  .use(teamsRoutes)
  .use(streamsRoutes)
  .use(reportsRoutes)
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

// Telegram webhook disabled - bot not needed for webapp-only deployment
if (!isDevelopment) {
  setupWebhook().catch((error) => {
    logger.error({ error }, "Failed to setup webhook on startup");
  });
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.warn({ signal }, 'Shutting down gracefully...');

  try {
    await app.stop();
    await closeDatabaseConnection();
    await closeRedisConnection();

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
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
