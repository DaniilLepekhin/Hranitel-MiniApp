import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

const telegramId = process.argv[2];
const days = parseInt(process.argv[3] || '30');

async function activateByTelegramId() {
  console.log(`🔍 Поиск пользователя с Telegram ID: ${telegramId}`);
  
  const user = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);

  if (user.length === 0) {
    console.log('❌ Пользователь не найден');
    console.log('💡 Попросите пользователя запустить бота: /start');
    process.exit(1);
  }

  const userData = user[0];
  console.log('✅ Пользователь найден:');
  console.log(`   ID: ${userData.id}`);
  console.log(`   Username: @${userData.username || 'не указан'}`);
  console.log(`   Имя: ${userData.firstName} ${userData.lastName || ''}`);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  await db
    .update(users)
    .set({
      isPro: true,
      subscriptionExpires: expiresAt,
      autoRenewalEnabled: false,
    })
    .where(eq(users.id, userData.id));

  console.log('✅ PRO подписка активирована');
  console.log(`   Действует до: ${expiresAt.toISOString()}`);
  
  process.exit(0);
}

activateByTelegramId();
