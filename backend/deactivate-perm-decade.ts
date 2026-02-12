import { db } from './src/db';
import { users, decades } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function deactivateDecade() {
  console.log('🔍 Поиск пользователя @bysokolova...\n');
  
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, 'bysokolova'))
    .limit(1);

  if (!user) {
    console.log('❌ Пользователь не найден');
    process.exit(1);
  }

  console.log('✅ Пользователь найден:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Имя: ${user.firstName} ${user.lastName || ''}`);
  console.log(`   Telegram ID: ${user.telegramId}`);

  // Найти десятку где этот пользователь - лидер
  const [decade] = await db
    .select()
    .from(decades)
    .where(eq(decades.leaderUserId, user.id))
    .limit(1);

  if (!decade) {
    console.log('\n❌ Десятка не найдена');
    process.exit(1);
  }

  console.log(`\n📊 Найдена десятка: ${decade.city} №${decade.number}`);
  console.log(`   ID: ${decade.id}`);
  console.log(`   Active: ${decade.isActive}`);
  console.log(`   Available for Distribution: ${decade.isAvailableForDistribution}`);
  console.log(`   Members: ${decade.currentMembers}/${decade.maxMembers}`);

  console.log('\n⚠️  ДЕАКТИВАЦИЯ ДЕСЯТКИ...\n');

  await db
    .update(decades)
    .set({
      isActive: false,
      isAvailableForDistribution: false,
      updatedAt: new Date(),
    })
    .where(eq(decades.id, decade.id));

  console.log('✅ Десятка деактивирована!');
  console.log('   - isActive: false');
  console.log('   - isAvailableForDistribution: false');
  console.log('\nТеперь @bysokolova не сможет создавать новые десятки.');
  console.log('Существующая десятка Пермь №4 остается в БД, но неактивна.');

  process.exit(0);
}

deactivateDecade();
