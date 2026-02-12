import { db } from './src/db';
import { users } from './src/db/schema';
import { eq, or } from 'drizzle-orm';

async function findUsers() {
  console.log('🔍 Поиск дарителя (kravchiy@rambler.ru)...');
  const gifter = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.email, 'kravchiy@rambler.ru'),
        eq(users.username, 'Elena_Vasilevna_Kravtsova')
      )
    )
    .limit(1);

  if (gifter.length === 0) {
    console.log('❌ Даритель не найден');
  } else {
    const g = gifter[0];
    console.log('✅ Даритель найден:');
    console.log(`   ID: ${g.id}`);
    console.log(`   Telegram ID: ${g.telegramId}`);
    console.log(`   Username: @${g.username || 'не указан'}`);
    console.log(`   Email: ${g.email || 'не указан'}`);
    console.log(`   Имя: ${g.firstName} ${g.lastName || ''}`);
  }

  console.log('\n🔍 Поиск получателя (tania351974@mail.ru / @tania351974)...');
  const recipient = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.email, 'tania351974@mail.ru'),
        eq(users.username, 'tania351974')
      )
    )
    .limit(1);

  if (recipient.length === 0) {
    console.log('❌ Получатель не найден');
  } else {
    const r = recipient[0];
    console.log('✅ Получатель найден:');
    console.log(`   ID: ${r.id}`);
    console.log(`   Telegram ID: ${r.telegramId}`);
    console.log(`   Username: @${r.username || 'не указан'}`);
    console.log(`   Email: ${r.email || 'не указан'}`);
    console.log(`   Имя: ${r.firstName} ${r.lastName || ''}`);
    console.log(`   Телефон: ${r.phone || 'не указан'}`);
  }

  if (gifter.length > 0 && recipient.length > 0) {
    console.log('\n📋 Команда для активации подарка:');
    console.log(`Даритель ID: ${gifter[0].id}`);
    console.log(`Получатель Telegram ID: ${recipient[0].telegramId}`);
  }
}

findUsers();
