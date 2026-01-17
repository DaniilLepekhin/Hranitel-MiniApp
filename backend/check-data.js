const postgres = require('postgres');

const sql = postgres({
  host: '31.128.36.81',
  port: 5423,
  database: 'club_hranitel',
  username: 'postgres',
  password: 'kH*kyrS&9z7K',
  ssl: false,
});

async function check() {
  try {
    // Check overall stats
    console.log('=== Database Stats ===\n');
    const stats = await sql`
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN energies > 0 THEN 1 END) as users_with_energies,
        COUNT(CASE WHEN "isPro" = true THEN 1 END) as pro_users,
        COUNT(CASE WHEN city IS NOT NULL THEN 1 END) as users_with_city,
        COUNT(CASE WHEN "isPro" = true AND energies > 0 AND city IS NOT NULL THEN 1 END) as eligible_for_ratings
      FROM users
    `;
    console.log('Stats:', stats[0]);

    // Sample users
    console.log('\n=== Sample Users ===\n');
    const users = await sql`
      SELECT id, username, city, energies, "isPro", experience
      FROM users
      ORDER BY energies DESC
      LIMIT 10
    `;
    users.forEach(u => {
      console.log(`${u.username || 'No username'}: energies=${u.energies}, isPro=${u.isPro}, city=${u.city || 'none'}, exp=${u.experience}`);
    });

    // City ratings
    console.log('\n=== City Ratings (if any) ===\n');
    const cityRatings = await sql`
      SELECT
        city,
        SUM(energies) as total_energies,
        COUNT(*) as user_count
      FROM users
      WHERE "isPro" = true AND city IS NOT NULL AND energies > 0
      GROUP BY city
      ORDER BY total_energies DESC
      LIMIT 10
    `;

    if (cityRatings.length === 0) {
      console.log('No city ratings found (no users match criteria)');
    } else {
      cityRatings.forEach(r => {
        console.log(`${r.city}: ${r.total_energies} energies (${r.user_count} users)`);
      });
    }

    await sql.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

check();
