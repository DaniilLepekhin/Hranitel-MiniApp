import { db } from './src/db';
import { users, decades, decadeMembers } from './src/db/schema';
import { eq, and } from 'drizzle-orm';

async function removeLeaderStatus() {
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
  console.log(`   Username: @${user.username}`);
  console.log(`   Telegram ID: ${user.telegramId}`);
  console.log(`   Город: ${user.city || 'не указан'}`);
  console.log(`   Email: ${user.email || 'не указан'}`);

  // Проверить, есть ли десятка где этот пользователь - лидер
  const leaderDecades = await db
    .select()
    .from(decades)
    .where(eq(decades.leaderUserId, user.id));

  console.log(`\n📊 Десяток где пользователь лидер: ${leaderDecades.length}`);

  if (leaderDecades.length > 0) {
    console.log('\n⚠️  НАЙДЕНЫ ДЕСЯТКИ ГДЕ ПОЛЬЗОВАТЕЛЬ - ЛИДЕР:');
    for (const decade of leaderDecades) {
      console.log(`   - ${decade.city} №${decade.number} (ID: ${decade.id})`);
      console.log(`     Active: ${decade.isActive}, Available: ${decade.isAvailableForDistribution}`);
      console.log(`     Members: ${decade.currentMembers}/${decade.maxMembers}`);
    }

    console.log('\n❌ ОШИБКА: Пользователь является лидером десятки!');
    console.log('Сначала нужно назначить нового лидера или удалить десятку.');
    process.exit(1);
  }

  // Проверить членство в десятках с флагом isLeader
  const leaderMemberships = await db
    .select()
    .from(decadeMembers)
    .where(and(
      eq(decadeMembers.userId, user.id),
      eq(decadeMembers.isLeader, true)
    ));

  console.log(`\n📊 Членств с флагом isLeader: ${leaderMemberships.length}`);

  if (leaderMemberships.length > 0) {
    console.log('\n⚠️  Удаление флага isLeader из членства...');
    
    for (const membership of leaderMemberships) {
      await db
        .update(decadeMembers)
        .set({ isLeader: false })
        .where(eq(decadeMembers.id, membership.id));
      
      console.log(`   ✅ Флаг isLeader удален для membership ID: ${membership.id}`);
    }
  }

  console.log('\n✅ Готово!');
  console.log('Пользователь @bysokolova больше не может создавать десятки.');
  console.log('\nПримечание: Для возможности создания десятки нужны специальные права в БД.');
  console.log('В текущей реализации нет отдельной таблицы для "разрешенных лидеров".');

  process.exit(0);
}

removeLeaderStatus();
