#!/usr/bin/env bun
/**
 * Скрипт для синхронизации баланса энергий из транзакций
 * Исправляет ситуацию когда поле users.energies не обновилось
 */

import { db } from './src/db';
import { users, energyTransactions } from './src/db/schema';
import { eq, sql } from 'drizzle-orm';

const username = process.argv[2];

if (!username) {
  console.error('❌ Ошибка: не указан username');
  console.error('Использование: bun run sync-energy-balance.ts @username');
  process.exit(1);
}

const cleanUsername = username.replace('@', '');

async function syncBalance() {
  try {
    console.log(`🔄 Синхронизация баланса для @${cleanUsername}\n`);

    // 1. Найти пользователя
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!user) {
      console.error(`❌ Пользователь @${cleanUsername} не найден`);
      process.exit(1);
    }

    console.log('👤 Пользователь найден:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: @${user.username}`);
    console.log(`   Текущий баланс (поле energies): ${user.energies || 0} ⚡`);
    console.log('');

    // 2. Получить все транзакции
    const transactions = await db
      .select()
      .from(energyTransactions)
      .where(eq(energyTransactions.userId, user.id));

    console.log(`📊 Всего транзакций: ${transactions.length}`);
    console.log('');

    // 3. Посчитать правильный баланс
    let correctBalance = 0;
    let incomeTotal = 0;
    let expenseTotal = 0;

    transactions.forEach(tx => {
      if (tx.isExpired) return; // Пропускаем истекшие

      if (tx.type === 'income') {
        correctBalance += tx.amount;
        incomeTotal += tx.amount;
      } else {
        correctBalance -= tx.amount;
        expenseTotal += tx.amount;
      }
    });

    console.log('💰 Расчёт баланса:');
    console.log(`   Начислено (income): +${incomeTotal} ⚡`);
    console.log(`   Потрачено (expense): -${expenseTotal} ⚡`);
    console.log(`   Правильный баланс: ${correctBalance} ⚡`);
    console.log('');

    // 4. Проверить расхождение
    const currentBalance = user.energies || 0;
    const difference = correctBalance - currentBalance;

    if (difference === 0) {
      console.log('✅ Баланс корректен! Синхронизация не требуется.');
      process.exit(0);
    }

    console.log('⚠️  РАСХОЖДЕНИЕ НАЙДЕНО:');
    console.log(`   Текущий баланс (users.energies): ${currentBalance} ⚡`);
    console.log(`   Правильный баланс (сумма транзакций): ${correctBalance} ⚡`);
    console.log(`   Разница: ${difference > 0 ? '+' : ''}${difference} ⚡`);
    console.log('');

    // 5. Обновить баланс
    console.log('🔧 Обновление баланса...');
    
    await db
      .update(users)
      .set({ energies: correctBalance })
      .where(eq(users.id, user.id));

    console.log('✅ Баланс успешно синхронизирован!');
    console.log(`   Новый баланс: ${correctBalance} ⚡`);
    console.log('');
    console.log('📱 Пользователь может обновить приложение и увидеть правильный баланс');

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

syncBalance();
