import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function finalize(telegramIdStr: string) {
  const telegramId = telegramIdStr;
  const firstPurchaseDate = new Date('2025-01-26T00:00:00.000Z');
  const today = new Date();
  const subscriptionExpires = new Date(today);
  subscriptionExpires.setDate(subscriptionExpires.getDate() + 30);

  console.log('📝 Финализация подписки:');
  console.log(`   Дата первой покупки: ${firstPurchaseDate.toLocaleDateString('ru-RU')}`);
  console.log(`   Подписка до: ${subscriptionExpires.toLocaleDateString('ru-RU')}`);

  await db
    .update(users)
    .set({
      firstPurchaseDate: firstPurchaseDate,
      subscriptionExpires: subscriptionExpires,
      isPro: true,
      autoRenewalEnabled: false,
    })
    .where(eq(users.telegramId, telegramId));

  console.log('✅ Подписка активирована!');
  console.log(`\n📊 Итого:`);
  console.log(`   • Первая покупка: 26 января 2025`);
  console.log(`   • Подписка продлена: до ${subscriptionExpires.toLocaleDateString('ru-RU')}`);
  console.log(`   • Статус: PRO активен`);
}

finalize(process.argv[2] || '1303939651');
