import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function processPayment(telegramIdStr: string, firstPurchaseDateStr: string) {
  try {
    const telegramId = telegramIdStr;
    const firstPurchaseDate = new Date(firstPurchaseDateStr);
    
    console.log(`🔍 Поиск пользователя: ${telegramId}`);
    
    const user = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (user.length === 0) {
      console.log('❌ Пользователь не найден');
      process.exit(1);
    }

    const userData = user[0];
    console.log('✅ Пользователь найден:');
    console.log(`   ID: ${userData.id}`);
    console.log(`   Username: @${userData.username}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Город: ${userData.city}`);

    // Рассчитываем subscription_expires от даты первой покупки
    const subscriptionExpires = new Date(firstPurchaseDate);
    subscriptionExpires.setDate(subscriptionExpires.getDate() + 30);

    console.log('\n📝 Активация подписки:');
    console.log(`   Дата покупки: ${firstPurchaseDate.toISOString()}`);
    console.log(`   Действует до: ${subscriptionExpires.toISOString()}`);

    await db
      .update(users)
      .set({
        isPro: true,
        subscriptionExpires: subscriptionExpires,
        firstPurchaseDate: firstPurchaseDate,
        autoRenewalEnabled: false,
      })
      .where(eq(users.id, userData.id));

    console.log('✅ Подписка активирована!');
    console.log('\nТеперь запустите API для отправки онбординга:');
    console.log(`curl -X POST "https://hranitel.daniillepekhin.com/api/admin/manual-payment" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "x-admin-secret: local-dev-secret" \\`);
    console.log(`  -d '{"telegram_id": ${telegramId}, "days": 30, "source": "manual_activation"}'`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

const telegramId = process.argv[2];
const firstPurchaseDate = process.argv[3] || '2025-01-26';

if (!telegramId) {
  console.log('Usage: bun run manual-payment-with-date.ts <telegram_id> <first_purchase_date>');
  console.log('Example: bun run manual-payment-with-date.ts 1303939651 2025-01-26');
  process.exit(1);
}

processPayment(telegramId, firstPurchaseDate);
