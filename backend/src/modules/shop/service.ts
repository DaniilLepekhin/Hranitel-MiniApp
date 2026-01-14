import { db } from '@/db';
import { shopItems, shopPurchases, users } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { energyPointsService } from '../energy-points/service';

export class ShopService {
  /**
   * Получить товары магазина
   */
  async getItems(category?: 'elite' | 'secret' | 'savings') {
    try {
      const query = db
        .select()
        .from(shopItems)
        .where(eq(shopItems.isActive, true))
        .orderBy(shopItems.sortOrder, shopItems.createdAt);

      if (category) {
        const items = await query;
        return items.filter(item => item.category === category);
      }

      return await query;
    } catch (error) {
      logger.error('[Shop] Error getting items:', error);
      throw new Error('Failed to get shop items');
    }
  }

  /**
   * Получить товары по категориям
   */
  async getItemsByCategory() {
    try {
      const items = await this.getItems();

      return {
        elite: items.filter(item => item.category === 'elite'),
        secret: items.filter(item => item.category === 'secret'),
        savings: items.filter(item => item.category === 'savings'),
      };
    } catch (error) {
      logger.error('[Shop] Error getting items by category:', error);
      throw error;
    }
  }

  /**
   * Получить товар по ID
   */
  async getItemById(itemId: string) {
    try {
      const item = await db
        .select()
        .from(shopItems)
        .where(and(eq(shopItems.id, itemId), eq(shopItems.isActive, true)))
        .limit(1);

      if (item.length === 0) {
        throw new Error('Item not found');
      }

      return item[0];
    } catch (error) {
      logger.error('[Shop] Error getting item by ID:', error);
      throw error;
    }
  }

  /**
   * Купить товар
   */
  async purchaseItem(userId: string, itemId: string) {
    try {
      // Получаем информацию о товаре
      const item = await this.getItemById(itemId);

      // Проверяем баланс пользователя
      const balance = await energyPointsService.getBalance(userId);
      if (balance < item.price) {
        throw new Error('Insufficient energy points');
      }

      // Выполняем транзакцию
      await db.transaction(async (tx) => {
        // Списываем Энергии
        await energyPointsService.spend(
          userId,
          item.price,
          `Покупка: ${item.title}`,
          { itemId, itemType: item.itemType, category: item.category }
        );

        // Создаем запись о покупке
        await tx.insert(shopPurchases).values({
          userId,
          itemId,
          price: item.price,
          status: 'completed',
        });
      });

      logger.info(`[Shop] User ${userId} purchased item ${itemId} for ${item.price} Энергии`);

      return {
        success: true,
        item,
        newBalance: balance - item.price,
      };
    } catch (error) {
      logger.error('[Shop] Error purchasing item:', error);
      throw error;
    }
  }

  /**
   * Получить покупки пользователя
   */
  async getUserPurchases(userId: string, limit: number = 50) {
    try {
      const purchases = await db
        .select({
          id: shopPurchases.id,
          itemId: shopPurchases.itemId,
          price: shopPurchases.price,
          status: shopPurchases.status,
          purchasedAt: shopPurchases.purchasedAt,
          usedAt: shopPurchases.usedAt,
          // Join с товаром
          itemTitle: shopItems.title,
          itemDescription: shopItems.description,
          itemCategory: shopItems.category,
          itemType: shopItems.itemType,
          itemImageUrl: shopItems.imageUrl,
        })
        .from(shopPurchases)
        .leftJoin(shopItems, eq(shopPurchases.itemId, shopItems.id))
        .where(eq(shopPurchases.userId, userId))
        .orderBy(desc(shopPurchases.purchasedAt))
        .limit(limit);

      return purchases;
    } catch (error) {
      logger.error('[Shop] Error getting user purchases:', error);
      throw new Error('Failed to get user purchases');
    }
  }

  /**
   * Получить статистику покупок по категориям
   */
  async getUserPurchaseStats(userId: string) {
    try {
      const purchases = await this.getUserPurchases(userId);

      const stats = {
        total: purchases.length,
        totalSpent: purchases.reduce((sum, p) => sum + p.price, 0),
        byCategory: {
          elite: purchases.filter(p => p.itemCategory === 'elite').length,
          secret: purchases.filter(p => p.itemCategory === 'secret').length,
          savings: purchases.filter(p => p.itemCategory === 'savings').length,
        },
        byType: {
          raffle_ticket: purchases.filter(p => p.itemType === 'raffle_ticket').length,
          lesson: purchases.filter(p => p.itemType === 'lesson').length,
          discount: purchases.filter(p => p.itemType === 'discount').length,
        },
      };

      return stats;
    } catch (error) {
      logger.error('[Shop] Error getting purchase stats:', error);
      throw error;
    }
  }

  /**
   * Отметить товар как использованный
   */
  async markItemAsUsed(purchaseId: string, userId: string) {
    try {
      await db
        .update(shopPurchases)
        .set({
          status: 'used',
          usedAt: new Date(),
        })
        .where(
          and(
            eq(shopPurchases.id, purchaseId),
            eq(shopPurchases.userId, userId)
          )
        );

      logger.info(`[Shop] Purchase ${purchaseId} marked as used by user ${userId}`);

      return { success: true };
    } catch (error) {
      logger.error('[Shop] Error marking item as used:', error);
      throw error;
    }
  }

  /**
   * Получить неиспользованные покупки пользователя
   */
  async getUnusedPurchases(userId: string) {
    try {
      const purchases = await db
        .select({
          id: shopPurchases.id,
          itemId: shopPurchases.itemId,
          price: shopPurchases.price,
          purchasedAt: shopPurchases.purchasedAt,
          itemTitle: shopItems.title,
          itemType: shopItems.itemType,
          itemData: shopItems.itemData,
        })
        .from(shopPurchases)
        .leftJoin(shopItems, eq(shopPurchases.itemId, shopItems.id))
        .where(
          and(
            eq(shopPurchases.userId, userId),
            eq(shopPurchases.status, 'completed')
          )
        )
        .orderBy(desc(shopPurchases.purchasedAt));

      return purchases;
    } catch (error) {
      logger.error('[Shop] Error getting unused purchases:', error);
      throw error;
    }
  }
}

export const shopService = new ShopService();
