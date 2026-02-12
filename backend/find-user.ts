import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function findUser(identifier: string) {
  // Ищем только по email
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, identifier))
    .limit(1);

  if (user.length === 0) {
    console.log('❌ Пользователь не найден');
    process.exit(1);
  }

  const userData = user[0];
  console.log('✅ Пользователь найден:');
  console.log('Telegram ID:', userData.telegramId);
  console.log('Username:', userData.username || 'не указан');
  console.log('Email:', userData.email || 'не указан');
  console.log('Имя:', userData.firstName, userData.lastName || '');
  console.log('Город:', userData.city || 'не указан');
}

findUser(process.argv[2] || 'elen4ik83@mail.ru');
