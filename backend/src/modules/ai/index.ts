import { Elysia, t } from 'elysia';
import OpenAI from 'openai';
import { eq, desc } from 'drizzle-orm';
import { db, chatMessages } from '@/db';
import { config } from '@/config';
import { authMiddleware } from '@/middlewares/auth';
import { logger } from '@/utils/logger';
import { gamificationService } from '@/modules/gamification/service';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Ты - AI-ассистент в приложении Academy MiniApp 2.0 для личностного развития и духовного роста.

Твои особенности:
- Ты добрый, поддерживающий и мудрый помощник
- Ты помогаешь пользователям с курсами, медитациями и практиками
- Ты даёшь советы по саморазвитию и осознанности
- Ты отвечаешь на русском языке
- Ты используешь эмодзи для создания дружелюбной атмосферы
- Твои ответы лаконичные, но содержательные

Контекст приложения:
- Курсы по трансформации мышления и духовному росту
- Медитации для расслабления и осознанности
- Система геймификации с XP и достижениями
- Отслеживание прогресса обучения`;

export const aiModule = new Elysia({ prefix: '/ai', tags: ['AI'] })
  .use(authMiddleware)
  // Send message to AI
  .post(
    '/chat',
    async ({ body, user, set }) => {
      const { message } = body;

      if (!config.OPENAI_API_KEY) {
        set.status = 503;
        return {
          success: false,
          error: 'AI service not configured',
        };
      }

      try {
        // Get recent chat history
        const history = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.userId, user!.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(10);

        // Reverse to get chronological order
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.reverse().map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: message },
        ];

        // Save user message
        await db.insert(chatMessages).values({
          userId: user!.id,
          role: 'user',
          content: message,
        });

        // Get AI response
        const completion = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        });

        const assistantMessage = completion.choices[0]?.message?.content || 'Извини, не смог сгенерировать ответ.';

        // Save assistant message
        await db.insert(chatMessages).values({
          userId: user!.id,
          role: 'assistant',
          content: assistantMessage,
        });

        // Award XP for using AI chat
        await gamificationService.addXP(user!.id, 5, 'ai_chat', {
          messageLength: message.length,
        });

        return {
          success: true,
          message: assistantMessage,
        };
      } catch (error) {
        logger.error({ error }, 'AI chat error');
        set.status = 500;
        return {
          success: false,
          error: 'Failed to get AI response',
        };
      }
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1, maxLength: 2000 }),
      }),
      detail: {
        summary: 'Send message to AI',
      },
    }
  )
  // Stream chat (for real-time responses)
  .post(
    '/chat/stream',
    async function* ({ body, user, set }) {
      const { message } = body;

      if (!config.OPENAI_API_KEY) {
        set.status = 503;
        yield JSON.stringify({ error: 'AI service not configured' });
        return;
      }

      try {
        // Get recent chat history
        const history = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.userId, user!.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(10);

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.reverse().map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: message },
        ];

        // Save user message
        await db.insert(chatMessages).values({
          userId: user!.id,
          role: 'user',
          content: message,
        });

        // Stream AI response
        const stream = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages,
          temperature: 0.7,
          max_tokens: 1000,
          stream: true,
        });

        let fullResponse = '';

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            yield JSON.stringify({ content, done: false });
          }
        }

        // Save full response
        await db.insert(chatMessages).values({
          userId: user!.id,
          role: 'assistant',
          content: fullResponse,
        });

        // Award XP
        await gamificationService.addXP(user!.id, 5, 'ai_chat_stream');

        yield JSON.stringify({ done: true });
      } catch (error) {
        logger.error({ error }, 'AI stream error');
        yield JSON.stringify({ error: 'Stream failed' });
      }
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1, maxLength: 2000 }),
      }),
      detail: {
        summary: 'Stream AI chat response',
      },
    }
  )
  // Get chat history
  .get(
    '/chat/history',
    async ({ user, query }) => {
      const { limit = 50 } = query;

      const history = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.userId, user!.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit);

      return {
        success: true,
        messages: history.reverse(),
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
      }),
      detail: {
        summary: 'Get chat history',
      },
    }
  )
  // Clear chat history
  .delete(
    '/chat/history',
    async ({ user }) => {
      await db
        .delete(chatMessages)
        .where(eq(chatMessages.userId, user!.id));

      return {
        success: true,
        message: 'Chat history cleared',
      };
    },
    {
      detail: {
        summary: 'Clear chat history',
      },
    }
  )
  // Transcribe audio (voice message)
  .post(
    '/transcribe',
    async ({ body, set }) => {
      if (!config.OPENAI_API_KEY) {
        set.status = 503;
        return {
          success: false,
          error: 'AI service not configured',
        };
      }

      try {
        const { audio } = body;

        // Convert base64 to file
        const audioBuffer = Buffer.from(audio, 'base64');
        const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

        const transcription = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
          language: 'ru',
        });

        return {
          success: true,
          text: transcription.text,
        };
      } catch (error) {
        logger.error({ error }, 'Transcription error');
        set.status = 500;
        return {
          success: false,
          error: 'Transcription failed',
        };
      }
    },
    {
      body: t.Object({
        audio: t.String(), // base64 encoded audio
      }),
      detail: {
        summary: 'Transcribe audio to text',
      },
    }
  );
