import { db } from '../db';
import { decades, decadeMembers, users } from '../db/schema';
import { eq, like } from 'drizzle-orm';

async function findUser() {
  try {
    console.log('\n=== Поиск irinapyanz@mail.ru ===\n');

    // Точный поиск по email
    const [user] = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        city: users.city,
        cityChatId: users.cityChatId,
      })
      .from(users)
      .where(like(users.email, '%irinapyanz@mail.ru%'))
      .limit(1);

    if (!user) {
      console.log('❌ Пользователь НЕ НАЙДЕН');
      console.log('Попробуйте поиск по другим данным (username, телефон)');
      process.exit(0);
    }

    console.log(`✅ Найден пользователь:`);
    console.log(`  Username: @${user.username || 'no_username'}`);
    console.log(`  Имя: ${user.firstName || 'no name'} ${user.lastName || ''}`);
    console.log(`  Email: ${user.email || 'не указан'}`);
    console.log(`  Telegram ID: ${user.telegramId}`);
    console.log(`  Город в профиле: ${user.city || 'не указан'}`);
    console.log(`  City Chat ID: ${user.cityChatId || 'не указан'}`);
    console.log('');

    // Проверяем в какой десятке
    const [membership] = await db
      .select({
        decadeId: decadeMembers.decadeId,
        decadeCity: decades.city,
        decadeNumber: decades.number,
        decadeName: decades.chatTitle,
      })
      .from(decadeMembers)
      .leftJoin(decades, eq(decades.id, decadeMembers.decadeId))
      .where(eq(decadeMembers.userId, user.id));

    if (membership) {
      console.log(`📍 Десятка: #${membership.decadeNumber} ${membership.decadeCity}`);
      console.log(`   ID десятки: ${membership.decadeId}`);
      console.log('');

      // ПРОБЛЕМА?
      if (user.city === 'Москва' && membership.decadeCity !== 'Москва') {
        console.log('🚨 НАЙДЕНА ПРОБЛЕМА!');
        console.log(`   Пользователь из города: ${user.city}`);
        console.log(`   Но в десятке города: ${membership.decadeCity}`);
        console.log('');
      } else if (user.city !== membership.decadeCity) {
        console.log('⚠️  Возможная проблема:');
        console.log(`   Город в профиле: ${user.city}`);
        console.log(`   Город десятки: ${membership.decadeCity}`);
        console.log('');
      } else {
        console.log('✅ Всё правильно - город совпадает');
      }
    } else {
      console.log(`📍 Не состоит в десятке`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findUser();
