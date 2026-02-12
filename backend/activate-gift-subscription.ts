import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function activateGift() {
  const recipientTgId = '8037950832';
  const gifterEmail = 'kravchiy@rambler.ru';

  console.log('🔍 Поиск дарителя...');
  const [gifter] = await db
    .select()
    .from(users)
    .where(eq(users.email, gifterEmail))
    .limit(1);

  if (!gifter) {
    console.log('❌ Даритель не найден');
    process.exit(1);
  }

  console.log('✅ Даритель найден:');
  console.log(`   ID: ${gifter.id}`);
  console.log(`   Имя: ${gifter.firstName}`);
  console.log(`   Telegram ID: ${gifter.telegramId}`);
  console.log(`   Username: @${gifter.username}`);

  console.log('\n🔍 Поиск получателя...');
  const [recipient] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, recipientTgId))
    .limit(1);

  if (!recipient) {
    console.log('❌ Получатель не найден в базе');
    console.log('💡 Получатель должен сначала запустить бота: /start');
    process.exit(1);
  }

  console.log('✅ Получатель найден:');
  console.log(`   ID: ${recipient.id}`);
  console.log(`   Имя: ${recipient.firstName} ${recipient.lastName || ''}`);
  console.log(`   Telegram ID: ${recipient.telegramId}`);
  console.log(`   Username: @${recipient.username || 'не указан'}`);
  console.log(`   Email: ${recipient.email || 'не указан'}`);

  // Активируем подписку с пометкой о подарке
  const today = new Date();
  const subscriptionExpires = new Date(today);
  subscriptionExpires.setDate(subscriptionExpires.getDate() + 30);

  console.log('\n📝 Активация подарочной подписки...');
  await db
    .update(users)
    .set({
      isPro: true,
      subscriptionExpires: subscriptionExpires,
      gifted: true,
      giftedBy: parseInt(gifter.telegramId),
      firstPurchaseDate: today,
      autoRenewalEnabled: false,
      metadata: {
        ...((recipient.metadata as any) || {}),
        gifted_by: parseInt(gifter.telegramId),
        gift_date: today.toISOString(),
        gifter_name: `${gifter.firstName} ${gifter.lastName || ''}`.trim(),
        gifter_username: gifter.username,
      }
    })
    .where(eq(users.id, recipient.id));

  console.log('✅ Подписка активирована!');
  console.log(`\n📊 Детали:`);
  console.log(`   Получатель: ${recipient.firstName} (@${recipient.username})`);
  console.log(`   Даритель: ${gifter.firstName} (@${gifter.username})`);
  console.log(`   Подписка до: ${subscriptionExpires.toLocaleDateString('ru-RU')}`);
  console.log(`   Статус: Подарочная (gifted: true)`);
  console.log(`\n📤 Telegram ID получателя для отправки онбординга: ${recipientTgId}`);
}

activateGift();
