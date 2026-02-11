#!/usr/bin/env bun
/**
 * Скрипт для проверки транзакций энергий пользователя
 */

import { db } from './src/db';
import { users, energyTransactions } from './src/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

const username = process.argv[2];

if (!username) {
  console.error('❌ Ошибка: не указан username');
  console.error('Использование: bun run check-energy-transactions.ts @username');
  process.exit(1);
}

const cleanUsername = username.replace('@', '');

async function checkTransactions() {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!user) {
      console.error(`❌ Пользователь @${cleanUsername} не найден`);
      process.exit(1);
    }

    console.log('👤 Пользователь:');
    console.log(`   Username: @${user.username}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Telegram ID: ${user.telegramId}`);
    console.log('');

    // Получить все транзакции
    const transactions = await db
      .select()
      .from(energyTransactions)
      .where(eq(energyTransactions.userId, user.id))
      .orderBy(desc(energyTransactions.createdAt))
      .limit(50);

    console.log(`💰 Всего транзакций: ${transactions.length}`);
    console.log('');

    if (transactions.length === 0) {
      console.log('⚠️  Нет транзакций в базе данных!');
      console.log('');
      console.log('🔍 Это означает:');
      console.log('   - Уведомление было отправлено');
      console.log('   - НО транзакция НЕ была создана в БД');
      console.log('   - Это баг в коде начисления');
      console.log('');
      console.log('🐛 Нужно проверить:');
      console.log('   1. Логи backend (Render.com)');
      console.log('   2. Код energiesService.award()');
      console.log('   3. Обработчик хештегов');
      process.exit(0);
    }

    console.log('📋 Последние транзакции:\n');
    transactions.forEach((tx, i) => {
      const date = new Date(tx.createdAt);
      const formattedDate = date.toLocaleString('ru-RU');
      const sign = tx.amount > 0 ? '+' : '';
      
      console.log(`${i + 1}. ${tx.reason}`);
      console.log(`   Сумма: ${sign}${tx.amount} ⚡`);
      console.log(`   Тип: ${tx.type}`);
      console.log(`   Дата: ${formattedDate}`);
      if (tx.metadata) {
        console.log(`   Метаданные: ${JSON.stringify(tx.metadata)}`);
      }
      console.log('');
    });

    // Посчитать баланс
    const balance = transactions.reduce((sum, tx) => {
      if (tx.isExpired) return sum;
      return sum + (tx.type === 'income' ? tx.amount : -tx.amount);
    }, 0);

    console.log(`💎 Вычисленный баланс: ${balance} ⚡`);
    console.log('');

    // Проверить транзакции за последний час
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTx = transactions.filter(tx => new Date(tx.createdAt) > oneHourAgo);
    
    if (recentTx.length > 0) {
      console.log('🕐 Транзакции за последний час:');
      recentTx.forEach(tx => {
        const date = new Date(tx.createdAt);
        const minutesAgo = Math.floor((Date.now() - date.getTime()) / 60000);
        console.log(`   - ${tx.reason}: ${tx.amount > 0 ? '+' : ''}${tx.amount} ⚡ (${minutesAgo} мин назад)`);
      });
    } else {
      console.log('⚠️  Нет транзакций за последний час');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkTransactions();
