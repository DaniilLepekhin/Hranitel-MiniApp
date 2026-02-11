#!/usr/bin/env bun
/**
 * Скрипт для установки кнопки "Меню" в Telegram
 * 
 * Использование:
 *   bun run fix-menu-button.ts @username
 */

import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { Bot } from 'grammy';

const username = process.argv[2];

if (!username) {
  console.error('❌ Ошибка: не указан username');
  console.error('Использование: bun run fix-menu-button.ts @username');
  process.exit(1);
}

const cleanUsername = username.replace('@', '');
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ Ошибка: BOT_TOKEN не найден в .env');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

async function fixMenuButton() {
  try {
    console.log(`🔍 Поиск пользователя: @${cleanUsername}`);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!user) {
      console.error(`❌ Пользователь @${cleanUsername} не найден`);
      process.exit(1);
    }

    console.log('✅ Пользователь найден:');
    console.log(`   Username: @${user.username}`);
    console.log(`   Telegram ID: ${user.telegramId}`);
    console.log(`   isPro: ${user.isPro}`);
    console.log('');

    if (!user.isPro) {
      console.error('⚠️  Внимание: У пользователя нет PRO подписки');
      console.error('   Кнопка меню доступна только для PRO пользователей');
      console.error('');
      console.error('   Сначала активируйте подписку:');
      console.error('   bun run activate-subscription.ts @username 30');
      process.exit(1);
    }

    const chatId = user.telegramId;

    console.log('🔧 Установка команд бота...');
    
    // 1. Установить команду /menu
    await bot.api.setMyCommands(
      [
        { command: 'menu', description: '🏠 Главное меню' },
        { command: 'start', description: '🚀 Начать заново' },
      ],
      { scope: { type: 'chat', chat_id: chatId } }
    );
    console.log('   ✅ Команды установлены');

    // 2. Установить кнопку меню в левом нижнем углу
    console.log('');
    console.log('🔧 Установка кнопки меню...');
    await bot.api.setChatMenuButton({
      chat_id: chatId,
      menu_button: { type: 'commands' }
    });
    console.log('   ✅ Кнопка меню установлена');

    // 3. Отправить тестовое сообщение с напоминанием
    console.log('');
    console.log('📱 Отправка напоминания пользователю...');
    await bot.api.sendMessage(
      chatId,
      `✅ <b>Кнопка «Меню» установлена!</b>\n\n` +
      `Посмотри в <b>левый нижний угол</b> чата со мной.\n` +
      `Там должна появиться синяя кнопка с иконкой ☰\n\n` +
      `Нажми на неё, чтобы открыть главное меню.\n\n` +
      `<i>Если кнопка не появилась:</i>\n` +
      `1. Закрой и заново открой чат со мной\n` +
      `2. Или напиши команду /menu`,
      { parse_mode: 'HTML' }
    );
    console.log('   ✅ Сообщение отправлено');

    console.log('');
    console.log('🎉 Готово!');
    console.log('');
    console.log('📱 Попросите пользователя:');
    console.log('   1. Открыть чат сботом');
    console.log('   2. Посмотреть в левый нижний угол');
    console.log('   3. Нажать на кнопку ☰ (синяя иконка меню)');
    console.log('   4. Если кнопки нет - перезапустить чат или написать /menu');

  } catch (error) {
    console.error('❌ Ошибка:', error);
    
    if (error instanceof Error && error.message.includes('chat not found')) {
      console.error('');
      console.error('💡 Возможная причина:');
      console.error('   Пользователь заблокировал бота или не писал ему');
      console.error('');
      console.error('🔧 Решение:');
      console.error('   Попросите пользователя написать боту /start');
    }
    
    process.exit(1);
  } finally {
    await bot.stop();
    process.exit(0);
  }
}

fixMenuButton();
