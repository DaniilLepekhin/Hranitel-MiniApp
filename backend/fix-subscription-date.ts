import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function fixDate(telegramIdStr: string) {
  const telegramId = telegramIdStr;
  const firstPurchaseDate = new Date('2025-01-26T00:00:00.000Z');
  const subscriptionExpires = new Date('2025-02-25T00:00:00.000Z');

  console.log('🔧 Исправление дат подписки...');
  console.log(`   Дата первой покупки: ${firstPurchaseDate.toISOString()}`);
  console.log(`   Подписка до: ${subscriptionExpires.toISOString()}`);

  await db
    .update(users)
    .set({
      firstPurchaseDate: firstPurchaseDate,
      subscriptionExpires: subscriptionExpires,
    })
    .where(eq(users.telegramId, telegramId));

  console.log('✅ Даты обновлены!');
  console.log('\n⚠️  ВНИМАНИЕ: Подписка истекла 25 февраля 2025!');
  console.log('   Возможно, нужно продлить на текущую дату?');
  
  const today = new Date();
  const newExpires = new Date(today);
  newExpires.setDate(newExpires.getDate() + 30);
  
  console.log('\n💡 Чтобы продлить подписку с сегодня на 30 дней:');
  console.log(`   subscription_expires = ${newExpires.toISOString()}`);
  console.log(`   Но first_purchase_date останется 2025-01-26`);
}

fixDate(process.argv[2] || '1303939651');
