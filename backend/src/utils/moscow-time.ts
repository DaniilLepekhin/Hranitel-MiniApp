/**
 * Утилиты для работы с московским временем (UTC+3)
 */

/**
 * Рассчитать timestamp для точного времени по МСК на определенную дату
 * @param targetDate Целевая дата
 * @param hourMSK Час по МСК (0-23)
 * @param minuteMSK Минута (0-59)
 * @returns Unix timestamp в миллисекундах
 */
export function getMoscowTimeTimestamp(
  targetDate: Date,
  hourMSK: number,
  minuteMSK: number = 0
): number {
  // Создаем копию даты
  const moscowDate = new Date(targetDate);

  // Устанавливаем время в UTC (МСК = UTC+3, поэтому вычитаем 3 часа)
  moscowDate.setUTCHours(hourMSK - 3, minuteMSK, 0, 0);

  return moscowDate.getTime();
}

/**
 * Рассчитать timestamp для времени МСК через N дней от текущего момента
 * @param days Количество дней
 * @param hourMSK Час по МСК (0-23)
 * @param minuteMSK Минута (0-59)
 * @returns Unix timestamp в миллисекундах
 */
export function getMoscowTimeInDays(
  days: number,
  hourMSK: number,
  minuteMSK: number = 0
): number {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);
  return getMoscowTimeTimestamp(targetDate, hourMSK, minuteMSK);
}

/**
 * Получить завтра в указанное время МСК
 * @param hourMSK Час по МСК (0-23)
 * @param minuteMSK Минута (0-59)
 * @returns Unix timestamp в миллисекундах
 */
export function getTomorrowMoscowTime(hourMSK: number, minuteMSK: number = 0): number {
  return getMoscowTimeInDays(1, hourMSK, minuteMSK);
}

/**
 * Рассчитать delay в миллисекундах до указанного времени МСК на определенную дату
 * @param targetDate Целевая дата
 * @param hourMSK Час по МСК
 * @param minuteMSK Минута
 * @returns Delay в миллисекундах (может быть отрицательным если время уже прошло)
 */
export function getDelayUntilMoscowTime(
  targetDate: Date,
  hourMSK: number,
  minuteMSK: number = 0
): number {
  const targetTimestamp = getMoscowTimeTimestamp(targetDate, hourMSK, minuteMSK);
  const now = Date.now();
  return targetTimestamp - now;
}
