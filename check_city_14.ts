import postgres from 'postgres';
import { config } from './backend/src/config';

const oldDb = postgres(config.OLD_DATABASE_URL!, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

async function checkCity14() {
  try {
    // Проверяем город с ID 14
    const result = await oldDb<any[]>`
      SELECT id, country, city, chat_name, chat_link, platform_id
      FROM city_chats_ik
      WHERE id = 14
    `;

    console.log('\n=== City Chat ID 14 ===');
    console.log(JSON.stringify(result, null, 2));

    // Проверяем все чаты Москвы и Питера
    const cities = await oldDb<any[]>`
      SELECT id, country, city, chat_name, platform_id
      FROM city_chats_ik
      WHERE city IN ('Москва', 'Санкт-Петербург', 'Питер', 'СПб')
      ORDER BY id
    `;

    console.log('\n=== Москва и Питер чаты ===');
    console.log(JSON.stringify(cities, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCity14();
