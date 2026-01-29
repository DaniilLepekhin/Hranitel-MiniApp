/**
 * Скрипт для заполнения квот городов на тест "Лидер десятки"
 * Запуск: npx tsx scripts/seed-city-quotas.ts
 */

import { db } from '../src/db';
import { leaderTestCityQuotas } from '../src/db/schema';

const cityQuotas = [
  { city: 'Азия', maxPassed: 2 },
  { city: 'Америка', maxPassed: 2 },
  { city: 'Армения', maxPassed: 2 },
  { city: 'Барнаул', maxPassed: 4 },
  { city: 'Беларусь', maxPassed: 4 },
  { city: 'Владивосток', maxPassed: 4 },
  { city: 'Волгоград', maxPassed: 4 },
  { city: 'Вологда', maxPassed: 2 },
  { city: 'Воронеж', maxPassed: 2 },
  { city: 'Германия', maxPassed: 5 },
  { city: 'Греция', maxPassed: 2 },
  { city: 'Дубай', maxPassed: 4 },
  { city: 'Европа', maxPassed: 7 },
  { city: 'Екатеринбург', maxPassed: 4 },
  { city: 'Иваново', maxPassed: 1 },
  { city: 'Ижевск', maxPassed: 2 },
  { city: 'Иркутск', maxPassed: 2 },
  { city: 'Йошкар-Ола', maxPassed: 3 },
  { city: 'Казань', maxPassed: 6 },
  { city: 'Казахстан', maxPassed: 4 },
  { city: 'Калининград', maxPassed: 3 },
  { city: 'Карелия', maxPassed: 1 },
  { city: 'Кемерово', maxPassed: 3 },
  { city: 'Кострома', maxPassed: 1 },
  { city: 'Краснодар', maxPassed: 6 },
  { city: 'Красноярск', maxPassed: 6 },
  { city: 'Крым', maxPassed: 5 },
  { city: 'Курск', maxPassed: 1 },
  { city: 'Кыргызстан', maxPassed: 2 },
  { city: 'Латвия', maxPassed: 2 },
  { city: 'Липецк', maxPassed: 1 },
  { city: 'Литва', maxPassed: 2 },
  { city: 'Махачкала', maxPassed: 1 },
  { city: 'Москва', maxPassed: 12 },
  { city: 'Нижний Новгород', maxPassed: 5 },
  { city: 'Новороссийск', maxPassed: 4 },
  { city: 'Новосибирск', maxPassed: 5 },
  { city: 'Новые территории', maxPassed: 1 },
  { city: 'Омск', maxPassed: 3 },
  { city: 'Орел', maxPassed: 1 },
  { city: 'Оренбург', maxPassed: 2 },
  { city: 'Пенза', maxPassed: 5 },
  { city: 'Пермь', maxPassed: 5 },
  { city: 'Петрозаводск', maxPassed: 1 },
  { city: 'Ростов на Дону', maxPassed: 6 },
  { city: 'Ростов-на-Дону', maxPassed: 6 }, // Вариант написания
  { city: 'Рязань', maxPassed: 4 },
  { city: 'Самара', maxPassed: 6 },
  { city: 'Саратов', maxPassed: 4 },
  { city: 'Смоленск', maxPassed: 1 },
  { city: 'Сочи', maxPassed: 6 },
  { city: 'СПБ', maxPassed: 6 },
  { city: 'Санкт-Петербург', maxPassed: 6 }, // Вариант написания
  { city: 'Ставрополь', maxPassed: 3 },
  { city: 'Тамбов', maxPassed: 1 },
  { city: 'Тверь', maxPassed: 1 },
  { city: 'Томск', maxPassed: 2 },
  { city: 'Тула', maxPassed: 2 },
  { city: 'Туркменистан', maxPassed: 1 },
  { city: 'Турция', maxPassed: 3 },
  { city: 'Тюмень', maxPassed: 5 },
  { city: 'Узбекистан', maxPassed: 2 },
  { city: 'Уфа', maxPassed: 3 },
  { city: 'Хабаровск', maxPassed: 3 },
  { city: 'Челябинск', maxPassed: 5 },
  { city: 'Чебоксары', maxPassed: 5 },
  { city: 'Эстония', maxPassed: 2 },
];

async function seedCityQuotas() {
  console.log('Starting city quotas seed...');

  let inserted = 0;
  let skipped = 0;

  for (const quota of cityQuotas) {
    try {
      await db
        .insert(leaderTestCityQuotas)
        .values(quota)
        .onConflictDoNothing();
      inserted++;
      console.log(`✓ ${quota.city}: ${quota.maxPassed}`);
    } catch (error) {
      // Если город уже есть - пропускаем
      skipped++;
      console.log(`○ ${quota.city} - already exists`);
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
  process.exit(0);
}

seedCityQuotas().catch((error) => {
  console.error('Error seeding city quotas:', error);
  process.exit(1);
});
