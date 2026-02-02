/**
 * 🚨 ALERTS SERVICE
 * Отправка критических уведомлений админу в Telegram
 */

import { bot } from '@/modules/bot';
import { logger } from '@/utils/logger';

// ID админа для получения алертов
const ADMIN_TELEGRAM_ID = 389209990;

// Кулдаун для предотвращения спама (5 минут для одинаковых ошибок)
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const alertCooldowns = new Map<string, number>();

type AlertType =
  | 'payment_error'      // Ошибка сохранения данных оплаты
  | 'webhook_error'      // Ошибка webhook бота
  | 'bot_error'          // Бот не работает
  | 'database_error'     // Ошибка БД
  | 'critical_error';    // Критическая ошибка

interface AlertOptions {
  type: AlertType;
  title: string;
  message: string;
  details?: Record<string, any>;
  forceAlert?: boolean; // Игнорировать кулдаун
}

class AlertsService {
  private isInitialized = false;

  /**
   * Отправить алерт админу
   */
  async sendAlert(options: AlertOptions): Promise<boolean> {
    const { type, title, message, details, forceAlert } = options;

    // Проверяем кулдаун
    const alertKey = `${type}:${title}`;
    const now = Date.now();
    const lastAlertTime = alertCooldowns.get(alertKey);

    if (!forceAlert && lastAlertTime && (now - lastAlertTime) < ALERT_COOLDOWN_MS) {
      logger.debug({ alertKey }, 'Alert skipped due to cooldown');
      return false;
    }

    // Формируем emoji по типу
    const emoji = this.getAlertEmoji(type);

    // Формируем текст алерта
    let alertText = `${emoji} <b>${title}</b>\n\n`;
    alertText += `${message}\n`;

    if (details && Object.keys(details).length > 0) {
      alertText += `\n<b>Детали:</b>\n`;
      for (const [key, value] of Object.entries(details)) {
        const valueStr = typeof value === 'object'
          ? JSON.stringify(value, null, 2).slice(0, 200)
          : String(value).slice(0, 200);
        alertText += `• <code>${key}</code>: ${valueStr}\n`;
      }
    }

    alertText += `\n⏰ ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`;

    try {
      await bot.api.sendMessage(ADMIN_TELEGRAM_ID, alertText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });

      // Обновляем кулдаун
      alertCooldowns.set(alertKey, now);

      logger.info({ type, title }, 'Alert sent to admin');
      return true;
    } catch (error) {
      logger.error({ error, type, title }, 'Failed to send alert to admin');
      return false;
    }
  }

  /**
   * Алерт об ошибке сохранения данных оплаты
   */
  async paymentError(
    telegramId: string | number | null,
    error: any,
    context?: Record<string, any>
  ): Promise<void> {
    await this.sendAlert({
      type: 'payment_error',
      title: 'Ошибка сохранения данных оплаты',
      message: `Не удалось сохранить данные из формы оплаты.\nПользователь может оплатить, но данные не будут связаны!`,
      details: {
        telegram_id: telegramId,
        error: error?.message || String(error),
        ...context,
      },
      forceAlert: true, // Всегда отправляем для оплаты
    });
  }

  /**
   * Алерт об ошибке webhook'а бота
   */
  async webhookError(error: any, webhookUrl?: string): Promise<void> {
    await this.sendAlert({
      type: 'webhook_error',
      title: 'Ошибка Webhook бота',
      message: `Webhook не работает! Бот не получает сообщения.`,
      details: {
        webhook_url: webhookUrl,
        error: error?.message || String(error),
      },
    });
  }

  /**
   * Алерт о проблемах с ботом
   */
  async botError(error: any, context?: string): Promise<void> {
    await this.sendAlert({
      type: 'bot_error',
      title: 'Ошибка бота',
      message: context || 'Бот перестал работать или недоступен.',
      details: {
        error: error?.message || String(error),
      },
    });
  }

  /**
   * Алерт об ошибке базы данных
   */
  async databaseError(error: any, operation?: string): Promise<void> {
    await this.sendAlert({
      type: 'database_error',
      title: 'Ошибка базы данных',
      message: `Операция с БД завершилась ошибкой: ${operation || 'unknown'}`,
      details: {
        operation,
        error: error?.message || String(error),
      },
    });
  }

  /**
   * Алерт о критической ошибке
   */
  async criticalError(title: string, error: any, details?: Record<string, any>): Promise<void> {
    await this.sendAlert({
      type: 'critical_error',
      title,
      message: 'Требуется немедленное вмешательство!',
      details: {
        error: error?.message || String(error),
        ...details,
      },
      forceAlert: true,
    });
  }

  /**
   * Проверка здоровья webhook'а
   */
  async checkWebhookHealth(): Promise<boolean> {
    try {
      const webhookInfo = await bot.api.getWebhookInfo();

      if (!webhookInfo.url) {
        await this.sendAlert({
          type: 'webhook_error',
          title: 'Webhook не установлен',
          message: 'У бота не настроен webhook! Сообщения не обрабатываются.',
          details: { webhookInfo },
        });
        return false;
      }

      if (webhookInfo.last_error_date) {
        const errorAge = Date.now() / 1000 - webhookInfo.last_error_date;
        // Если ошибка была менее 10 минут назад
        if (errorAge < 600) {
          // Определяем тип ошибки и рекомендацию
          const errorMsg = webhookInfo.last_error_message || '';
          let recommendation = '';
          if (errorMsg.includes('SSL') || errorMsg.includes('certificate')) {
            recommendation = '\n\n💡 Решение: обновить SSL сертификат\ncertbot renew --force-renewal && systemctl reload nginx';
          } else if (errorMsg.includes('timeout')) {
            recommendation = '\n\n💡 Возможно бэкенд перегружен. Проверить: pm2 status';
          } else if (errorMsg.includes('Connection refused')) {
            recommendation = '\n\n💡 Бэкенд не запущен! Проверить: pm2 restart hranitel-backend';
          }

          await this.sendAlert({
            type: 'webhook_error',
            title: 'Ошибка Webhook бота',
            message: `Telegram не может достучаться до бота!\n\nОшибка: ${webhookInfo.last_error_message}${recommendation}`,
            details: {
              url: webhookInfo.url,
              pending_update_count: webhookInfo.pending_update_count,
              error_age_seconds: Math.round(errorAge),
            },
          });
          return false;
        }
      }

      // Если много pending updates - возможно бот не обрабатывает
      if (webhookInfo.pending_update_count > 100) {
        await this.sendAlert({
          type: 'bot_error',
          title: 'Много необработанных сообщений',
          message: `В очереди ${webhookInfo.pending_update_count} сообщений. Возможно бот не работает.`,
          details: {
            pending_update_count: webhookInfo.pending_update_count,
            url: webhookInfo.url,
          },
        });
        return false;
      }

      return true;
    } catch (error) {
      await this.webhookError(error);
      return false;
    }
  }

  private getAlertEmoji(type: AlertType): string {
    switch (type) {
      case 'payment_error':
        return '💳❌';
      case 'webhook_error':
        return '🔗❌';
      case 'bot_error':
        return '🤖❌';
      case 'database_error':
        return '🗄️❌';
      case 'critical_error':
        return '🚨';
      default:
        return '⚠️';
    }
  }
}

export const alertsService = new AlertsService();
