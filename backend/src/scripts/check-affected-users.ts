import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const USERNAMES = ['ariakonda', 'nastenalife888', 'Schwepslana', 'TamaraVlad'];

async function checkUsers() {
  try {
    console.log('\n=== Проверка пользователей ===\n');

    for (const username of USERNAMES) {
      const [user] = await db
        .select({
          id: users.id,
          telegramId: users.telegramId,
          username: users.username,
          firstName: users.firstName,
          city: users.city,
          cityChatId: users.cityChatId,
        })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (user) {
        console.log(`@${user.username}:`);
        console.log(`  Telegram ID: ${user.telegramId}`);
        console.log(`  Город в базе: ${user.city || 'не указан'}`);
        console.log(`  City Chat ID: ${user.cityChatId || 'не указан'}`);
        console.log('');
      } else {
        console.log(`@${username}: НЕ НАЙДЕН`);
        console.log('');
      }
    }

    // Проверяем всех с cityChatId = 14
    const usersWithChat14 = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        username: users.username,
        city: users.city,
        cityChatId: users.cityChatId,
      })
      .from(users)
      .where(eq(users.cityChatId, 14));

    console.log(`\n=== Всего пользователей с cityChatId = 14: ${usersWithChat14.length} ===\n`);
    
    usersWithChat14.forEach(u => {
      console.log(`@${u.username || 'no_username'} (${u.telegramId}) - город: ${u.city}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
