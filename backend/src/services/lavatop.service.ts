/**
 * 💳 LAVATOP API SERVICE
 *
 * Клиент для взаимодействия с LavaTop API.
 * Документация: https://developers.lava.top/ru
 * Swagger: https://gate.lava.top/docs/documentation.yaml
 *
 * Base URL: https://gate.lava.top
 * Аутентификация исходящих запросов: заголовок X-Api-Key: <LAVATOP_API_KEY>
 *
 * Webhook endpoints (настраиваются в ЛК LavaTop):
 *   POST https://app.successkod.com/api/webhooks/lavatop/payment
 *   POST https://app.successkod.com/api/webhooks/lavatop/recurring
 *
 * Whitelist IP LavaTop: 158.160.60.174
 */

import { config } from '@/config';
import { logger } from '@/utils/logger';

const LAVATOP_BASE_URL = 'https://gate.lava.top';

// ============================================================================
// TYPES
// ============================================================================

export type LavaTopCurrency = 'RUB' | 'USD' | 'EUR';
export type LavaTopPeriodicity = 'ONE_TIME' | 'MONTHLY' | 'PERIOD_90_DAYS' | 'PERIOD_180_DAYS';
export type LavaTopPaymentProvider = 'SMART_GLOCAL' | 'PAY2ME' | 'UNLIMIT' | 'STRIPE' | 'PAYPAL';
export type LavaTopPaymentMethod = 'CARD' | 'SBP' | 'PIX';

export interface CreateInvoiceParams {
  email: string;
  offerId: string;
  currency: LavaTopCurrency;
  periodicity?: LavaTopPeriodicity;
  paymentProvider?: LavaTopPaymentProvider;
  paymentMethod?: LavaTopPaymentMethod;
  buyerLanguage?: 'RU' | 'EN' | 'ES';
  clientUtm?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };
}

export interface CreateInvoiceResponse {
  id: string;
  status: string;
  amountTotal: {
    currency: string;
    amount: number;
  };
  paymentUrl: string;
}

export interface LavaTopSubscription {
  id: string;
  status: string;
  contractId: string;
  parentContractId: string | null;
  product: { id: string; title: string };
  buyer: { email: string };
  amount: number;
  currency: string;
  createdAt: string;
  cancelledAt?: string;
  willExpireAt?: string;
}

export interface LavaTopInvoice {
  id: string;
  status: string;
  amountTotal: { currency: string; amount: number };
  paymentUrl: string;
  createdAt: string;
}

// ============================================================================
// HELPERS
// ============================================================================

async function lavatopFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${LAVATOP_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Key': config.LAVATOP_API_KEY,
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.error({ path, status: response.status, body: text }, '[LavaTop] API request failed');
    throw new Error(`LavaTop API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// SERVICE
// ============================================================================

export const lavaTopService = {
  /**
   * Создать invoice (платёжную ссылку) через LavaTop API v3.
   * POST /api/v3/invoice
   * Returns: { id, status, amountTotal, paymentUrl }
   */
  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResponse> {
    logger.info({ email: params.email, offerId: params.offerId, currency: params.currency }, '[LavaTop] Creating invoice');

    const body: Record<string, unknown> = {
      email: params.email,
      offerId: params.offerId,
      currency: params.currency,
    };

    if (params.periodicity) body.periodicity = params.periodicity;
    if (params.paymentProvider) body.paymentProvider = params.paymentProvider;
    if (params.paymentMethod) body.paymentMethod = params.paymentMethod;
    if (params.buyerLanguage) body.buyerLanguage = params.buyerLanguage;
    if (params.clientUtm) body.clientUtm = params.clientUtm;

    const result = await lavatopFetch<CreateInvoiceResponse>('/api/v3/invoice', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    logger.info(
      { invoiceId: result.id, paymentUrl: result.paymentUrl, status: result.status },
      '[LavaTop] Invoice created'
    );

    return result;
  },

  /**
   * Отменить подписку.
   * DELETE /api/v1/subscriptions?contractId=<parentContractId>&email=<email>
   */
  async cancelSubscription(contractId: string, email: string): Promise<void> {
    logger.info({ contractId, email }, '[LavaTop] Cancelling subscription');

    const params = new URLSearchParams({ contractId, email });
    await lavatopFetch<unknown>(`/api/v1/subscriptions?${params.toString()}`, {
      method: 'DELETE',
    });

    logger.info({ contractId, email }, '[LavaTop] Subscription cancelled');
  },

  /**
   * Получить информацию о подписке.
   * GET /api/v1/subscriptions/{id}
   */
  async getSubscription(contractId: string): Promise<LavaTopSubscription> {
    return lavatopFetch<LavaTopSubscription>(`/api/v1/subscriptions/${contractId}`);
  },

  /**
   * Получить информацию об invoice.
   * GET /api/v1/invoices/{id}
   */
  async getInvoice(invoiceId: string): Promise<LavaTopInvoice> {
    return lavatopFetch<LavaTopInvoice>(`/api/v1/invoices/${invoiceId}`);
  },
};
