import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function createAndGift() {
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
  console.log(`   Имя: ${gifter.firstName}`);
  console.log(`   Telegram ID: ${gifter.telegramId}`);

  // Создаём запись для получателя
  const today = new Date();
  const subscriptionExpires = new Date(today);
  subscriptionExpires.setDate(subscriptionExpires.getDate() + 30);

  console.log('\n📝 Создание записи для получателя...');
  
  try {
    await db
      .insert(users)
      .values({
        telegramId: recipientTgId,
        username: 'tania351974',
        firstName: 'Татьяна',
        email: 'tania351974@mail.ru',
        phone: '+79147151705',
        isPro: true,
        subscriptionExpires: subscriptionExpires,
        gifted: true,
        giftedBy: parseInt(gifter.telegramId),
        firstPurchaseDate: today,
        autoRenewalEnabled: false,
        onboardingStep: 'awaiting_keyword',
        metadata: {
          gifted_by: parseInt(gifter.telegramId),
          gift_date: today.toISOString(),
          gifter_name: `${gifter.firstName}`.trim(),
          gifter_username: gifter.username,
        }
      });

    console.log('✅ Пользователь создан и подписка активирована!');
    console.log(`\n📊 Детали:`);
    console.log(`   Получатель: Татьяна (@tania351974)`);
    console.log(`   Telegram ID: ${recipientTgId}`);
    console.log(`   Email: tania351974@mail.ru`);
    console.log(`   Телефон: +79147151705`);
    console.log(`   Даритель: ${gifter.firstName} (@${gifter.username})`);
    console.log(`   Подписка до: ${subscriptionExpires.toLocaleDateString('ru-RU')}`);
    console.log(`   Статус: Подарочная (gifted: true)`);
    console.log(`   onboardingStep: awaiting_keyword`);
    console.log(`\n📤 Готово к отправке онбординга!`);
  } catch (error: any) {
    if (error.message?.includes('unique constraint')) {
      console.log('⚠️  Пользователь уже существует, обновляем...');
      
      await db
        .update(users)
        .set({
          isPro: true,
          subscriptionExpires: subscriptionExpires,
          gifted: true,
          giftedBy: parseInt(gifter.telegramId),
          firstPurchaseDate: today,
          autoRenewalEnabled: false,
          onboardingStep: 'awaiting_keyword',
          metadata: {
            gifted_by: parseInt(gifter.telegramId),
            gift_date: today.toISOString(),
            gifter_name: `${gifter.firstName}`.trim(),
            gifter_username: gifter.username,
          }
        })
        .where(eq(users.telegramId, recipientTgId));
      
      console.log('✅ Подписка обновлена!');
    } else {
      throw error;
    }
  }
}

createAndGift();
