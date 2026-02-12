import { db } from './src/db';
import { users, decades, decadeMembers } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function checkUser() {
  console.log('🔍 Поиск пользователя @kati_tsurkan...\n');
  
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, 'kati_tsurkan'))
    .limit(1);

  if (!user) {
    console.log('❌ Пользователь не найден');
    return;
  }

  console.log('✅ Пользователь найден:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Имя: ${user.firstName} ${user.lastName || ''}`);
  console.log(`   Username: @${user.username}`);
  console.log(`   Telegram ID: ${user.telegramId}`);
  console.log(`   Город в профиле: ${user.city || 'НЕ УКАЗАН'}`);
  console.log(`   Email: ${user.email || 'не указан'}`);

  // Проверить членство в десятках
  const memberships = await db
    .select()
    .from(decadeMembers)
    .where(eq(decadeMembers.userId, user.id));

  console.log(`\n📊 Членство в десятках: ${memberships.length}`);

  for (const membership of memberships) {
    const [decade] = await db
      .select()
      .from(decades)
      .where(eq(decades.id, membership.decadeId))
      .limit(1);

    if (decade) {
      console.log(`\n   Десятка: ${decade.city} №${decade.number}`);
      console.log(`   ID: ${decade.id}`);
      console.log(`   Chat ID: ${decade.tgChatId}`);
      console.log(`   Joined At: ${membership.joinedAt}`);
    }
  }

  // Проверить доступные десятки для Москвы
  console.log('\n🔍 Доступные десятки для Москвы:');
  const moscowDecades = await db
    .select()
    .from(decades)
    .where(eq(decades.city, 'Москва'));

  console.log(`   Всего десяток: ${moscowDecades.length}`);
  for (const decade of moscowDecades) {
    console.log(`   - №${decade.number}: Active=${decade.isActive}, Available=${decade.isAvailableForDistribution}, Full=${decade.isFull}`);
  }

  // Проверить доступные десятки для СПб
  console.log('\n🔍 Доступные десятки для Санкт-Петербург:');
  const spbDecades = await db
    .select()
    .from(decades)
    .where(eq(decades.city, 'Санкт-Петербург'));

  console.log(`   Всего десяток: ${spbDecades.length}`);
  for (const decade of spbDecades) {
    console.log(`   - №${decade.number}: Active=${decade.isActive}, Available=${decade.isAvailableForDistribution}, Full=${decade.isFull}`);
  }
}

checkUser();
