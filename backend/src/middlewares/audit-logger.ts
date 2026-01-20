import { Elysia } from 'elysia';
import { logger } from '@/utils/logger';
import type { User } from '@/db';

/**
 * 📝 Audit Logger Middleware
 *
 * Логирует все важные действия пользователей для:
 * - Security audits
 * - Compliance (GDPR, PCI DSS)
 * - Debugging
 * - Analytics
 *
 * Senior-level: Structured logging с контекстом для distributed tracing
 */

interface AuditLogEntry {
  timestamp: string;
  requestId: string;
  userId?: string;
  telegramId?: string;
  action: string;
  resource?: string;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
  statusCode?: number;
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Определяет, нужно ли логировать запрос
 */
function shouldLog(path: string, method: string): boolean {
  // Не логируем health checks (слишком много)
  if (path === '/health' || path === '/health/ready') {
    return false;
  }

  // Не логируем статику
  if (path.startsWith('/static/') || path.startsWith('/_next/')) {
    return false;
  }

  // Логируем все остальное
  return true;
}

/**
 * Определяет тип действия по методу и пути
 */
function determineAction(method: string, path: string): string {
  // Авторизация
  if (path.includes('/auth/')) {
    if (method === 'POST' && path.includes('/login')) return 'auth.login';
    if (method === 'POST' && path.includes('/logout')) return 'auth.logout';
    if (method === 'POST' && path.includes('/register')) return 'auth.register';
    return 'auth.unknown';
  }

  // Платежи
  if (path.includes('/payment')) {
    if (method === 'POST') return 'payment.create';
    if (method === 'GET') return 'payment.view';
    return 'payment.unknown';
  }

  // Профиль
  if (path.includes('/profile')) {
    if (method === 'GET') return 'profile.view';
    if (method === 'PUT' || method === 'PATCH') return 'profile.update';
    return 'profile.unknown';
  }

  // Webhook
  if (path.includes('/webhook')) {
    return 'webhook.received';
  }

  // Подписки
  if (path.includes('/subscription')) {
    if (method === 'POST') return 'subscription.create';
    if (method === 'DELETE') return 'subscription.cancel';
    return 'subscription.view';
  }

  // Дефолтное действие
  return `${method.toLowerCase()}.${path.split('/')[2] || 'unknown'}`;
}

/**
 * Извлекает IP адрес с учётом proxy
 */
function extractIp(headers: Record<string, string | undefined>): string {
  return (
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['x-real-ip'] ||
    headers['cf-connecting-ip'] || // Cloudflare
    'unknown'
  );
}

/**
 * Создаёт audit log middleware
 */
export const auditLogger = new Elysia({ name: 'audit-logger' })
  .derive(({ headers }) => {
    // Генерируем или используем существующий request ID для трейсинга
    const requestId = headers['x-request-id'] || crypto.randomUUID();
    const startTime = Date.now();

    return {
      requestId,
      startTime,
      auditIp: extractIp(headers)
    };
  })
  .onAfterHandle(({ request, user, requestId, startTime, auditIp, set }) => {
    const { method, url } = request;
    const path = new URL(url).pathname;

    // Проверяем, нужно ли логировать
    if (!shouldLog(path, method)) {
      return;
    }

    const duration = Date.now() - startTime;
    const action = determineAction(method, path);

    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      userId: user?.id,
      telegramId: user?.telegramId,
      action,
      method,
      path,
      ip: auditIp,
      userAgent: request.headers.get('user-agent') || undefined,
      statusCode: set.status as number,
      duration
    };

    // Логируем
    logger.info(auditEntry, `Audit: ${action}`);
  })
  .onError(({ request, error, user, requestId, startTime, auditIp, set }) => {
    const { method, url } = request;
    const path = new URL(url).pathname;

    if (!shouldLog(path, method)) {
      return;
    }

    const duration = Date.now() - startTime;
    const action = determineAction(method, path);

    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      userId: user?.id,
      telegramId: user?.telegramId,
      action: `${action}.error`,
      method,
      path,
      ip: auditIp,
      userAgent: request.headers.get('user-agent') || undefined,
      statusCode: set.status as number || 500,
      duration,
      error: error.message
    };

    // Логируем ошибку
    logger.error(auditEntry, `Audit Error: ${action}`);
  });

/**
 * Специальный audit logger для критических операций
 * (платежи, изменение подписки, security events)
 */
export const criticalAuditLogger = new Elysia({ name: 'critical-audit-logger' })
  .use(auditLogger)
  .onAfterHandle(({ request, user, requestId, auditIp }) => {
    const { method, url } = request;
    const path = new URL(url).pathname;

    // Дополнительное логирование для критических операций
    logger.warn(
      {
        level: 'CRITICAL',
        requestId,
        userId: user?.id,
        telegramId: user?.telegramId,
        action: determineAction(method, path),
        path,
        ip: auditIp,
        timestamp: new Date().toISOString()
      },
      '🚨 Critical operation logged'
    );
  });

/**
 * Utility: Manually log audit event
 * Для использования в background jobs или scheduled tasks
 */
export function logAuditEvent(
  action: string,
  data: Partial<AuditLogEntry>
) {
  const auditEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    requestId: data.requestId || crypto.randomUUID(),
    userId: data.userId,
    telegramId: data.telegramId,
    action,
    resource: data.resource,
    method: data.method || 'SYSTEM',
    path: data.path || '/internal',
    ip: data.ip || 'system',
    userAgent: data.userAgent,
    statusCode: data.statusCode,
    duration: data.duration,
    error: data.error,
    metadata: data.metadata
  };

  if (data.error) {
    logger.error(auditEntry, `Audit Event: ${action}`);
  } else {
    logger.info(auditEntry, `Audit Event: ${action}`);
  }
}

/**
 * Utility: Log security event
 * Для подозрительной активности, failed auth attempts, etc.
 */
export function logSecurityEvent(
  eventType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, any>
) {
  logger.warn(
    {
      securityEvent: eventType,
      severity,
      timestamp: new Date().toISOString(),
      ...details
    },
    `🔒 Security Event: ${eventType}`
  );

  // Если критичность высокая, можно отправить алерт (Slack, Email, PagerDuty)
  if (severity === 'critical') {
    // TODO: Integrate with alerting system
    logger.error(
      {
        alert: 'SECURITY_CRITICAL',
        eventType,
        details
      },
      '🚨 CRITICAL SECURITY EVENT'
    );
  }
}
