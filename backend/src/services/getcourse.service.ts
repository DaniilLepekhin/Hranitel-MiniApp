/**
 * 🎓 GetCourse Integration Service
 * Интеграция с GetCourse API для создания заказов после оплаты
 */

import { logger } from '@/utils/logger';

// GetCourse API credentials
const GETCOURSE_ACCOUNT = 'ishodniikod';
const GETCOURSE_SECRET = process.env.GETCOURSE_SECRET;

// GetCourse offer codes
const GETCOURSE_OFFERS = {
  '3_months': '6905452',
  '12_months': '6905454',
  '7_days': '6905456',
  'club_30_days': '7146498', // Основной оффер клуба на 30 дней
};

interface GetCourseUserData {
  email: string;
  phone?: string;
  first_name?: string;
  telegram_id?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  platform_id?: string;
}

interface GetCourseDealResult {
  success: boolean;
  user_id?: number;
  deal_id?: number;
  error?: string;
}

/**
 * Создание сделки в GetCourse
 */
export async function createGetCourseDeal(
  userData: GetCourseUserData,
  offerCode: string = GETCOURSE_OFFERS.club_30_days,
  dealCost: string = '0'
): Promise<GetCourseDealResult> {
  // Проверяем наличие API ключа
  if (!GETCOURSE_SECRET) {
    logger.warn('GETCOURSE_SECRET not configured, skipping GetCourse integration');
    return { success: false, error: 'GETCOURSE_SECRET not configured' };
  }

  try {
    // Очищаем телефон от спецсимволов
    const cleanPhone = userData.phone
      ? userData.phone.replace(/[^0-9]/g, '')
      : '';

    // Формируем данные для API
    const dealData = {
      quantity: 1,
      deal_status: 'payed',
      deal_is_paid: 1,
      payment_type: 'lava',
      payment_status: 'accepted',
      addfields: {
        tg_id: userData.telegram_id?.toString() || '',
        utm_content: userData.utm_content || '',
        platform_id: userData.platform_id || '',
        utm_campaign: userData.utm_campaign || '',
        utm_medium: userData.utm_medium || '',
        utm_source: userData.utm_source || '',
      },
    };

    const userDataGC = {
      first_name: userData.first_name || '',
      addfields: {
        tg_id: userData.telegram_id?.toString() || '',
        utm_content: userData.utm_content || '',
        platform_id: userData.platform_id || '',
        utm_campaign: userData.utm_campaign || '',
        utm_medium: userData.utm_medium || '',
        utm_source: userData.utm_source || '',
      },
    };

    const systemData = {
      refresh_if_exists: 1,
    };

    const sessionData = {
      utm_medium: userData.utm_medium || '',
      utm_campaign: userData.utm_campaign || '',
      utm_source: userData.utm_source || '',
      utm_content: userData.utm_content || '',
      platform_id: userData.platform_id || '',
    };

    // Формируем запрос к GetCourse API
    const apiUrl = `https://${GETCOURSE_ACCOUNT}.getcourse.ru/pl/api/deals`;

    const requestBody = {
      action: 'add',
      key: GETCOURSE_SECRET,
      params: {
        user: {
          email: userData.email,
          phone: cleanPhone,
          ...userDataGC,
        },
        deal: {
          offer_code: offerCode,
          deal_cost: dealCost,
          ...dealData,
        },
        system: systemData,
        session: sessionData,
      },
    };

    logger.info(
      {
        email: userData.email,
        offerCode,
        telegram_id: userData.telegram_id,
      },
      'Sending deal to GetCourse'
    );

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, statusText: response.statusText },
        'GetCourse API request failed'
      );
      return {
        success: false,
        error: `API request failed: ${response.status}`,
      };
    }

    const result = await response.json() as {
      success: boolean;
      error_code?: number;
      error_message?: string;
      result?: {
        user_id?: number;
        deal_id?: number;
      };
    };

    if (!result.success) {
      logger.error(
        { error_code: result.error_code, error_message: result.error_message },
        'GetCourse API returned error'
      );
      return {
        success: false,
        error: result.error_message || 'Unknown error',
      };
    }

    logger.info(
      {
        email: userData.email,
        user_id: result.result?.user_id,
        deal_id: result.result?.deal_id,
      },
      'Deal created in GetCourse successfully'
    );

    return {
      success: true,
      user_id: result.result?.user_id,
      deal_id: result.result?.deal_id,
    };
  } catch (error) {
    logger.error({ error, email: userData.email }, 'Failed to create GetCourse deal');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Отправка данных о подписке клуба в GetCourse
 */
export async function sendClubSubscriptionToGetCourse(
  email: string,
  phone: string | null,
  name: string | null,
  telegramId: number,
  utmData?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    platform_id?: string;
  }
): Promise<GetCourseDealResult> {
  return createGetCourseDeal(
    {
      email,
      phone: phone || undefined,
      first_name: name || undefined,
      telegram_id: telegramId,
      ...utmData,
    },
    GETCOURSE_OFFERS.club_30_days,
    '0' // Цена 0, так как оплата уже прошла через Lava
  );
}

export const getcourseService = {
  createDeal: createGetCourseDeal,
  sendClubSubscription: sendClubSubscriptionToGetCourse,
  OFFERS: GETCOURSE_OFFERS,
};
