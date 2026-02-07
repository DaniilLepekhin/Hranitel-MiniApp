/**
 * Скрипт для включения десяток из CSV файла для распределения
 * Остальные десятки будут отключены от автоматического распределения
 */

import { db } from './db';
import { decades, users } from './db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface CSVRow {
  quantity: string;
  city: string;
  number: string;
  inviteLink: string;
  chatTitle: string;
  leaderName: string;
  leaderUsername: string;
  leaderPhone: string;
  leaderEmail: string;
}

function parseCSV(filePath: string): CSVRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Пропускаем заголовок
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const columns = line.split(',');

    // Пропускаем строки без номера десятки или города
    if (!columns[1] || !columns[2]) continue;

    rows.push({
      quantity: columns[0]?.trim() || '',
      city: columns[1]?.trim() || '',
      number: columns[2]?.trim() || '',
      inviteLink: columns[3]?.trim() || '',
      chatTitle: columns[4]?.trim() || '',
      leaderName: columns[5]?.trim() || '',
      leaderUsername: columns[6]?.trim().replace('@', '') || '',
      leaderPhone: columns[7]?.trim() || '',
      leaderEmail: columns[8]?.trim() || '',
    });
  }

  return rows;
}

async function enableCSVDecades() {
  console.log('🔄 Начинаем обработку CSV файла...\n');

  const csvPath = '/var/www/hranitel/migration/БАДДИ АМБАССАДОРАМ - Этап 1 - Распределение.csv';
  const csvRows = parseCSV(csvPath);

  console.log(`📊 Найдено ${csvRows.length} валидных строк в CSV\n`);

  // Шаг 1: Отключаем ВСЕ десятки от распределения
  console.log('🔄 Шаг 1: Отключаем все десятки от распределения...');
  const disableResult = await db
    .update(decades)
    .set({ isAvailableForDistribution: false })
    .returning({ id: decades.id });

  console.log(`✅ Отключено десяток: ${disableResult.length}\n`);

  // Шаг 2: Включаем только десятки из CSV
  console.log('🔄 Шаг 2: Включаем десятки из CSV...\n');

  let matchedByInviteLink = 0;
  let matchedByCityNumber = 0;
  let matchedByLeader = 0;
  let notFound = 0;

  for (const row of csvRows) {
    let matched = false;
    let matchMethod = '';

    // Стратегия 1: Поиск по invite link
    if (row.inviteLink && row.inviteLink.startsWith('https://t.me/')) {
      const [decade] = await db
        .select()
        .from(decades)
        .where(eq(decades.inviteLink, row.inviteLink))
        .limit(1);

      if (decade) {
        await db
          .update(decades)
          .set({ isAvailableForDistribution: true })
          .where(eq(decades.id, decade.id));

        matched = true;
        matchMethod = 'invite_link';
        matchedByInviteLink++;
      }
    }

    // Стратегия 2: Поиск по город + номер (если не нашли по ссылке)
    if (!matched && row.city && row.number) {
      const decadeNumber = parseInt(row.number);
      if (!isNaN(decadeNumber)) {
        const [decade] = await db
          .select()
          .from(decades)
          .where(
            and(
              eq(decades.city, row.city),
              eq(decades.number, decadeNumber)
            )
          )
          .limit(1);

        if (decade) {
          await db
            .update(decades)
            .set({ isAvailableForDistribution: true })
            .where(eq(decades.id, decade.id));

          matched = true;
          matchMethod = 'city+number';
          matchedByCityNumber++;
        }
      }
    }

    // Стратегия 3: Поиск по лидеру (если не нашли по предыдущим методам)
    if (!matched && row.leaderUsername && row.city && row.number) {
      // Найти пользователя по username
      const [leader] = await db
        .select()
        .from(users)
        .where(eq(users.username, row.leaderUsername))
        .limit(1);

      if (leader) {
        const decadeNumber = parseInt(row.number);
        if (!isNaN(decadeNumber)) {
          const [decade] = await db
            .select()
            .from(decades)
            .where(
              and(
                eq(decades.city, row.city),
                eq(decades.number, decadeNumber),
                eq(decades.leaderTelegramId, leader.telegramId)
              )
            )
            .limit(1);

          if (decade) {
            await db
              .update(decades)
              .set({ isAvailableForDistribution: true })
              .where(eq(decades.id, decade.id));

            matched = true;
            matchMethod = 'leader_username';
            matchedByLeader++;
          }
        }
      }
    }

    if (matched) {
      console.log(`✅ ${row.city} #${row.number} - найдена (метод: ${matchMethod})`);
    } else {
      console.log(`❌ ${row.city} #${row.number} - НЕ найдена в БД`);
      notFound++;
    }
  }

  console.log('\n📊 Итоговая статистика:');
  console.log(`   Найдено по invite_link: ${matchedByInviteLink}`);
  console.log(`   Найдено по city+number: ${matchedByCityNumber}`);
  console.log(`   Найдено по leader: ${matchedByLeader}`);
  console.log(`   НЕ найдено: ${notFound}`);
  console.log(`   ВСЕГО обработано: ${csvRows.length}`);

  // Шаг 3: Показываем финальное состояние
  const [enabledDecades] = await db
    .select({ count: decades.id })
    .from(decades)
    .where(eq(decades.isAvailableForDistribution, true));

  console.log(`\n✅ Десяток доступных для распределения: ${enabledDecades?.count || 0}`);

  process.exit(0);
}

enableCSVDecades().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
