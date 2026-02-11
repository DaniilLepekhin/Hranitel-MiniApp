#!/usr/bin/env bun
/**
 * Скрипт для диагностики проблем с начислением энергий за хештеги
 * 
 * Использование:
 *   bun run check-hashtag-issue.ts @username
 */

import { db } from './src/db';
import { users, energyTransactions } from './src/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

const username = process.argv[2];

if (!username) {
  console.error('❌ Ошибка: не указан username');
  console.error('Использование: bun run check-hashtag-issue.ts @username');
  process.exit(1);
}

const cleanUsername = username.replace('@', '');

async function diagnoseHashtagIssue() {
  try {
    console.log(`🔍 Диагностика проблемы с начислением #практика для @${cleanUsername}\n`);

    // 1. Найти пользователя
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!user) {
      console.error(`❌ Пользователь @${cleanUsername} не найден в базе`);
      console.error('');
      console.error('💡 Возможная причина:');
      console.error('   Пользователь не запускал бота /start');
      process.exit(1);
    }

    console.log('✅ Пользователь найден:');
    console.log(`   Username: @${user.username}`);
    console.log(`   Telegram ID: ${user.telegramId}`);
    console.log(`   ID в БД: ${user.id}`);
    console.log('');

    // 2. Проверить статус подписки
    console.log('📋 Проверка подписки:');
    console.log(`   isPro: ${user.isPro ? '✅ true' : '❌ false'}`);
    
    if (user.subscriptionExpires) {
      const expiresDate = new Date(user.subscriptionExpires);
      const isExpired = expiresDate < new Date();
      console.log(`   Истекает: ${expiresDate.toLocaleDateString('ru-RU')}`);
      console.log(`   Статус: ${isExpired ? '❌ Истекла' : '✅ Активна'}`);
    } else {
      console.log(`   Подписка: ❌ Не установлена`);
    }
    console.log('');

    if (!user.isPro) {
      console.error('🚫 ПРОБЛЕМА НАЙДЕНА:');
      console.error('   У пользователя НЕТ активной PRO подписки!');
      console.error('');
      console.error('📝 Правило:');
      console.error('   Начисление энергий за хештеги доступно только для PRO пользователей');
      console.error('   (Код: hashtag-parser.service.ts:497-500)');
      console.error('');
      console.error('🔧 Решение:');
      console.error('   1. Активировать подписку:');
      console.error(`      bun run activate-subscription.ts ${cleanUsername} 30`);
      console.error('   2. После активации хештеги будут работать автоматически');
      process.exit(0);
    }

    // 3. Проверить последние транзакции
    console.log('💰 Последние 10 транзакций:');
    const transactions = await db
      .select()
      .from(energyTransactions)
      .where(eq(energyTransactions.userId, user.id))
      .orderBy(desc(energyTransactions.createdAt))
      .limit(10);

    if (transactions.length === 0) {
      console.log('   ⚠️  Нет транзакций');
    } else {
      transactions.forEach((tx, i) => {
        const date = new Date(tx.createdAt).toLocaleString('ru-RU');
        console.log(`   ${i + 1}. ${tx.reason} | ${tx.amount > 0 ? '+' : ''}${tx.amount} ⚡ | ${date}`);
      });
    }
    console.log('');

    // 4. Проверить недельный лимит для #практика
    console.log('📅 Проверка недельного лимита (#практика):');
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Начало недели (воскресенье)
    weekStart.setHours(0, 0, 0, 0);

    const weeklyPraktika = await db
      .select()
      .from(energyTransactions)
      .where(
        and(
          eq(energyTransactions.userId, user.id),
          eq(energyTransactions.reason, 'Субботняя практика'),
          gte(energyTransactions.createdAt, weekStart)
        )
      );

    console.log(`   Начислений за эту неделю: ${weeklyPraktika.length}`);
    console.log(`   Лимит: 1 раз в неделю`);
    
    if (weeklyPraktika.length > 0) {
      console.log('   ⚠️  Лимит исчерпан на этой неделе!');
      console.log(`   Последнее начисление: ${new Date(weeklyPraktika[0].createdAt).toLocaleString('ru-RU')}`);
    } else {
      console.log('   ✅ Лимит доступен');
    }
    console.log('');

    // 5. Проверить день недели
    console.log('📆 Проверка дня недели:');
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Вс, 6=Сб
    const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    console.log(`   Сегодня: ${dayNames[dayOfWeek]}`);
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('   ✅ Выходной день (можно использовать #практика)');
    } else {
      console.log('   ❌ Будний день (#практика работает только Сб/Вс)');
      console.log('');
      console.error('🚫 ПРОБЛЕМА НАЙДЕНА:');
      console.error('   #практика можно использовать только в Субботу или Воскресенье!');
      console.error('');
      console.error('📝 Правило:');
      console.error('   weekendOnly: true (hashtag-parser.service.ts:53)');
      console.error('');
      console.error('🔧 Решение:');
      console.error('   Дождаться выходных (Сб/Вс) и попробовать снова');
      process.exit(0);
    }
    console.log('');

    // 6. Проверить город пользователя
    console.log('🌍 Проверка чата города:');
    if (user.city) {
      console.log(`   Город: ${user.city}`);
      if (user.cityChatId) {
        console.log(`   Chat ID: ${user.cityChatId}`);
        console.log('   ✅ Чат города настроен');
      } else {
        console.log('   ⚠️  Chat ID не установлен');
      }
    } else {
      console.log('   ⚠️  Город не указан');
    }
    console.log('');

    // 7. Итоговая диагностика
    console.log('🔍 ИТОГОВАЯ ДИАГНОСТИКА:\n');

    const issues = [];
    const checks = [];

    if (!user.isPro) {
      issues.push('❌ Нет PRO подписки');
    } else {
      checks.push('✅ PRO подписка активна');
    }

    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      issues.push('❌ Сегодня не выходной (нужна Сб/Вс)');
    } else {
      checks.push('✅ Выходной день');
    }

    if (weeklyPraktika.length > 0) {
      issues.push('❌ Недельный лимит исчерпан');
    } else {
      checks.push('✅ Недельный лимит доступен');
    }

    if (!user.city) {
      issues.push('⚠️  Город не указан');
    }

    console.log('Успешные проверки:');
    checks.forEach(check => console.log(`  ${check}`));
    console.log('');

    if (issues.length > 0) {
      console.log('Найденные проблемы:');
      issues.forEach(issue => console.log(`  ${issue}`));
      console.log('');
      console.log('💡 РЕКОМЕНДАЦИИ:\n');
      
      if (!user.isPro) {
        console.log('1. Активировать PRO подписку:');
        console.log(`   bun run activate-subscription.ts ${cleanUsername} 30`);
        console.log('');
      }
      
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        console.log('2. Дождаться выходных (Суббота или Воскресенье)');
        console.log('');
      }
      
      if (weeklyPraktika.length > 0) {
        console.log('3. Дождаться следующей недели');
        console.log('   (Недельный лимит обнуляется в воскресенье 00:00)');
        console.log('');
      }
    } else {
      console.log('✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ!');
      console.log('');
      console.log('💡 Если энергии всё равно не начисляются:');
      console.log('   1. Убедитесь, что сообщение содержит МЕДИА (фото/видео)');
      console.log('   2. Убедитесь, что хештег #практика написан правильно');
      console.log('   3. Убедитесь, что сообщение отправлено в ЧАТ ГОРОДА (не в десятку)');
      console.log('   4. Проверьте логи бота на Render.com');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

diagnoseHashtagIssue();
