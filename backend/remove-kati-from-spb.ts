import { db } from './src/db';
import { users, decades, decadeMembers } from './src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

async function removeUserFromDecade() {
  console.log('🔍 Поиск пользователя @kati_tsurkan...\n');
  
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, 'kati_tsurkan'))
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
  console.log(`   Город в профиле: ${user.city || 'НЕ УКАЗАН'}`);

  // Найти активное членство
  const [membership] = await db
    .select()
    .from(decadeMembers)
    .where(and(eq(decadeMembers.userId, user.id), isNull(decadeMembers.leftAt)))
    .limit(1);

  if (!membership) {
    console.log('\n❌ Пользователь не состоит ни в одной десятке');
    process.exit(0);
  }

  // Получить информацию о десятке
  const [decade] = await db
    .select()
    .from(decades)
    .where(eq(decades.id, membership.decadeId))
    .limit(1);

  if (!decade) {
    console.log('\n❌ Десятка не найдена');
    process.exit(1);
  }

  console.log(`\n📊 Текущая десятка: ${decade.city} №${decade.number}`);
  console.log(`   ID: ${decade.id}`);
  console.log(`   Joined At: ${membership.joinedAt}`);
  console.log(`   Current Members: ${decade.currentMembers}/${decade.maxMembers}`);

  // Подтверждение
  console.log('\n⚠️  УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ИЗ ДЕСЯТКИ...\n');

  try {
    await db.transaction(async (tx) => {
      // 1. Установить leftAt для членства
      await tx
        .update(decadeMembers)
        .set({ leftAt: new Date() })
        .where(eq(decadeMembers.id, membership.id));

      // 2. Уменьшить счётчик участников
      const newCount = Math.max(0, decade.currentMembers - 1);
      await tx
        .update(decades)
        .set({
          currentMembers: newCount,
          isFull: newCount >= decade.maxMembers ? true : false,
          updatedAt: new Date(),
        })
        .where(eq(decades.id, decade.id));

      console.log('✅ Пользователь удалён из десятки');
      console.log(`   Новое количество участников: ${newCount}/${decade.maxMembers}`);
    });

    console.log('\n✅ Транзакция завершена успешно');
    console.log('Теперь пользователь может вступить в десятку своего города (Москва)');
  } catch (error) {
    console.error('\n❌ Ошибка при удалении:', error);
    process.exit(1);
  }

  process.exit(0);
}

removeUserFromDecade();
