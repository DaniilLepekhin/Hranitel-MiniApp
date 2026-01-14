'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Sparkles, Lock, Gift, Zap, Check, AlertCircle } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';

// API endpoints (будут добавлены в lib/api.ts)
const shopApi = {
  getItemsByCategory: async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/shop/items/by-category`);
    if (!response.ok) throw new Error('Failed to fetch shop items');
    return response.json();
  },

  getUserBalance: async (userId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ep/balance?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch balance');
    return response.json();
  },

  purchaseItem: async (userId: string, itemId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/shop/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, itemId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to purchase item');
    }
    return response.json();
  },

  getUserPurchases: async (userId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/shop/purchases?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch purchases');
    return response.json();
  },
};

type Category = 'elite' | 'secret' | 'savings';

const categories = [
  {
    id: 'elite' as Category,
    title: 'Элитный шанс',
    icon: Sparkles,
    emoji: '✨',
    gradient: 'from-yellow-400 to-orange-500',
    description: 'Розыгрыши разборов от экспертов',
  },
  {
    id: 'secret' as Category,
    title: 'Тайная комната',
    icon: Lock,
    emoji: '🔐',
    gradient: 'from-purple-400 to-pink-500',
    description: 'Эксклюзивные уроки и практики',
  },
  {
    id: 'savings' as Category,
    title: 'Копилка',
    icon: Gift,
    emoji: '🎁',
    gradient: 'from-emerald-400 to-teal-500',
    description: 'Скидки и бонусы',
  },
];

export function ShopTab() {
  const [selectedCategory, setSelectedCategory] = useState<Category>('elite');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const { haptic, webApp } = useTelegram();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Fetch shop items by category
  const { data: shopData, isLoading: itemsLoading } = useQuery({
    queryKey: ['shop', 'items-by-category'],
    queryFn: shopApi.getItemsByCategory,
    enabled: !!user,
  });

  // Fetch user balance
  const { data: balanceData } = useQuery({
    queryKey: ['ep', 'balance', user?.id],
    queryFn: () => shopApi.getUserBalance(user!.id),
    enabled: !!user,
    refetchInterval: 10000, // Refresh every 10s
  });

  // Fetch user purchases
  const { data: purchasesData } = useQuery({
    queryKey: ['shop', 'purchases', user?.id],
    queryFn: () => shopApi.getUserPurchases(user!.id),
    enabled: !!user,
  });

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: (itemId: string) => shopApi.purchaseItem(user!.id, itemId),
    onSuccess: () => {
      haptic.notification('success');
      queryClient.invalidateQueries({ queryKey: ['ep', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['shop', 'purchases'] });
      setShowPurchaseModal(false);
      setSelectedItem(null);

      webApp?.showAlert('✅ Покупка успешно совершена!');
    },
    onError: (error: Error) => {
      haptic.notification('error');
      webApp?.showAlert(`❌ ${error.message}`);
    },
  });

  const handlePurchase = (item: any) => {
    setSelectedItem(item);
    setShowPurchaseModal(true);
    haptic.impact('light');
  };

  const confirmPurchase = () => {
    if (selectedItem) {
      haptic.impact('medium');
      purchaseMutation.mutate(selectedItem.id);
    }
  };

  const balance = balanceData?.balance || 0;
  const items = shopData?.categories?.[selectedCategory] || [];
  const purchases = purchasesData?.purchases || [];

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-transparent mb-2">
          🛍️ Магазин
        </h1>
        <p className="text-gray-400 text-sm">
          Обменивай Energy Points на ценные призы
        </p>
      </div>

      {/* Balance Card */}
      <Card className="mb-6 bg-gradient-to-br from-orange-500/10 to-pink-500/10 border-orange-500/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm mb-1">Твой баланс</p>
            <div className="flex items-center gap-2">
              <Zap className="w-6 h-6 text-orange-400" />
              <p className="text-3xl font-bold text-white">{balance.toLocaleString()}</p>
              <span className="text-orange-400 font-semibold">EP</span>
            </div>
          </div>
          {purchases.length > 0 && (
            <div className="text-right">
              <p className="text-gray-400 text-xs">Куплено</p>
              <p className="text-2xl font-bold text-emerald-400">{purchases.length}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map((category) => {
          const isActive = selectedCategory === category.id;
          return (
            <button
              key={category.id}
              onClick={() => {
                setSelectedCategory(category.id);
                haptic.selection();
              }}
              className={`
                flex-1 min-w-[100px] p-3 rounded-xl transition-all duration-300
                ${isActive
                  ? `bg-gradient-to-r ${category.gradient} text-white shadow-lg scale-105`
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800'
                }
              `}
            >
              <div className="text-2xl mb-1">{category.emoji}</div>
              <div className="text-xs font-semibold">{category.title}</div>
            </button>
          );
        })}
      </div>

      {/* Category Description */}
      <div className="mb-4 p-3 bg-gray-800/30 rounded-lg border border-gray-700/30">
        <p className="text-gray-400 text-sm">
          {categories.find(c => c.id === selectedCategory)?.description}
        </p>
      </div>

      {/* Items Grid */}
      {itemsLoading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 animate-pulse" />
          <p className="text-gray-400">Загрузка товаров...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingBag className="w-16 h-16 mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">Товары скоро появятся</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item: any) => {
            const canAfford = balance >= item.price;
            const isPurchased = purchases.some((p: any) => p.itemId === item.id);

            return (
              <Card
                key={item.id}
                className={`
                  p-4 transition-all duration-300 hover:scale-[1.02]
                  ${!canAfford && 'opacity-60'}
                `}
              >
                <div className="flex gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                    <p className="text-gray-400 text-xs mb-3 line-clamp-2">{item.description}</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-orange-400" />
                        <span className="text-lg font-bold text-orange-400">{item.price.toLocaleString()}</span>
                        <span className="text-xs text-gray-500">EP</span>
                      </div>

                      {isPurchased ? (
                        <div className="flex items-center gap-1 text-emerald-400 text-xs">
                          <Check className="w-4 h-4" />
                          <span>Куплено</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePurchase(item)}
                          disabled={!canAfford || purchaseMutation.isPending}
                          className={`
                            px-4 py-2 rounded-lg font-semibold text-sm transition-all
                            ${canAfford
                              ? 'bg-gradient-to-r from-orange-400 to-pink-500 text-white hover:shadow-lg active:scale-95'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            }
                          `}
                        >
                          {canAfford ? 'Купить' : 'Недостаточно EP'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Purchase Confirmation Modal */}
      <AnimatePresence>
        {showPurchaseModal && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPurchaseModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-800"
            >
              <h3 className="text-xl font-bold text-white mb-2">Подтверди покупку</h3>
              <p className="text-gray-400 mb-4">{selectedItem.title}</p>

              <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">Цена:</span>
                  <div className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-orange-400" />
                    <span className="text-orange-400 font-bold">{selectedItem.price.toLocaleString()}</span>
                    <span className="text-xs text-gray-500">EP</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Останется:</span>
                  <span className="text-white font-bold">{(balance - selectedItem.price).toLocaleString()} EP</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPurchaseModal(false)}
                  disabled={purchaseMutation.isPending}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-800 text-white font-semibold hover:bg-gray-700 transition-all active:scale-95"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmPurchase}
                  disabled={purchaseMutation.isPending}
                  className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-orange-400 to-pink-500 text-white font-semibold hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {purchaseMutation.isPending ? 'Покупка...' : 'Купить'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
