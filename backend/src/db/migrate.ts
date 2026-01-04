import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/academy_miniapp';

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  console.log('📍 Database URL:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));

  const migrationClient = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

runMigrations();
