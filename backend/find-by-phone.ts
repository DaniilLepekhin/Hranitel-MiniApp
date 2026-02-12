import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function findByPhone(phone: string) {
  console.log(`🔍 Поиск по телефону: ${phone}`);
  
  const user = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (user.length === 0) {
    console.log('❌ Пользователь не найден');
    console.log('💡 Возможно, пользователь ещё не запускал бота');
  } else {
    const u = user[0];
    console.log('✅ Пользователь найден:');
    console.log(`   ID: ${u.id}`);
    console.log(`   Telegram ID: ${u.telegramId}`);
    console.log(`   Username: @${u.username || 'не указан'}`);
    console.log(`   Email: ${u.email || 'не указан'}`);
    console.log(`   Имя: ${u.firstName} ${u.lastName || ''}`);
    console.log(`   Телефон: ${u.phone}`);
  }
}

findByPhone('+79147151705');
