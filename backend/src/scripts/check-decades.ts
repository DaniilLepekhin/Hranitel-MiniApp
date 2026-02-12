import { db } from '../db';
import { decades, decadeMembers, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';

async function checkDecades() {
  try {
    console.log('\n=== Проверка десяток ===\n');

    // Проверим десятки Москвы и Питера
    const moscowDecades = await db
      .select()
      .from(decades)
      .where(eq(decades.city, 'Москва'));

    const spbDecades = await db
      .select()
      .from(decades)
      .where(eq(decades.city, 'Санкт-Петербург'));

    console.log(`\nДесятки Москвы: ${moscowDecades.length}`);
    moscowDecades.forEach(d => {
      console.log(`  ID ${d.id}: ${d.name} (чат: ${d.telegramChatId || 'нет'})`);
    });

    console.log(`\nДесятки Санкт-Петербурга: ${spbDecades.length}`);
    spbDecades.forEach(d => {
      console.log(`  ID ${d.id}: ${d.name} (чат: ${d.telegramChatId || 'нет'})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDecades();
