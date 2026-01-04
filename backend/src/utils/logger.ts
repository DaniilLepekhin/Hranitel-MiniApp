import pino from 'pino';
import { isDevelopment } from '@/config';

export const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: process.env.NODE_ENV,
    service: 'academy-miniapp-backend',
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  redact: {
    paths: ['password', 'token', 'accessToken', 'refreshToken', 'secret', 'authorization', 'cookie'],
    remove: true,
  },
});

export const logRequest = (method: string, path: string, status: number, duration: number) => {
  const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  logger[logLevel]({ method, path, status, duration: `${duration}ms` }, `${method} ${path}`);
};
