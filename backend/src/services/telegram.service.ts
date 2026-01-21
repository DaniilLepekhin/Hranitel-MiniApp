import { Api, InputFile } from 'grammy';
import { logger } from '@/utils/logger';

interface RetryOptions {
  maxRetries?: number;
  delays?: number[]; // [1000, 5000, 15000] - 1s, 5s, 15s
}

interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown';
  reply_markup?: any;
  disable_web_page_preview?: boolean;
}

interface SendVideoOptions {
  caption?: string;
  parse_mode?: 'HTML' | 'Markdown';
  reply_markup?: any;
}

interface SendDocumentOptions {
  caption?: string;
  parse_mode?: 'HTML' | 'Markdown';
}

interface SendPhotoOptions {
  caption?: string;
  parse_mode?: 'HTML' | 'Markdown';
  reply_markup?: any;
}

interface MediaGroupItem {
  type: 'photo' | 'video';
  media: string;
  caption?: string;
}

export class TelegramService {
  private api: Api;
  private readonly defaultRetryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s

  constructor(api: Api) {
    this.api = api;
  }

  /**
   * Send a text message with retry logic
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: SendMessageOptions,
    retryOptions?: RetryOptions
  ): Promise<boolean> {
    return this.executeWithRetry(
      async () => {
        await this.api.sendMessage(chatId, text, options);
        return true;
      },
      {
        operation: 'sendMessage',
        chatId,
        ...retryOptions,
      }
    );
  }

  /**
   * Send a video with retry logic
   */
  async sendVideo(
    chatId: number,
    video: string,
    options?: SendVideoOptions,
    retryOptions?: RetryOptions
  ): Promise<boolean> {
    logger.info({ chatId, video, options }, 'Attempting to send video');
    return this.executeWithRetry(
      async () => {
        const result = await this.api.sendVideo(chatId, video, options);
        logger.info({ chatId, video, messageId: result.message_id }, 'Video sent successfully');
        return true;
      },
      {
        operation: 'sendVideo',
        chatId,
        ...retryOptions,
      }
    );
  }

  /**
   * Send a document with retry logic
   */
  async sendDocument(
    chatId: number,
    document: string,
    options?: SendDocumentOptions,
    retryOptions?: RetryOptions
  ): Promise<boolean> {
    return this.executeWithRetry(
      async () => {
        await this.api.sendDocument(chatId, document, options);
        return true;
      },
      {
        operation: 'sendDocument',
        chatId,
        ...retryOptions,
      }
    );
  }

  /**
   * Send a photo with retry logic
   * Supports URL string or Buffer
   */
  async sendPhoto(
    chatId: number,
    photo: string | Buffer,
    options?: SendPhotoOptions,
    retryOptions?: RetryOptions
  ): Promise<boolean> {
    const photoInfo = typeof photo === 'string' ? photo : `Buffer(${photo.length} bytes)`;
    logger.info({ chatId, photo: photoInfo, options }, 'Attempting to send photo');
    return this.executeWithRetry(
      async () => {
        // Если это Buffer, оборачиваем в InputFile
        const photoInput = Buffer.isBuffer(photo)
          ? new InputFile(photo, 'star.png')
          : photo;

        const result = await this.api.sendPhoto(chatId, photoInput, options);
        logger.info({ chatId, photo: photoInfo, messageId: result.message_id }, 'Photo sent successfully');
        return true;
      },
      {
        operation: 'sendPhoto',
        chatId,
        ...retryOptions,
      }
    );
  }

