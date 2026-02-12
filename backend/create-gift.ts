import { db } from './src/db';
import { users, giftSubscriptions } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';

async function createGift() {
  // Найти дарителя
  const [gifter] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'kravchiy@rambler.ru'))
    .limit(1);

  if (!gifter) {
    console.log('❌ Даритель не найден');
    process.exit(1);
  }

  console.log('✅ Даритель найден:');
  console.log(`   Имя: ${gifter.firstName}`);
  console.log(`   Email: ${gifter.email}`);
  console.log(`   Telegram ID: ${gifter.telegramId}`);

  // Генерируем токен
  const activationToken = randomBytes(32).toString('hex');
  
  // Создаём запись о подарке
  const recipientTgId = 0; // Пока не знаем, т.к. пользователь не запускал бота
  
  console.log('\n⚠️  ПРОБЛЕМА: Получатель @tania351974 не запускал(а) бота');
  console.log('💡 РЕШЕНИЕ: Нужно сначала попросить получателя запустить бота /start');
  console.log('');
  console.log('📋 ИНСТРУКЦИЯ:');
  console.log('1. Попросите @tania351974 запустить бота: https://t.me/hranitel_kod_bot');
  console.log('2. Написать боту команду: /start');
  console.log('3. После этого запустите скрипт ещё раз');
  console.log('');
  console.log('🔧 АЛЬТЕРНАТИВА:');
  console.log('   Если есть Telegram ID получателя, можно активировать подписку напрямую');
  console.log('   Но без /start пользователь не получит онбординг');
}

createGift();
