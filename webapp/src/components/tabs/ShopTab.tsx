'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Sparkles, Lock, Gift, Zap, Check } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';

// API endpoints
const shopApi = {
  getItemsByCategory: async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/shop/items/by-category`);
    if (!response.ok) throw new Error('Failed to fetch shop items');
    return response.json();
  },

  getUserBalance: async (userId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/energies/balance?userId=${userId}`);
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
    description: 'Розыгрыши разборов от экспертов',
  },
  {
    id: 'secret' as Category,
    title: 'Тайная комната',
    icon: Lock,
    description: 'Эксклюзивные уроки и практики',
  },
  {
    id: 'savings' as Category,
    title: 'Копилка',
    icon: Gift,
    description: 'Скидки и бонусы',
  },
];

export function ShopTab() {
  const [selectedCategory, setSelectedCategory] = useState<Category>('elite');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const { haptic, webApp } = useTelegram();
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Fetch shop items by category
  const { data: shopData, isLoading: itemsLoading } = useQuery({
    queryKey: ['shop', 'items-by-category'],
    queryFn: shopApi.getItemsByCategory,
    enabled: !!user && !!token,
    retry: false,
    staleTime: 60 * 1000,
    placeholderData: { success: true, categories: { elite: [], secret: [], savings: [] } },
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Fetch user balance
  const { data: balanceData } = useQuery({
    queryKey: ['ep', 'balance', user?.id],
    queryFn: () => shopApi.getUserBalance(user!.id),
    enabled: !!user && !!token,
    refetchInterval: 10000,
    retry: false,
    placeholderData: { success: true, balance: 0 },
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Fetch user purchases
  const { data: purchasesData } = useQuery({
    queryKey: ['shop', 'purchases', user?.id],
    queryFn: () => shopApi.getUserPurchases(user!.id),
    enabled: !!user && !!token,
    retry: false,
    staleTime: 60 * 1000,
    placeholderData: { success: true, purchases: [] },
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

      webApp?.showAlert('Покупка успешно совершена!');
    },
    onError: (error: Error) => {
      haptic.notification('error');
      webApp?.showAlert(error.message);
    },
  });

  // 🚀 ОПТИМИЗАЦИЯ: Мемоизация обработчиков для предотвращения лишних re-renders
  const handlePurchase = useCallback((item: any) => {
    setSelectedItem(item);
    setShowPurchaseModal(true);
    haptic.impact('light');
  }, [haptic]);

  const confirmPurchase = useCallback(() => {
    if (selectedItem) {
      haptic.impact('medium');
      purchaseMutation.mutate(selectedItem.id);
    }
  }, [selectedItem, haptic, purchaseMutation]);

  const balance = balanceData?.balance || 0;
  const items = shopData?.categories?.[selectedCategory] || [];
  const purchases = purchasesData?.purchases || [];

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="section-title">Магазин</h1>
        <p className="text-[#6b5a4a] text-sm text-center">
          Обменивай Energy Points на ценные призы
        </p>
      </div>

      {/* Balance Card */}
      <Card className="p-4 mb-6 bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#6b5a4a] text-sm mb-1">Твой баланс</p>
            <div className="flex items-center gap-2">
              <Zap className="w-6 h-6 text-[#d93547]" />
              <p className="text-3xl font-bold text-[#2b2520]">{balance.toLocaleString()}</p>
              <span className="text-[#d93547] font-semibold">Энергии</span>
            </div>
          </div>
          {purchases.length > 0 && (
            <div className="text-right">
              <p className="text-[#6b5a4a] text-xs">Куплено</p>
              <p className="text-2xl font-bold text-[#9c1723]">{purchases.length}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map((category) => {
          const isActive = selectedCategory === category.id;
          const IconComponent = category.icon;
          return (
            <button
              key={category.id}
              onClick={() => {
                setSelectedCategory(category.id);
                haptic.selection();
              }}
              className={`
                flex-1 min-w-[100px] p-3 rounded-xl transition-all duration-300 border
                ${isActive
                  ? 'bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white shadow-lg scale-105 border-[#d93547] shadow-[#d93547]/30'
                  : 'bg-white/60 text-[#6b5a4a] hover:bg-white/80 border-[#9c1723]/20'
                }
              `}
            >
              <IconComponent className="w-6 h-6 mx-auto mb-1" strokeWidth={2} />
              <div className="text-xs font-semibold">{category.title}</div>
            </button>
          );
        })}
      </div>

      {/* Category Description */}
      <div className="mb-4 p-3 bg-white/50 rounded-lg border border-[#9c1723]/20">
        <p className="text-[#6b5a4a] text-sm">
          {categories.find(c => c.id === selectedCategory)?.description}
        </p>
      </div>

      {/* Items Grid */}
      {itemsLoading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-[#d93547] to-[#9c1723] animate-pulse" />
          <p className="text-[#6b5a4a]">Загрузка товаров...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingBag className="w-16 h-16 mx-auto mb-3 text-[#9c1723]/50" />
          <p className="text-[#6b5a4a]">Товары скоро появятся</p>
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
                    <h3 className="font-semibold text-[#2b2520] mb-1">{item.title}</h3>
                    <p className="text-[#6b5a4a] text-xs mb-3 line-clamp-2">{item.description}</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-[#d93547]" />
                        <span className="text-lg font-bold text-[#d93547]">{item.price.toLocaleString()}</span>
                        <span className="text-xs text-[#6b5a4a]">Энергии</span>
                      </div>

                      {isPurchased ? (
                        <div className="flex items-center gap-1 text-[#9c1723] text-xs">
                          <Check className="w-4 h-4" />
                          <span>Куплено</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePurchase(item)}
                          disabled={!canAfford || purchaseMutation.isPending}
                          className={`
                            px-4 py-2 rounded-lg font-semibold text-sm transition-all border
                            ${canAfford
                              ? 'bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white border-[#d93547] hover:shadow-lg hover:shadow-[#d93547]/30 active:scale-95'
                              : 'bg-[#e8dcc6] text-[#6b5a4a] border-[#9c1723]/20 cursor-not-allowed'
                            }
                          `}
                        >
                          {canAfford ? 'Купить' : 'Недостаточно Энергии'}
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPurchaseModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#f8f6f0] rounded-2xl p-6 max-w-sm w-full border-2 border-[#9c1723]"
            >
              <h3 className="text-xl font-bold text-[#2b2520] mb-2">Подтверди покупку</h3>
              <p className="text-[#6b5a4a] mb-4">{selectedItem.title}</p>

              <div className="bg-white/80 rounded-lg p-3 mb-4 border border-[#9c1723]/20">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[#6b5a4a] text-sm">Цена:</span>
                  <div className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-[#d93547]" />
                    <span className="text-[#d93547] font-bold">{selectedItem.price.toLocaleString()}</span>
                    <span className="text-xs text-[#6b5a4a]">Энергии</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#6b5a4a] text-sm">Останется:</span>
                  <span className="text-[#2b2520] font-bold">{(balance - selectedItem.price).toLocaleString()} Энергии</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPurchaseModal(false)}
                  disabled={purchaseMutation.isPending}
                  className="flex-1 px-4 py-3 rounded-lg bg-white text-[#2b2520] font-semibold border border-[#9c1723]/30 hover:bg-[#e8dcc6] transition-all active:scale-95"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmPurchase}
                  disabled={purchaseMutation.isPending}
                  className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white font-semibold border border-[#d93547] hover:shadow-lg hover:shadow-[#d93547]/30 transition-all active:scale-95 disabled:opacity-50"
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
