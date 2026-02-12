import { db } from './src/db';
import { users } from './src/db/schema';
import { eq, or } from 'drizzle-orm';
import { bot } from './src/modules/bot/index';

async function unbanUser(identifier: string) {
  try {
    console.log(`🔍 Поиск пользователя: ${identifier}`);
    
    // Ищем по email, username или telegram_id
    const user = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, identifier),
          eq(users.username, identifier),
          eq(users.telegramId, identifier)
        )
      )
      .limit(1);

    if (user.length === 0) {
      console.log('❌ Пользователь не найден');
      console.log('💡 Проверьте email/username/telegram_id');
      process.exit(1);
    }

    const userData = user[0];
    console.log('✅ Пользователь найден:');
    console.log(`   ID: ${userData.id}`);
    console.log(`   Telegram ID: ${userData.telegramId}`);
    console.log(`   Username: @${userData.username || 'не указан'}`);
    console.log(`   Email: ${userData.email || 'не указан'}`);
    console.log(`   Имя: ${userData.firstName} ${userData.lastName || ''}`);
    console.log(`   Город: ${userData.city || 'не указан'}`);

    if (!userData.telegramId) {
      console.log('\n❌ У пользователя нет Telegram ID');
      process.exit(1);
    }

    console.log('\n🔓 Разблокировка в чатах...');

    // Список всех чатов для разблокировки
    const chats = [
      { id: '-1002319261802', name: 'Казахстан (город)' },
      { id: '-1002237043469', name: 'Москва (город)' },
      { id: '-1002348467091', name: 'СПб (город)' },
      { id: '-1002365620587', name: 'Другие города (город)' },
      { id: '-1002288329816', name: 'Новости и Анонсы (канал)' },
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const chat of chats) {
      try {
        await bot.api.unbanChatMember(chat.id, parseInt(userData.telegramId));
        console.log(`   ✅ ${chat.name}`);
        successCount++;
      } catch (error: any) {
        if (error.description?.includes('user is not a member')) {
          console.log(`   ⚠️  ${chat.name} - пользователь не был забанен`);
        } else if (error.description?.includes('not enough rights')) {
          console.log(`   ❌ ${chat.name} - нет прав для разбана`);
          errorCount++;
        } else {
          console.log(`   ❌ ${chat.name} - ошибка: ${error.description || error.message}`);
          errorCount++;
        }
      }
    }

    console.log('\n📊 Результат:');
    console.log(`   ✅ Разблокировано: ${successCount}`);
    console.log(`   ❌ Ошибок: ${errorCount}`);

    if (successCount > 0) {
      console.log('\n🎉 Пользователь разблокирован и может вступать в чаты!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

const identifier = process.argv[2];
if (!identifier) {
  console.log('Usage: bun run unban-user.ts <email|username|telegram_id>');
  console.log('Example: bun run unban-user.ts elen4ik83@mail.ru');
  process.exit(1);
}

unbanUser(identifier);
