import { Elysia } from 'elysia';
import { isDevelopment } from '@/config';
import { logger } from '@/utils/logger';

export const errorHandler = new Elysia({ name: 'errorHandler' })
  .onError(({ code, error, set }) => {
    const errorMessage = error?.message || String(error);
    const errorStack = (error as Error)?.stack;

    // Log error
    if (isDevelopment) {
      logger.error({ code, message: errorMessage, stack: errorStack }, '❌ Request error');
    } else {
      logger.error({ code, message: errorMessage }, '❌ Request error');
    }

    // Handle specific error codes
    switch (code) {
      case 'VALIDATION':
        set.status = 400;
        return {
          success: false,
          error: 'Validation Error',
          message: errorMessage,
        };

      case 'NOT_FOUND':
        set.status = 404;
        return {
          success: false,
          error: 'Not Found',
          message: 'Resource not found',
        };

      case 'PARSE':
        set.status = 400;
        return {
          success: false,
          error: 'Parse Error',
          message: 'Invalid request body',
        };

      default:
        set.status = 500;
        return {
          success: false,
          error: 'Internal Server Error',
          message: isDevelopment ? errorMessage : 'Something went wrong',
        };
    }
  });
