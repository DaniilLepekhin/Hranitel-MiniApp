import { Elysia, t } from 'elysia';
import { shopService } from './service';
import { logger } from '@/utils/logger';
import { authMiddleware } from '@/middlewares/auth';

export const shopRoutes = new Elysia({ prefix: '/api/shop' })
  /**
   * GET /api/shop/items
   * Получить все товары магазина
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
   * Получить товары сгруппированные по категориям
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
   * Получить товар по ID
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

  /**
   * POST /api/shop/purchase
   * Купить товар
   */
  .post(
    '/purchase',
    async ({ body }) => {
      try {
        const { userId, itemId } = body;

        const result = await shopService.purchaseItem(userId, itemId);

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
        userId: t.String(),
        itemId: t.String(),
      }),
    }
  )

  /**
   * GET /api/shop/purchases
   * Получить покупки пользователя
   */
  .get(
    '/purchases',
    async ({ query }) => {
      try {
        const { userId, limit } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const purchases = await shopService.getUserPurchases(
          userId,
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
        userId: t.String(),
        limit: t.Optional(t.String()),
      }),
    }
  )

  /**
   * GET /api/shop/purchases/unused
   * Получить неиспользованные покупки пользователя
   */
  .get(
    '/purchases/unused',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const purchases = await shopService.getUnusedPurchases(userId);

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
    },
    {
      query: t.Object({
        userId: t.String(),
      }),
    }
  )

  /**
   * GET /api/shop/purchased/:itemId
   * Получить детали купленного товара (с проверкой что пользователь купил его)
   * Требует авторизации
   */
  .group('/purchased', (app) =>
    app
      .use(authMiddleware)
      .get(
        '/:itemId',
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
  )

  /**
   * GET /api/shop/stats
   * Получить статистику покупок пользователя
   */
  .get(
    '/stats',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const stats = await shopService.getUserPurchaseStats(userId);

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
    },
    {
      query: t.Object({
        userId: t.String(),
      }),
    }
  )

  /**
   * POST /api/shop/purchases/:id/use
   * Отметить покупку как использованную
   */
  .post(
    '/purchases/:id/use',
    async ({ params, body }) => {
      try {
        const { userId } = body;

        const result = await shopService.markItemAsUsed(params.id, userId);

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
      body: t.Object({
        userId: t.String(),
      }),
    }
  );
