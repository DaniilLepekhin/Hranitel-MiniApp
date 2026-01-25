/**
 * 🎓 GetCourse Integration Service
 * Интеграция с GetCourse API для создания заказов после оплаты
 *
 * GetCourse API требует form-data с params в base64
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

interface GetCourseApiResponse {
  success: boolean;
  action?: string;
  result?: {
    success: boolean;
    deal_id?: number;
    user_id?: number;
    user_status?: string;
    error_message?: string;
    error?: boolean;
  };
  error_code?: number;
  error_message?: string;
}

/**
 * Создание сделки в GetCourse
 * API требует form-data с params в base64
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
    // Формируем params объект для GetCourse
    const params: Record<string, any> = {
      user: {
        email: userData.email,
        first_name: userData.first_name || '',
        addfields: {
          tg_id: userData.telegram_id?.toString() || '',
        },
      },
      deal: {
        offer_code: offerCode,
        deal_cost: dealCost,
        quantity: 1,
        deal_status: 'payed',
        deal_is_paid: 1,
        payment_status: 'accepted',
        addfields: {
          tg_id: userData.telegram_id?.toString() || '',
        },
      },
      system: {
        refresh_if_exists: 1,
      },
    };

    // Добавляем телефон только если он есть (GetCourse не любит пустой phone)
    if (userData.phone) {
      const cleanPhone = userData.phone.replace(/[^0-9]/g, '');
      if (cleanPhone) {
        params.user.phone = cleanPhone;
      }
    }

    // Добавляем UTM в addfields если есть
    if (userData.utm_source) {
      params.user.addfields.utm_source = userData.utm_source;
      params.deal.addfields.utm_source = userData.utm_source;
    }
    if (userData.utm_medium) {
      params.user.addfields.utm_medium = userData.utm_medium;
      params.deal.addfields.utm_medium = userData.utm_medium;
    }
    if (userData.utm_campaign) {
      params.user.addfields.utm_campaign = userData.utm_campaign;
      params.deal.addfields.utm_campaign = userData.utm_campaign;
    }
    if (userData.utm_content) {
      params.user.addfields.utm_content = userData.utm_content;
      params.deal.addfields.utm_content = userData.utm_content;
    }
    if (userData.platform_id) {
      params.user.addfields.platform_id = userData.platform_id;
      params.deal.addfields.platform_id = userData.platform_id;
    }

    // Формируем запрос к GetCourse API
    const apiUrl = `https://${GETCOURSE_ACCOUNT}.getcourse.ru/pl/api/deals`;

    // GetCourse требует params в base64
    const paramsBase64 = Buffer.from(JSON.stringify(params)).toString('base64');

    logger.info(
      {
        email: userData.email,
        offerCode,
        telegram_id: userData.telegram_id,
      },
      'Sending deal to GetCourse'
    );

    // Отправляем как form-data
    const formData = new URLSearchParams();
    formData.append('action', 'add');
    formData.append('key', GETCOURSE_SECRET);
    formData.append('params', paramsBase64);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
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

    const result = await response.json() as GetCourseApiResponse;

    // GetCourse возвращает success: true даже при ошибках валидации
    // Нужно проверять result.success и result.error
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

    // Проверяем внутренний результат
    if (result.result && !result.result.success) {
      logger.error(
        { error_message: result.result.error_message },
        'GetCourse deal creation failed'
      );
      return {
        success: false,
        error: result.result.error_message || 'Deal creation failed',
      };
    }

    logger.info(
      {
        email: userData.email,
        user_id: result.result?.user_id,
        deal_id: result.result?.deal_id,
        user_status: result.result?.user_status,
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