  /**
   * Copy a message from a channel with custom caption and keyboard
   * Use for t.me/channel/messageId links
   */
  async copyMessage(
    chatId: number,
    fromChatId: string | number,
    messageId: number,
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown';
      reply_markup?: any;
    },
    retryOptions?: RetryOptions
  ): Promise<boolean> {
    return this.executeWithRetry(
      async () => {
        await this.api.copyMessage(chatId, fromChatId, messageId, options);
        return true;
      },
      {
        operation: 'copyMessage',
        chatId,
        ...retryOptions,
      }
    );
  }

  /**
   * Send a media group (photos/videos) with retry logic
   */
  async sendMediaGroup(
    chatId: number,
    media: MediaGroupItem[],
    retryOptions?: RetryOptions
  ): Promise<boolean> {
    return this.executeWithRetry(
      async () => {
        await this.api.sendMediaGroup(chatId, media);
        return true;
      },
      {
        operation: 'sendMediaGroup',
        chatId,
        ...retryOptions,
      }
    );
  }

  /**
   * Send an animation (GIF, video note, etc.) with retry logic
   */
  async sendAnimation(
    chatId: number,
    animation: string,
    options?: SendVideoOptions,
    retryOptions?: RetryOptions
  ): Promise<boolean> {
    return this.executeWithRetry(
      async () => {
        await this.api.sendAnimation(chatId, animation, options);
        return true;
      },
      {
        operation: 'sendAnimation',
        chatId,
        ...retryOptions,
      }
    );
  }

  /**
   * Get chat member status (for subscription checks)
   */
  async getChatMember(
    chatId: string | number,
    userId: number
  ): Promise<{ status: string } | null> {
    try {
      const member = await this.api.getChatMember(chatId, userId);
      return member;
    } catch (error) {
      logger.error({ error, chatId, userId }, 'Error getting chat member');
      return null;
    }
  }

  /**
   * Set chat menu button (синяя кнопка "Меню" в левом нижнем углу)
   */
  async setChatMenuButton(
    chatId: number,
    menuButton:
      | { type: 'commands' }
      | { type: 'web_app'; text: string; web_app: { url: string } }
      | { type: 'default' }
  ): Promise<boolean> {
    try {
      await this.api.setChatMenuButton({ chat_id: chatId, menu_button: menuButton });
      logger.info({ chatId, menuButton }, 'Chat menu button set successfully');
      return true;
    } catch (error) {
      logger.error({ error, chatId, menuButton }, 'Error setting chat menu button');
      return false;
    }
  }

  /**
   * Execute an API call with exponential backoff retry
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      operation: string;
      chatId: number;
      maxRetries?: number;
      delays?: number[];
    }
  ): Promise<T | false> {
    const maxRetries = context.maxRetries ?? 3;
    const delays = context.delays ?? this.defaultRetryDelays;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();

        if (attempt > 0) {
          logger.info(
            {
              operation: context.operation,
              chatId: context.chatId,
              attempt
            },
            'Operation succeeded after retry'
          );
        }

        return result;
      } catch (error: any) {
        lastError = error;

        // Check if error is recoverable
        const errorCode = error?.error_code;
        const errorDescription = error?.description || '';

        // Non-recoverable errors - don't retry
        if (this.isNonRecoverableError(errorCode, errorDescription)) {
          logger.warn(
            {
              operation: context.operation,
              chatId: context.chatId,
              errorCode,
              errorDescription,
            },
            'Non-recoverable error, skipping retries'
          );
          return false;
        }

        // If this was the last attempt, log and fail
        if (attempt === maxRetries) {
          logger.error(
            {
              operation: context.operation,
              chatId: context.chatId,
              errorCode,
              errorDescription,
              attempts: attempt + 1,
            },
            'Operation failed after all retries'
          );
          return false;
        }

        // Calculate delay for next retry
        const delay = delays[attempt] || delays[delays.length - 1];

        // Handle rate limiting specifically
        if (errorCode === 429) {
          const retryAfter = error?.parameters?.retry_after || delay / 1000;
          logger.warn(
            {
              operation: context.operation,
              chatId: context.chatId,
              retryAfter,
              attempt: attempt + 1,
            },
            'Rate limited, waiting before retry'
          );
          await this.sleep(retryAfter * 1000);
        } else {
          logger.warn(
            {
              operation: context.operation,
              chatId: context.chatId,
              errorCode,
              delay,
              attempt: attempt + 1,
            },
            'Retrying after error'
          );
          await this.sleep(delay);
        }
      }
    }

    return false;
  }

  /**
   * Check if error is non-recoverable (user blocked bot, chat not found, etc.)
   */
  private isNonRecoverableError(
    errorCode: number | undefined,
    errorDescription: string
  ): boolean {
    const nonRecoverableErrors = [
      'bot was blocked by the user',
      'user is deactivated',
      'chat not found',
      'bot was kicked',
      'bot is not a member',
      'PEER_ID_INVALID',
      'USER_IS_BLOCKED',
    ];

    // Check error codes
    if (errorCode === 403) {
      return true; // Forbidden - user blocked bot
    }

    // Check error descriptions
    const lowerDescription = errorDescription.toLowerCase();
    return nonRecoverableErrors.some((err) =>
      lowerDescription.includes(err.toLowerCase())
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Batch send messages with rate limiting protection
   * Useful for broadcasts
   */
  async batchSendMessages(
    messages: Array<{
      chatId: number;
      text: string;
      options?: SendMessageOptions;
    }>,
    options?: {
      delayBetween?: number; // Delay between messages in ms
      onProgress?: (sent: number, total: number) => void;
    }
  ): Promise<{ sent: number; failed: number }> {
    const delayBetween = options?.delayBetween ?? 50; // 50ms = 20 msg/sec
    let sent = 0;
    let failed = 0;

    logger.info({ total: messages.length }, 'Starting batch send');

    for (let i = 0; i < messages.length; i++) {
      const { chatId, text, options: msgOptions } = messages[i];

      const success = await this.sendMessage(chatId, text, msgOptions);

      if (success) {
        sent++;
      } else {
        failed++;
      }

      // Report progress
      if (options?.onProgress) {
        options.onProgress(sent + failed, messages.length);
      }

      // Add delay between messages to respect rate limits
      if (i < messages.length - 1) {
        await this.sleep(delayBetween);
      }
    }

    logger.info({ sent, failed, total: messages.length }, 'Batch send completed');

    return { sent, failed };
  }
}
