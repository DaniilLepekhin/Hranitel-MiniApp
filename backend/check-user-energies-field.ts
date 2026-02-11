#!/usr/bin/env bun
import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

const username = process.argv[2]?.replace('@', '') || 'anatolyi_tester';

const [user] = await db
  .select({
    username: users.username,
    energies: users.energies,
    telegramId: users.telegramId,
  })
  .from(users)
  .where(eq(users.username, username))
  .limit(1);

if (!user) {
  console.error(`Пользователь @${username} не найден`);
  process.exit(1);
}

console.log('👤 Пользователь:', user.username);
console.log('⚡ Поле energies в таблице users:', user.energies);
console.log('📱 Telegram ID:', user.telegramId);
