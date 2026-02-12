/**
 * ⚡ OPTIMIZATION: Static Data
 * 
 * Данные которые не меняются часто - hardcode для экономии API запросов
 */

// Список стран (обновляется редко)
export const COUNTRIES = [
  '🇷🇺 Россия',
  '🇰🇿 Казахстан',
  '🇧🇾 Беларусь',
  '🇺🇦 Украина',
  '🇺🇿 Узбекистан',
  '🇦🇲 Армения',
  '🇬🇪 Грузия',
  '🇦🇿 Азербайджан',
  '🇰🇬 Киргизия',
  '🇹🇯 Таджикистан',
  '🇲🇩 Молдова',
  '🇹🇲 Туркменистан',
  '🇪🇺 Европа',
  '🇺🇸 Америка',
  '🇦🇪 Дубай',
  '🇮🇱 Израиль',
  '🇹🇷 Турция',
  '🇩🇪 Германия',
] as const;

export type Country = typeof COUNTRIES[number];

// Cache для городов (24 часа)
interface CityCache {
  data: any[];
  timestamp: number;
}

const citiesCache = new Map<string, CityCache>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 день

/**
 * Получить города с кэшированием
 * Экономит повторные запросы для одной и той же страны
 */
export const getCitiesCached = async <T>(
  country: string,
  fetchFn: () => Promise<T[]>
): Promise<T[]> => {
  const cached = citiesCache.get(country);
  const now = Date.now();

  // Проверяем кэш
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data as T[];
  }

  // Запрашиваем с сервера
  const data = await fetchFn();

  // Сохраняем в кэш
  citiesCache.set(country, {
    data: data as any[],
    timestamp: now,
  });

  return data;
};

/**
 * Очистить кэш (если нужно)
 */
export const clearCitiesCache = () => {
  citiesCache.clear();
};

/**
 * Очистить кэш для конкретной страны
 */
export const clearCountryCityCache = (country: string) => {
  citiesCache.delete(country);
};
