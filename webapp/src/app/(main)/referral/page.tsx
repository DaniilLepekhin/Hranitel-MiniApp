'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, Gift, Copy, Check, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { referralApi } from '@/lib/api';

function buildRefLink(telegramId: string | number): string {
  return `https://t.me/SuccessKODBot?start=ref_${telegramId}`;
}

export default function ReferralPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const { data: agentData, isLoading } = useQuery({
    queryKey: ['referral', 'my-agent', user?.id],
    queryFn: () => referralApi.getMyAgent(),
    enabled: !!user,
  });

  const { data: referralsData } = useQuery({
    queryKey: ['referral', 'my-referrals', user?.id],
    queryFn: () => referralApi.getReferrals(),
    enabled: !!user && !!agentData?.agent,
  });

  const agent = agentData?.agent;
  const referrals = referralsData?.referrals || [];

  const refLink = user ? buildRefLink(user.telegramId) : '';

  const handleCopy = async () => {
    if (!refLink) return;
    await navigator.clipboard.writeText(refLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const freeMonthProgress = agent ? Math.min(agent.totalReferrals, 4) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Кабинет агента</h1>
      </div>

      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Загрузка...</div>
        ) : !agent ? (
          /* Not registered yet */
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto">
              <Gift className="w-8 h-8 text-pink-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Вы ещё не агент</h2>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              Откройте бот и нажмите «пригласить друга», чтобы зарегистрироваться в реферальной программе
            </p>
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                <div className="text-2xl font-bold text-gray-900">{agent.totalReferrals}</div>
                <div className="text-xs text-gray-500 mt-1">рефералов</div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                <div className="text-2xl font-bold text-green-600">{agent.pendingBonus}</div>
                <div className="text-xs text-gray-500 mt-1">руб ожидает</div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                <div className="text-2xl font-bold text-gray-900">{agent.totalBonusEarned}</div>
                <div className="text-xs text-gray-500 mt-1">руб всего</div>
              </div>
            </div>

            {/* Free month progress */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-pink-500" />
                <span className="text-sm font-medium text-gray-700">До бесплатного месяца</span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className={`flex-1 h-2 rounded-full ${n <= freeMonthProgress ? 'bg-pink-400' : 'bg-gray-100'}`}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {freeMonthProgress}/4 рефералов — приведи 4 и получи месяц бесплатно!
              </p>
            </div>

            {/* Referral link */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-pink-500" />
                <span className="text-sm font-medium text-gray-700">Ваша реферальная ссылка</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 font-mono break-all">
                  {refLink}
                </div>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 p-2 bg-pink-50 rounded-xl text-pink-500 hover:bg-pink-100 transition-colors"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              {copied && (
                <p className="text-xs text-green-500 mt-2">Ссылка скопирована!</p>
              )}
            </div>

            {/* Referrals list */}
            {referrals.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 mb-3">История рефералов</h3>
                <div className="space-y-2">
                  {referrals.map((ref) => (
                    <div key={ref.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-sm text-gray-800">Участник #{ref.referredTelegramId}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(ref.createdAt).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-green-600">+{ref.bonusAmount} руб</div>
                        <div className={`text-xs ${ref.status === 'paid' ? 'text-green-500' : 'text-orange-400'}`}>
                          {ref.status === 'paid' ? 'выплачено' : 'ожидает'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Как это работает</h3>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex gap-2">
                  <span className="font-bold text-pink-500">1.</span>
                  <span>Поделитесь ссылкой с другом</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-pink-500">2.</span>
                  <span>Друг переходит по ссылке и вступает в клуб</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-pink-500">3.</span>
                  <span>Вы получаете <strong>500 рублей</strong> бонус</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-pink-500">4.</span>
                  <span>4 реферала = <strong>бесплатный месяц</strong> в клубе!</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
