const postgres = require('postgres');

const sql = postgres({
  host: '31.128.36.81',
  port: 5423,
  database: 'club_hranitel',
  username: 'postgres',
  password: 'kH*kyrS&9z7K',
  ssl: false,
});

async function checkCityField() {
  try {
    // Проверить структуру таблицы users
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;

    console.log('=== Структура таблицы users ===\n');
    columns.forEach(col => {
      const marker = col.column_name === 'city' ? ' <- !!!' : '';
      console.log(col.column_name + ' (' + col.data_type + ')' + marker);
    });

    // Проверить есть ли поле city
    const hasCity = columns.some(col => col.column_name === 'city');

    console.log('\n=== Результат ===');
    console.log('Поле city существует в БД: ' + (hasCity ? 'ДА' : 'НЕТ'));

    if (hasCity) {
      // Проверить сколько пользователей с городом
      const stats = await sql`
        SELECT
          COUNT(*) as total_users,
          COUNT(city) as users_with_city,
          COUNT(DISTINCT city) as unique_cities
        FROM users
      `;
      console.log('\nВсего пользователей: ' + stats[0].total_users);
      console.log('С указанным городом: ' + stats[0].users_with_city);
      console.log('Уникальных городов: ' + stats[0].unique_cities);
    }

    await sql.end();
  } catch (error) {
    console.error('Ошибка:', error.message);
    process.exit(1);
  }
}

checkCityField();
