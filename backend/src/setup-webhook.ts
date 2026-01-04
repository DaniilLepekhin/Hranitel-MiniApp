import { bot } from './modules/bot';
import { config } from './config';
import { logger } from './utils/logger';

async function setupWebhook() {
  try {
    const webhookUrl = `${config.API_URL}/api/v1/bot/webhook`;

    logger.info({ webhookUrl }, 'Setting up Telegram webhook...');

    // Set webhook
    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
      secret_token: config.TELEGRAM_WEBHOOK_SECRET,
    });

    // Get webhook info
    const webhookInfo = await bot.api.getWebhookInfo();

    logger.info(
      {
        url: webhookInfo.url,
        pending_update_count: webhookInfo.pending_update_count,
        last_error_date: webhookInfo.last_error_date,
        last_error_message: webhookInfo.last_error_message,
      },
      '✅ Webhook configured successfully'
    );
  } catch (error) {
    logger.error({ error }, '❌ Failed to setup webhook');
    throw error;
  }
}

// Run if executed directly
if (import.meta.main) {
  setupWebhook()
    .then(() => {
      logger.info('✅ Webhook setup complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, '❌ Webhook setup failed');
      process.exit(1);
    });
}

export { setupWebhook };
