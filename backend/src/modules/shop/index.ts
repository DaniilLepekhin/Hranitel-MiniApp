import { Elysia, t } from 'elysia';
import { shopService } from './service';
import { logger } from '@/utils/logger';
import { authMiddleware } from '@/middlewares/auth';

// Хелпер для проверки admin-секрета (как в admin/index.ts)
const checkAdminAuth = (headers: Record<string, string | undefined>) => {
  const adminSecret = headers['x-admin-secret'];
  return adminSecret === process.env.ADMIN_SECRET || adminSecret === 'local-dev-secret';
};

export const shopRoutes = new Elysia({ prefix: '/api/shop' })
  /**
   * GET /api/shop/items
   * Получить все товары магазина (публичный — каталог)
   */
  .get(
    '/items',
    async ({ query }) => {
      try {
        const { category } = query;

        const items = await shopService.getItems(
          category as 'elite' | 'secret' | 'savings' | undefined
        );

        return {
          success: true,
          items,
        };
      } catch (error) {
        logger.error('[Shop API] Error getting items:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get shop items',
        };
      }
    },
    {
      query: t.Object({
        category: t.Optional(t.Union([t.Literal('elite'), t.Literal('secret'), t.Literal('savings')])),
      }),
    }
  )

  /**
   * GET /api/shop/items/by-category
   * Получить товары сгруппированные по категориям (публичный — каталог)
   */
  .get('/items/by-category', async () => {
    try {
      const itemsByCategory = await shopService.getItemsByCategory();

      return {
        success: true,
        categories: itemsByCategory,
      };
    } catch (error) {
      logger.error('[Shop API] Error getting items by category:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get items by category',
      };
    }
  })

  /**
   * GET /api/shop/items/:id
   * Получить товар по ID (публичный — каталог)
   */
  .get(
    '/items/:id',
    async ({ params }) => {
      try {
        const item = await shopService.getItemById(params.id);

        return {
          success: true,
          item,
        };
      } catch (error) {
        logger.error('[Shop API] Error getting item:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get item',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  // ====================================================================
  // Все эндпоинты ниже требуют авторизации пользователя
  // ====================================================================
  .group('', (app) =>
    app
      .use(authMiddleware)

      /**
       * POST /api/shop/purchase
       * Купить товар (авторизованный пользователь покупает для себя)
       */
      .post(
        '/purchase',
        async ({ body, user, set }) => {
          try {
            if (!user) {
              set.status = 401;
              return { success: false, error: 'Unauthorized' };
            }

            const { itemId } = body;

            // Пользователь покупает только для себя
            const result = await shopService.purchaseItem(user.id, itemId);

            return result;
          } catch (error) {
            logger.error('[Shop API] Error purchasing item:', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to purchase item',
            };
          }
        },
        {
          body: t.Object({
            itemId: t.String(),
          }),
        }
      )

      /**
       * GET /api/shop/purchases
       * Получить покупки авторизованного пользователя
       */
      .get(
        '/purchases',
        async ({ user, query, set }) => {
          try {
            if (!user) {
              set.status = 401;
              return { success: false, error: 'Unauthorized' };
            }

            const { limit } = query;

            const purchases = await shopService.getUserPurchases(
              user.id,
              limit ? parseInt(limit) : 50
            );

            return {
              success: true,
              purchases,
            };
          } catch (error) {
            logger.error('[Shop API] Error getting purchases:', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get purchases',
            };
          }
        },
        {
          query: t.Object({
            limit: t.Optional(t.String()),
          }),
        }
      )

      /**
       * GET /api/shop/purchases/unused
       * Получить неиспользованные покупки авторизованного пользователя
       */
      .get(
        '/purchases/unused',
        async ({ user, set }) => {
          try {
            if (!user) {
              set.status = 401;
              return { success: false, error: 'Unauthorized' };
            }

            const purchases = await shopService.getUnusedPurchases(user.id);

            return {
              success: true,
              purchases,
            };
          } catch (error) {
            logger.error('[Shop API] Error getting unused purchases:', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get unused purchases',
            };
          }
        }
      )

      /**
       * GET /api/shop/purchased/:itemId
       * Получить детали купленного товара (с проверкой что пользователь купил его)
       */
      .get(
        '/purchased/:itemId',
        async ({ params, user, set }) => {
          try {
            if (!user) {
              set.status = 401;
              return {
                success: false,
                error: 'Unauthorized',
              };
            }

            const purchasedItem = await shopService.getPurchasedItem(user.id, params.itemId);

            if (!purchasedItem) {
              set.status = 404;
              return {
                success: false,
                error: 'Item not found or not purchased',
              };
            }

            return {
              success: true,
              item: purchasedItem,
            };
          } catch (error) {
            logger.error('[Shop API] Error getting purchased item:', error);
            set.status = 500;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get purchased item',
            };
          }
        },
        {
          params: t.Object({
            itemId: t.String(),
          }),
        }
      )

      /**
       * GET /api/shop/stats
       * Получить статистику покупок авторизованного пользователя
       */
      .get(
        '/stats',
        async ({ user, set }) => {
          try {
            if (!user) {
              set.status = 401;
              return { success: false, error: 'Unauthorized' };
            }

            const stats = await shopService.getUserPurchaseStats(user.id);

            return {
              success: true,
              stats,
            };
          } catch (error) {
            logger.error('[Shop API] Error getting stats:', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to get stats',
            };
          }
        }
      )

      /**
       * POST /api/shop/purchases/:id/use
       * Отметить покупку как использованную (только admin)
       */
      .post(
        '/purchases/:id/use',
        async ({ params, headers, user, set }) => {
          try {
            if (!checkAdminAuth(headers)) {
              set.status = 403;
              return {
                success: false,
                error: 'Forbidden: admin access required',
              };
            }

            if (!user) {
              set.status = 401;
              return { success: false, error: 'Unauthorized' };
            }

            const result = await shopService.markItemAsUsed(params.id, user.id);

            return result;
          } catch (error) {
            logger.error('[Shop API] Error marking item as used:', error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to mark item as used',
            };
          }
        },
        {
          params: t.Object({
            id: t.String(),
          }),
        }
      )
  );
