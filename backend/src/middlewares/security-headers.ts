import { Elysia } from 'elysia';
import { config } from '@/config';

/**
 * 🔒 Security Headers Middleware
 *
 * Добавляет важные security headers согласно OWASP best practices:
 * - Content Security Policy (CSP)
 * - Strict-Transport-Security (HSTS)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - X-XSS-Protection
 * - Referrer-Policy
 * - Permissions-Policy
 *
 * Senior-level: Защита от XSS, clickjacking, MIME sniffing и других атак
 */

export const securityHeaders = new Elysia({ name: 'security-headers' })
  .onBeforeHandle(({ set }) => {
    // 🛡️ Content Security Policy (CSP)
    // Защита от XSS атак
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://unpkg.com", // Telegram WebApp SDK
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.telegram.org wss:",
      "frame-ancestors 'none'", // Защита от clickjacking
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; ');

    set.headers['Content-Security-Policy'] = csp;

    // 🔐 Strict-Transport-Security (HSTS)
    // Принудительное использование HTTPS (только в production)
    if (config.NODE_ENV === 'production') {
      set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
    }

    // 🚫 X-Frame-Options
    // Защита от clickjacking (дополнительно к CSP)
    set.headers['X-Frame-Options'] = 'DENY';

    // 📄 X-Content-Type-Options
    // Защита от MIME type sniffing
    set.headers['X-Content-Type-Options'] = 'nosniff';

    // 🛡️ X-XSS-Protection (legacy браузеры)
    // Современные браузеры используют CSP, но для старых полезно
    set.headers['X-XSS-Protection'] = '1; mode=block';

    // 🔗 Referrer-Policy
    // Контролируем передачу referrer информации
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';

    // 🎛️ Permissions-Policy (ранее Feature-Policy)
    // Отключаем ненужные browser features
    const permissions = [
      'geolocation=()',
      'microphone=()',
      'camera=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()'
    ].join(', ');

    set.headers['Permissions-Policy'] = permissions;

    // 🔒 X-Permitted-Cross-Domain-Policies
    // Защита от Adobe Flash и PDF XSS
    set.headers['X-Permitted-Cross-Domain-Policies'] = 'none';

    // 🌐 Cross-Origin-Embedder-Policy
    // Изоляция от других origins
    // set.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';

    // 🌐 Cross-Origin-Opener-Policy
    // Защита от Spectre-подобных атак
    set.headers['Cross-Origin-Opener-Policy'] = 'same-origin';

    // 🌐 Cross-Origin-Resource-Policy
    // Контроль загрузки ресурсов
    set.headers['Cross-Origin-Resource-Policy'] = 'same-origin';

    // 🚫 X-Powered-By
    // Скрываем технологию backend (security by obscurity)
    set.headers['X-Powered-By'] = 'КОД ДЕНЕГ 4.0';

    // 🆔 X-Request-ID (для трейсинга)
    if (!set.headers['X-Request-ID']) {
      set.headers['X-Request-ID'] = crypto.randomUUID();
    }
  });

/**
 * Relaxed security headers для Telegram WebApp
 * (некоторые headers конфликтуют с Telegram iframe)
 */
export const telegramWebAppSecurityHeaders = new Elysia({ name: 'telegram-security-headers' })
  .onBeforeHandle(({ set }) => {
    // Более мягкий CSP для Telegram WebApp
    const csp = [
      "default-src 'self' https://telegram.org",
      "script-src 'self' 'unsafe-inline' https://telegram.org https://unpkg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors https://web.telegram.org", // Разрешаем Telegram iframe
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');

    set.headers['Content-Security-Policy'] = csp;

    // X-Frame-Options: ALLOW-FROM не работает, используем CSP frame-ancestors
    // set.headers['X-Frame-Options'] = 'ALLOW-FROM https://web.telegram.org';
    delete set.headers['X-Frame-Options']; // Удаляем, чтобы не конфликтовало с CSP

    // Остальные headers такие же
    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-XSS-Protection'] = '1; mode=block';
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    set.headers['X-Permitted-Cross-Domain-Policies'] = 'none';
    set.headers['Cross-Origin-Opener-Policy'] = 'same-origin-allow-popups';

    if (config.NODE_ENV === 'production') {
      set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
  });

/**
 * Минимальные security headers для API endpoints
 * (когда не нужен full CSP)
 */
export const apiSecurityHeaders = new Elysia({ name: 'api-security-headers' })
  .onBeforeHandle(({ set }) => {
    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'DENY';
    set.headers['Referrer-Policy'] = 'no-referrer';
    set.headers['X-Permitted-Cross-Domain-Policies'] = 'none';

    if (config.NODE_ENV === 'production') {
      set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
  });
