const { Client } = require('pg');

const client = new Client({
  host: '31.128.36.81',
  port: 5423,
  database: 'club_hranitel',
  user: 'postgres',
  password: 'kH*kyrS&9z7K'
});

async function checkUser() {
  try {
    await client.connect();

    // Check user info
    const userResult = await client.query(`
      SELECT id, telegram_id, username, phone, email, is_pro, subscription_expires, city, created_at
      FROM users
      WHERE telegram_id = '191237923'
    `);
    console.log('User info:');
    console.log(JSON.stringify(userResult.rows[0], null, 2));

    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;

      // Check funnel progress
      const funnelResult = await client.query(`
        SELECT * FROM club_funnel_progress
        WHERE user_id = $1
      `, [userId]);
      console.log('\nFunnel progress:');
      console.log(JSON.stringify(funnelResult.rows, null, 2));
    } else {
      console.log('User not found');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkUser();
