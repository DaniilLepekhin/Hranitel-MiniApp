import { db } from '../db';
import { decades, decadeMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';

async function findDecade() {
  try {
    // Найдём десятку номер 14 в Москве
    const moscowDecades = await db
      .select()
      .from(decades)
      .where(and(
        eq(decades.city, 'Москва'),
        eq(decades.number, 14)
      ));

    console.log('\n=== Десятка #14 Москва ===\n');
    
    if (moscowDecades.length === 0) {
      console.log('НЕ НАЙДЕНА');
      return;
    }

    const decade = moscowDecades[0];
    console.log(`ID: ${decade.id}`);
    console.log(`Название: ${decade.chatTitle || 'не установлено'}`);
    console.log(`Город: ${decade.city}`);
    console.log(`Номер: ${decade.number}`);
    console.log(`Telegram Chat ID: ${decade.telegramChatId || 'нет'}`);
    console.log(`Активна: ${decade.isActive ? 'да' : 'нет'}`);
    console.log(`Участников: ${decade.currentMembers || 0} / ${decade.maxMembers || 11}`);
    console.log('');

    // Найдём участников
    const members = await db
      .select({
        userId: decadeMembers.userId,
        telegramId: users.telegramId,
        username: users.username,
        firstName: users.firstName,
        city: users.city,
        cityChatId: users.cityChatId,
      })
      .from(decadeMembers)
      .leftJoin(users, eq(users.id, decadeMembers.userId))
      .where(eq(decadeMembers.decadeId, decade.id));

    console.log(`=== Участники (${members.length}) ===\n`);
    
    members.forEach((m, i) => {
      console.log(`${i + 1}. @${m.username || 'no_username'} (${m.firstName || 'no name'})`);
      console.log(`   Telegram ID: ${m.telegramId}`);
      console.log(`   Город в профиле: ${m.city || 'не указан'}`);
      console.log(`   City Chat ID: ${m.cityChatId || 'нет'}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findDecade();
