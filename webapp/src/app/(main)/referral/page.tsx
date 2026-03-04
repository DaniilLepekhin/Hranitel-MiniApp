'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Check, ChevronRight, Users, Gift } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { referralApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';

function buildRefLink(telegramId: string | number): string {
  return `https://t.me/SuccessKODBot?start=ref_${telegramId}`;
}

export default function ReferralPage() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const { data: agentData, isLoading } = useQuery({
    queryKey: ['referral', 'my-agent', user?.id],
    queryFn: async () => {
      try {
        return await referralApi.getMyAgent();
      } catch {
        return { agent: null };
      }
    },
    enabled: !!user && !!token,
    retry: false,
    staleTime: 30 * 1000,
  });

  const { data: referralsData } = useQuery({
    queryKey: ['referral', 'my-referrals', user?.id],
    queryFn: async () => {
      try {
        return await referralApi.getReferrals();
      } catch {
        return { referrals: [] };
      }
    },
    enabled: !!user && !!token && !!agentData?.agent,
    retry: false,
  });

  const agent = agentData?.agent;
  const referrals = referralsData?.referrals || [];
  const refLink = user ? buildRefLink(user.telegramId) : '';

  const handleCopy = async () => {
    if (!refLink) return;
    try {
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const freeMonthProgress = agent ? Math.min(agent.totalReferrals, 4) : 0;

  return (
    <div className="min-h-screen bg-[#f8f6f0] pb-24">
      {/* Header */}
      <div className="px-4 pt-6 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#9c1723]/30"
          >
            <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[#2b2520]">Пригласи друга</h1>
            <p className="text-xs text-[#6b5a4a]">Реферальная программа клуба</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {isLoading ? (
          /* Skeleton */
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-white/60 animate-pulse" />
            ))}
          </div>

        ) : !agent ? (
          /* Не зарегистрирован */
          <>
            <div className="mb-2 p-4 rounded-xl bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10">
              <p className="text-sm text-[#2b2520]">
                Стань агентом — приглашай друзей в клуб и получай бонусы за каждого нового участника.
              </p>
            </div>

            {/* Как это работает */}
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-[#9c1723]/10">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#d93547]" />
                  <h2 className="text-base font-bold text-[#2b2520]">Как это работает</h2>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {[
                  { n: '1', text: 'Регистрируешься как агент в боте (3 вопроса)' },
                  { n: '2', text: 'Получаешь персональную ссылку' },
                  { n: '3', text: 'Друг оплачивает подписку по твоей ссылке' },
                  { n: '4', text: 'Тебе начисляется 500 рублей скидка' },
                ].map(({ n, text }) => (
                  <div key={n} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">{n}</span>
                    </div>
                    <p className="text-sm text-[#2b2520]">{text}</p>
                  </div>
                ))}
                <div className="mt-2 p-3 rounded-xl bg-[#d93547]/10">
                  <p className="text-sm font-semibold text-[#9c1723]">
                    ✨ 4 приглашённых = следующий месяц бесплатно!
                  </p>
                </div>
              </div>
            </Card>

            {/* CTA */}
            <Card className="bg-gradient-to-br from-[#d93547] to-[#9c1723] p-4">
              <p className="text-white text-sm font-semibold mb-1">Хочешь участвовать?</p>
              <p className="text-white/80 text-xs mb-3">
                Открой бота и нажми «пригласить друга» — регистрация займёт 2 минуты.
              </p>
              <div className="flex items-center gap-2 text-white/70 text-xs">
                <ChevronRight className="w-4 h-4" />
                <span>Меню бота → «пригласить друга»</span>
              </div>
            </Card>
          </>

        ) : (
          /* Зарегистрирован — личный кабинет */
          <>
            {/* Привет */}
            <div className="mb-2 p-4 rounded-xl bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10">
              <p className="text-sm font-semibold text-[#2b2520]">
                Привет, {agent.fullName.split(' ')[1] || agent.fullName.split(' ')[0]}! 👋
              </p>
              <p className="text-xs text-[#6b5a4a] mt-1">
                Это твой личный кабинет реферальной программы
              </p>
            </div>

            {/* Статистика */}
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-[#9c1723]/10">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#d93547]" />
                  <h2 className="text-base font-bold text-[#2b2520]">Статистика</h2>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[#9c1723]/10">
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-[#2b2520]">{agent.totalReferrals}</p>
                  <p className="text-xs text-[#6b5a4a] mt-1">рефералов</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-[#d93547]">{agent.pendingBonus}</p>
                  <p className="text-xs text-[#6b5a4a] mt-1">руб ожидает</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-[#2b2520]">{agent.totalBonusEarned}</p>
                  <p className="text-xs text-[#6b5a4a] mt-1">руб всего</p>
                </div>
              </div>
            </Card>

            {/* Прогресс до бесплатного месяца */}
            <Card className="p-4">
              <p className="text-sm font-semibold text-[#2b2520] mb-3">До бесплатного месяца</p>
              <div className="flex gap-2 mb-2">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className={`flex-1 h-2.5 rounded-full transition-all ${
                      n <= freeMonthProgress
                        ? 'bg-gradient-to-r from-[#d93547] to-[#9c1723]'
                        : 'bg-[#9c1723]/10'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-[#6b5a4a]">
                {freeMonthProgress} из 4 — {4 - freeMonthProgress > 0
                  ? `ещё ${4 - freeMonthProgress} ${freeMonthProgress === 3 ? 'человек' : 'человека'} и следующий месяц бесплатно!`
                  : '🎉 Ты заработал бесплатный месяц!'}
              </p>
            </Card>

            {/* Реферальная ссылка */}
            <Card className="p-4">
              <p className="text-sm font-semibold text-[#2b2520] mb-3">Твоя реферальная ссылка</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 bg-[#f8f6f0] border border-[#9c1723]/20 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-[#6b5a4a] font-mono truncate">{refLink}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center active:opacity-80 transition-opacity"
                >
                  {copied
                    ? <Check className="w-5 h-5 text-white" />
                    : <Copy className="w-5 h-5 text-white" />}
                </button>
              </div>
              {copied && (
                <p className="text-xs text-[#d93547] mt-2 font-medium">Ссылка скопирована!</p>
              )}
            </Card>

            {/* История рефералов */}
            {referrals.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-4 border-b border-[#9c1723]/10">
                  <h3 className="text-base font-bold text-[#2b2520]">История</h3>
                </div>
                <div className="divide-y divide-[#9c1723]/10">
                  {referrals.map((ref) => (
                    <div key={ref.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-[#2b2520]">Участник #{ref.referredTelegramId}</p>
                        <p className="text-xs text-[#6b5a4a]">
                          {new Date(ref.createdAt).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#d93547]">+{ref.bonusAmount} руб</p>
                        <p className={`text-xs ${ref.status === 'paid' ? 'text-green-500' : 'text-[#6b5a4a]'}`}>
                          {ref.status === 'paid' ? 'выплачено' : 'ожидает'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
