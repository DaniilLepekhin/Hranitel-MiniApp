import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function verify() {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, '8037950832'))
    .limit(1);

  if (!user) {
    console.log('❌ Пользователь не найден');
    return;
  }

  console.log('✅ Проверка подарочной подписки:');
  console.log(`\n👤 Получатель:`);
  console.log(`   Имя: ${user.firstName}`);
  console.log(`   Username: @${user.username}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Telegram ID: ${user.telegramId}`);
  
  console.log(`\n🎁 Статус подписки:`);
  console.log(`   isPro: ${user.isPro}`);
  console.log(`   gifted: ${user.gifted}`);
  console.log(`   giftedBy (Telegram ID): ${user.giftedBy}`);
  console.log(`   subscriptionExpires: ${user.subscriptionExpires?.toLocaleDateString('ru-RU')}`);
  console.log(`   firstPurchaseDate: ${user.firstPurchaseDate?.toLocaleDateString('ru-RU')}`);
  
  console.log(`\n📋 Metadata:`);
  console.log(JSON.stringify(user.metadata, null, 2));

  // Найти дарителя
  if (user.giftedBy) {
    const [gifter] = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, user.giftedBy.toString()))
      .limit(1);
    
    if (gifter) {
      console.log(`\n💝 Даритель:`);
      console.log(`   Имя: ${gifter.firstName}`);
      console.log(`   Username: @${gifter.username}`);
      console.log(`   Email: ${gifter.email}`);
    }
  }
}

verify();
