import { db } from './src/db';
import { decades, users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function activateUfa() {
  console.log('🔍 Активация десятки Уфа №3...\n');

  // Найти лидера @Vera28675
  const [leaderUser] = await db
    .select()
    .from(users)
    .where(eq(users.username, 'Vera28675'))
    .limit(1);

  if (!leaderUser) {
    console.log('❌ Лидер @Vera28675 не найден');
    process.exit(1);
  }

  console.log(`✅ Лидер найден: ${leaderUser.firstName} (@${leaderUser.username})`);
  console.log(`   Telegram ID: ${leaderUser.telegramId}`);

  // Найти десятку
  const [decade] = await db
    .select()
    .from(decades)
    .where(eq(decades.leaderUserId, leaderUser.id))
    .limit(1);

  if (!decade) {
    console.log('   ❌ Десятка не найдена');
    process.exit(1);
  }

  console.log(`   📊 Десятка найдена: ${decade.city} №${decade.number}`);
  console.log(`   ID: ${decade.id}`);
  console.log(`   Telegram Chat ID: ${decade.tgChatId}`);
  console.log(`   Статус до активации:`);
  console.log(`     - isActive: ${decade.isActive}`);
  console.log(`     - isAvailableForDistribution: ${decade.isAvailableForDistribution}`);

  // Активировать
  await db
    .update(decades)
    .set({
      isActive: true,
      isAvailableForDistribution: true,
    })
    .where(eq(decades.id, decade.id));

  console.log(`\n   ✅ АКТИВИРОВАНА для распределения!`);
}

activateUfa();
