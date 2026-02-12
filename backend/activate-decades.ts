import { db } from './src/db';
import { decades, users } from './src/db/schema';
import { eq, or } from 'drizzle-orm';

const leadersToActivate = [
  { username: 'Vera28675', city: 'Уфа', number: 3 },
  { username: 'elenagurina85', city: 'Ставрополь', number: 1 },
  { username: 'Tatyana_Plis', city: 'Ставрополь', number: 2 },
  { username: 'mitrofanova_i', city: 'Европа', number: 7 },
  { email: 'bormotovaleksej328@gmail.com', city: 'Нижний Новгород', number: 4 },
  { username: 'Kristinakello', city: 'Эстония', number: 1 },
  { username: 'NS_num', city: 'ДНР, ЛНР, Херсонская и Запорожская области', number: 2 },
];

async function activateDecades() {
  console.log('🔍 Поиск и активация десяток...\n');

  let activatedCount = 0;
  let notFoundCount = 0;

  for (const leader of leadersToActivate) {
    try {
      // Найти лидера
      let leaderUser;
      if (leader.username) {
        [leaderUser] = await db
          .select()
          .from(users)
          .where(eq(users.username, leader.username))
          .limit(1);
      } else if (leader.email) {
        [leaderUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, leader.email))
          .limit(1);
      }

      if (!leaderUser) {
        console.log(`❌ Лидер не найден: @${leader.username || leader.email}`);
        console.log(`   Город: ${leader.city}, Десятка №${leader.number}`);
        notFoundCount++;
        continue;
      }

      console.log(`✅ Лидер найден: ${leaderUser.firstName} (@${leaderUser.username})`);
      console.log(`   Telegram ID: ${leaderUser.telegramId}`);

      // Найти десятку по лидеру
      const [decade] = await db
        .select()
        .from(decades)
        .where(eq(decades.leaderUserId, leaderUser.id))
        .limit(1);

      if (!decade) {
        console.log(`   ⚠️  Десятка не найдена в базе`);
        console.log(`   💡 Возможно, нужно создать десятку для города "${leader.city}" №${leader.number}`);
        notFoundCount++;
        console.log('');
        continue;
      }

      console.log(`   📊 Десятка найдена: ${decade.city} №${decade.number}`);
      console.log(`   ID: ${decade.id}`);
      console.log(`   Telegram Chat ID: ${decade.tgChatId || 'не указан'}`);
      console.log(`   Текущий статус:`);
      console.log(`     - isActive: ${decade.isActive}`);
      console.log(`     - isAvailableForDistribution: ${decade.isAvailableForDistribution}`);
      console.log(`     - isFull: ${decade.isFull}`);
      console.log(`     - currentSize: ${decade.currentSize}/${decade.maxSize}`);

      // Активировать десятку
      await db
        .update(decades)
        .set({
          isActive: true,
          isAvailableForDistribution: true,
        })
        .where(eq(decades.id, decade.id));

      console.log(`   ✅ АКТИВИРОВАНА для распределения!`);
      activatedCount++;
      console.log('');
    } catch (error) {
      console.error(`   ❌ Ошибка при обработке лидера @${leader.username}:`, error);
      console.log('');
    }
  }

  console.log('\n📊 ИТОГО:');
  console.log(`   ✅ Активировано: ${activatedCount}`);
  console.log(`   ❌ Не найдено: ${notFoundCount}`);
}

activateDecades();
