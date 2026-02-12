import { db } from './src/db';
import { decades, decadeMembers } from './src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

async function checkRealFill() {
  console.log('📊 Проверка реальной заполненности десяток Москвы:\n');
  
  const moscowDecades = await db
    .select()
    .from(decades)
    .where(eq(decades.city, 'Москва'));

  for (const decade of moscowDecades) {
    // Подсчитать реальное количество участников
    const members = await db
      .select()
      .from(decadeMembers)
      .where(
        and(
          eq(decadeMembers.decadeId, decade.id),
          isNull(decadeMembers.leftAt) // Только те, кто не вышел
        )
      );

    const realCount = members.length;
    const maxSize = decade.maxSize || 10;
    const isFull = realCount >= maxSize;

    console.log(`Десятка №${decade.number}:`);
    console.log(`  Реальных участников: ${realCount}/${maxSize}`);
    console.log(`  Флаг isFull в БД: ${decade.isFull}`);
    console.log(`  Должен быть isFull: ${isFull}`);
    
    if (decade.isFull !== isFull) {
      console.log(`  ⚠️  НЕСООТВЕТСТВИЕ! Нужно обновить флаг`);
    }
    
    if (!isFull && !decade.isAvailableForDistribution) {
      console.log(`  ⚠️  Есть места, но недоступна для распределения!`);
    }
    
    if (!isFull) {
      console.log(`  ✅ Есть ${maxSize - realCount} свободных мест`);
    }
    
    console.log('');
  }
}

checkRealFill();
