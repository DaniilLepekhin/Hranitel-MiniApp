import { db, users, teams, teamMembers } from './src/db';
import { sql, eq, and, isNotNull, gt, desc } from 'drizzle-orm';
import postgres from 'postgres';

// Connect to old database
const oldDbConnection = postgres({
  host: '31.128.36.81',
  port: 5423,
  database: 'club_hranitel',
  username: 'postgres',
  password: 'kH*kyrS&9z7K',
  ssl: false,
});

async function testRatings() {
  console.log('=== Testing Ratings Data ===\n');

  // 1. Check users with energies
  console.log('1. Users with energies > 0:');
  const usersWithEnergies = await db
    .select({
      id: users.id,
      username: users.username,
      city: users.city,
      energies: users.energies,
      isPro: users.isPro,
    })
    .from(users)
    .where(gt(users.energies, 0))
    .limit(10);

  console.log(`   Found ${usersWithEnergies.length} users with energies`);
  usersWithEnergies.forEach(u => {
    console.log(`   - ${u.username || 'No username'}: ${u.energies} energies, city: ${u.city || 'none'}, isPro: ${u.isPro}`);
  });

  // 2. Check users with isPro = true
  console.log('\n2. Users with isPro = true:');
  const proUsers = await db
    .select({
      id: users.id,
      username: users.username,
      city: users.city,
      energies: users.energies,
      isPro: users.isPro,
    })
    .from(users)
    .where(eq(users.isPro, true))
    .limit(10);

  console.log(`   Found ${proUsers.length} pro users`);
  proUsers.forEach(u => {
    console.log(`   - ${u.username || 'No username'}: ${u.energies} energies, city: ${u.city || 'none'}`);
  });

  // 3. Check users with city
  console.log('\n3. Users with city set:');
  const usersWithCity = await db
    .select({
      id: users.id,
      username: users.username,
      city: users.city,
      energies: users.energies,
      isPro: users.isPro,
    })
    .from(users)
    .where(isNotNull(users.city))
    .limit(10);

  console.log(`   Found ${usersWithCity.length} users with city`);
  usersWithCity.forEach(u => {
    console.log(`   - ${u.username || 'No username'}: city: ${u.city}, ${u.energies} energies, isPro: ${u.isPro}`);
  });

  // 4. Check city_chats_ik
  console.log('\n4. Cities from city_chats_ik:');
  const citiesResult = await oldDbConnection<{ city: string }[]>`
    SELECT DISTINCT city
    FROM city_chats_ik
    WHERE country IS NOT NULL
      AND country != 'Украина'
    ORDER BY city
    LIMIT 10
  `;
  console.log(`   Found ${citiesResult.length} valid cities`);
  citiesResult.forEach(c => console.log(`   - ${c.city}`));

  // 5. Check teams
  console.log('\n5. Teams:');
  const allTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
    })
    .from(teams)
    .limit(10);

  console.log(`   Found ${allTeams.length} teams`);
  allTeams.forEach(t => console.log(`   - ${t.name}`));

  // 6. Try city ratings query
  console.log('\n6. City ratings (full query):');
  const ratings = await db
    .select({
      city: users.city,
      totalEnergies: sql<number>`SUM(${users.energies})`,
      userCount: sql<number>`COUNT(*)`,
    })
    .from(users)
    .where(
      and(
        eq(users.isPro, true),
        isNotNull(users.city),
        gt(users.energies, 0)
      )
    )
    .groupBy(users.city)
    .orderBy(sql`SUM(${users.energies}) DESC`)
    .limit(10);

  console.log(`   Found ${ratings.length} city ratings`);
  ratings.forEach(r => {
    console.log(`   - ${r.city}: ${r.totalEnergies} energies (${r.userCount} users)`);
  });

  await oldDbConnection.end();
  process.exit(0);
}

testRatings().catch(console.error);
