import { db } from '../db';
import { decades, decadeMembers, users } from '../db/schema';
import { eq, or, like } from 'drizzle-orm';

async function findUser() {
  try {
    console.log('\n=== Поиск пользователя Ирина (irinapyanz@mail.ru) ===\n');

    // Ищем по email или username
    const foundUsers = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        city: users.city,
        cityChatId: users.cityChatId,
      })
      .from(users)
      .where(
        or(
          like(users.email, '%irinapyanz%'),
          like(users.username, '%irina%'),
          like(users.username, '%pyanz%'),
          like(users.firstName, '%Ирина%'),
          like(users.firstName, '%Irina%')
        )
      );

    console.log(`Найдено пользователей: ${foundUsers.length}\n`);

    for (const user of foundUsers) {
      console.log(`@${user.username || 'no_username'} (${user.firstName || 'no name'} ${user.lastName || ''})`);
      console.log(`  Email: ${user.email || 'не указан'}`);
      console.log(`  Telegram ID: ${user.telegramId}`);
      console.log(`  Город в профиле: ${user.city || 'не указан'}`);
      console.log(`  City Chat ID: ${user.cityChatId || 'не указан'}`);

      // Проверяем в какой десятке состоит
      const [membership] = await db
        .select({
          decadeId: decadeMembers.decadeId,
          decadeCity: decades.city,
          decadeNumber: decades.number,
          decadeName: decades.chatTitle,
        })
        .from(decadeMembers)
        .leftJoin(decades, eq(decades.id, decadeMembers.decadeId))
        .where(eq(decadeMembers.userId, user.id));

      if (membership) {
        console.log(`  Десятка: #${membership.decadeNumber} ${membership.decadeCity}`);
        console.log(`  ID десятки: ${membership.decadeId}`);
      } else {
        console.log(`  Десятка: не состоит`);
      }
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findUser();
