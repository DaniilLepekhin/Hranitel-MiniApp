/**
 * Тестирование API баланса энергий
 */

import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { jwt } from '@elysiajs/jwt';
import { config } from './src/config';

async function testApiBalance(username: string) {
  try {
    console.log('🔧 Loading configuration...');
    console.log(`📁 Working directory: ${process.cwd()}`);
    
    // Получаем пользователя
    const user = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (user.length === 0) {
      console.log(`❌ Пользователь @${username} не найден`);
      return;
    }

    const userData = user[0];
    console.log(`\n👤 Пользователь найден:`);
    console.log(`   Username: @${userData.username}`);
    console.log(`   ID: ${userData.id}`);
    console.log(`   Telegram ID: ${userData.telegramId}`);
    console.log(`   Energies (БД): ${userData.energies || 0} ⚡`);

    // Генерируем JWT токен
    const jwtInstance = jwt({
      name: 'jwt',
      secret: config.JWT_SECRET,
      exp: '30d',
    });

    const token = await jwtInstance.decorator.jwt.sign({
      userId: userData.id,
      telegramId: userData.telegramId,
      username: userData.username,
    });

    console.log(`\n🔑 JWT Token сгенерирован`);

    // Получаем API URL
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    console.log(`\n🌐 API URL: ${apiUrl}`);

    // Делаем запрос к API
    console.log(`\n📡 Запрос: GET ${apiUrl}/api/v1/energies/balance`);
    
    const response = await fetch(`${apiUrl}/api/v1/energies/balance`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`\n📊 Статус ответа: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log(`\n📦 Ответ API:`);
    console.log(JSON.stringify(data, null, 2));

    if (data.success) {
      console.log(`\n✅ API вернул баланс: ${data.balance} ⚡`);
      
      if (data.balance !== userData.energies) {
        console.log(`\n⚠️  НЕСООТВЕТСТВИЕ!`);
        console.log(`   БД: ${userData.energies} ⚡`);
        console.log(`   API: ${data.balance} ⚡`);
      } else {
        console.log(`\n✅ Баланс совпадает с БД`);
      }
    } else {
      console.log(`\n❌ Ошибка API: ${data.error}`);
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

const username = process.argv[2] || 'anatolyi_tester';
testApiBalance(username);
