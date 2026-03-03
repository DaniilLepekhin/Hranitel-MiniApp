'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Crown, MessageSquare, Star, Sparkles, Video, Camera, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { energiesApi } from '@/lib/api';

/* ── Hashtag rules (с прогрессом за неделю) ────────────────── */

interface HashtagRuleCardProps {
  icon: React.ReactNode;
  hashtags: string;
  reward: number;
  periodLabel: string;
  used?: number;
  max: number;
  period: 'daily' | 'weekly';
  note?: string;
  isLeader: boolean;
  isCombo?: boolean;
}

function HashtagRuleCard({
  icon, hashtags, reward, periodLabel, used, max, period, note, isLeader, isCombo,
}: HashtagRuleCardProps) {
  const actualUsed = used ?? 0;
  const isFull = actualUsed >= max;
  const remaining = Math.max(max - actualUsed, 0);
  const displayReward = isLeader ? reward * 2 : reward;
  const pct = Math.min((actualUsed / max) * 100, 100);

  return (
    <div
      className={`rounded-2xl p-4 border transition-all ${
        isCombo
          ? 'bg-gradient-to-r from-[#d93547]/5 to-[#9c1723]/10 border-[#d93547]/20'
          : isFull
            ? 'bg-[#f0ede8] border-[#d4cfc6]'
            : 'bg-white border-[#9c1723]/10'
      }`}
    >
      {/* Top row: icon + hashtag + reward badge */}
      <div className="flex items-center gap-3 mb-2.5">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isCombo
              ? 'bg-gradient-to-br from-[#d93547] to-[#9c1723] text-white'
              : isFull
                ? 'bg-[#d4cfc6] text-white'
                : 'bg-[#d93547]/10 text-[#d93547]'
          }`}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <span className={`text-[14px] font-bold ${isFull ? 'text-[#9a958d]' : 'text-[#2b2520]'}`} style={{ fontFamily: 'Gilroy, sans-serif' }}>
            {hashtags}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[11px] ${isFull ? 'text-[#b0aaa2]' : 'text-[#6b5a4a]'}`} style={{ fontFamily: 'Gilroy, sans-serif' }}>
              {periodLabel}
            </span>
            {note && (
              <>
                <span className="text-[#d4cfc6]">&middot;</span>
                <span className={`text-[11px] ${isCombo ? 'text-[#d93547] font-medium' : isFull ? 'text-[#b0aaa2]' : 'text-[#6b5a4a]'}`} style={{ fontFamily: 'Gilroy, sans-serif' }}>
                  {note}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className="flex-shrink-0 px-3 py-1.5 rounded-xl"
          style={{
            background: isFull
              ? '#d4cfc6'
              : 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
          }}
        >
          <span style={{ fontFamily: 'Gilroy, sans-serif', fontWeight: 700, fontSize: '13px', color: '#f7f1e8' }}>
            +{displayReward}
          </span>
        </div>
      </div>

      {/* Progress section */}
      {used !== undefined && (
        <div>
          {/* Progress bar */}
          <div className="h-3 rounded-full bg-[#e8e4de] overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isFull
                  ? 'bg-[#b0aaa2]'
                  : isCombo
                    ? 'bg-gradient-to-r from-[#d93547] to-[#9c1723]'
                    : 'bg-gradient-to-r from-[#d93547] to-[#e04a5c]'
              }`}
              style={{ width: `${pct}%` }}
            />
            {/* Segment marks */}
            {max > 1 && Array.from({ length: max - 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full w-[2px] bg-[#f7f1e8]/60"
                style={{ left: `${((i + 1) / max) * 100}%` }}
              />
            ))}
          </div>

          {/* Labels under bar */}
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1">
              {/* Filled dots */}
              {Array.from({ length: max }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i < actualUsed
                      ? isCombo
                        ? 'bg-gradient-to-br from-[#d93547] to-[#9c1723]'
                        : isFull
                          ? 'bg-[#b0aaa2]'
                          : 'bg-[#d93547]'
                      : 'bg-[#e8e4de]'
                  }`}
                  style={i < actualUsed && (isCombo || !isFull) ? { background: 'linear-gradient(135deg, #d93547, #9c1723)' } : undefined}
                />
              ))}
            </div>

            <span
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 600,
                fontSize: '11px',
                color: isFull ? '#9a958d' : '#2d2620',
              }}
            >
              {isFull ? (
                <span style={{ color: '#9a958d' }}>
                  {period === 'daily' ? 'Выполнено сегодня' : 'Выполнено на неделе'}
                </span>
              ) : (
                <>
                  <span style={{ color: '#d93547', fontWeight: 700 }}>{actualUsed}</span>
                  <span style={{ color: '#6b5a4a' }}> из {max}</span>
                  <span style={{ color: '#6b5a4a' }}> &middot; </span>
                  <span style={{ color: '#2d2620' }}>
                    {remaining === 1 ? 'ещё 1 раз' : `ещё ${remaining} раза`}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Статические правила (без прогресс-бара) ─────────────── */

const EXTRA_RULES = [
  {
    title: 'Просмотр видео-урока (Ключа)',
    reward: 20,
    period: '1 раз за урок',
    description: 'Посмотри видео-урок — и получи баллы за каждый уникальный урок.',
  },
  {
    title: 'Просмотр записи эфира',
    reward: 20,
    period: '1 раз за запись',
    description: 'Посмотри запись прямого эфира в разделе материалов.',
  },
  {
    title: 'Анкета обратной связи',
    reward: 300,
    period: '1 раз в месяц',
    description: 'Заполни ежемесячную анкету обратной связи.',
  },
  {
    title: 'Продление подписки',
    reward: 500,
    period: 'при каждом продлении',
    description: 'Продли подписку — и получи бонус за лояльность.',
  },
];

/* ── Страница ──────────────────────────────────────────────── */

export default function EnergyRulesPage() {
  const router = useRouter();
  const { user, token } = useAuthStore();

  const { data: progressData, isLoading } = useQuery({
    queryKey: ['weekly-progress', user?.id],
    queryFn: () => energiesApi.getWeeklyProgress(),
    enabled: !!user && !!token,
  });

  const weeklyProgress = progressData?.progress;
  const isLeader = progressData?.isLeader || false;

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#f7f1e8]">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-[#2d2620]/20">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all active:scale-95"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 600,
            fontSize: '16px',
            color: '#2d2620',
            border: '1px solid #2d2620',
            backgroundColor: 'transparent',
          }}
        >
          <ArrowLeft className="w-5 h-5" />
          Назад
        </button>
        <h1
          className="flex-1 text-center mr-20"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '22px',
            color: '#2d2620',
          }}
        >
          Начисление баллов
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-8">
        {/* Intro */}
        <div className="mb-4 text-center">
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '13px',
              lineHeight: 1.5,
              color: '#6b5a4a',
            }}
          >
            Выполняй действия в клубе и получай Энергию.
            {isLeader && (
              <>
                <br />
                Лидеры десяток получают <span style={{ fontWeight: 700, color: '#9c1723' }}>x2</span> ко всем начислениям!
              </>
            )}
          </p>
        </div>

        {/* Leader badge */}
        {isLeader && (
          <div className="mb-4 flex justify-center">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10">
              <Crown className="w-4 h-4 text-[#d93547]" />
              <span style={{ fontFamily: 'Gilroy, sans-serif', fontWeight: 700, fontSize: '12px', color: '#d93547' }}>
                x2 бонус лидера активен
              </span>
            </div>
          </div>
        )}

        {/* Expiration notice */}
        <div
          className="mb-5 mx-auto px-4 py-3 rounded-xl"
          style={{
            background: 'linear-gradient(135deg, rgba(174, 30, 43, 0.08), rgba(156, 23, 35, 0.04))',
            maxWidth: '380px',
          }}
        >
          <p
            className="text-center"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '11px',
              lineHeight: 1.4,
              color: '#9c1723',
              fontWeight: 600,
            }}
          >
            Баллы действительны 6 месяцев с момента начисления. Не потраченные баллы сгорают.
          </p>
        </div>

        {/* ── HASHTAG RULES (с прогресс-барами) ── */}
        <div className="mb-6">
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: '18px',
              color: '#2d2620',
              marginBottom: '4px',
            }}
          >
            Хэштеги в чатах
          </p>
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '11px',
              color: '#6b5a4a',
              marginBottom: '12px',
            }}
          >
            Выполняй действия в чатах и получай Энергию. Неделя считается с Пн по Вс (МСК)
          </p>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-[#d93547] animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Десятка */}
              <p className="text-[10px] uppercase tracking-wider font-bold text-[#6b5a4a]/60 mb-1" style={{ fontFamily: 'Gilroy, sans-serif' }}>
                Чат десятки
              </p>

              <HashtagRuleCard
                icon={<MessageSquare className="w-4 h-4" />}
                hashtags="#отчет / #дз"
                reward={50}
                periodLabel="1 раз в день"
                used={weeklyProgress?.otchet?.used}
                max={1}
                period="daily"
                isLeader={isLeader}
              />

              {/* Город */}
              <p className="text-[10px] uppercase tracking-wider font-bold text-[#6b5a4a]/60 mt-4 mb-1" style={{ fontFamily: 'Gilroy, sans-serif' }}>
                Чат города
              </p>

              <HashtagRuleCard
                icon={<Star className="w-4 h-4" />}
                hashtags="#практика"
                reward={50}
                periodLabel="1 раз в неделю, Сб/Вс"
                used={weeklyProgress?.praktika?.used}
                max={1}
                period="weekly"
                note="С фото/видео"
                isLeader={isLeader}
              />

              <HashtagRuleCard
                icon={<Sparkles className="w-4 h-4" />}
                hashtags="#инсайт"
                reward={40}
                periodLabel="макс. 3 в неделю"
                used={weeklyProgress?.insight?.used}
                max={3}
                period="weekly"
                isLeader={isLeader}
              />

              <HashtagRuleCard
                icon={<Video className="w-4 h-4" />}
                hashtags="#созвон"
                reward={100}
                periodLabel="макс. 3 в неделю"
                used={weeklyProgress?.sozvon?.used}
                max={3}
                period="weekly"
                note="С фото/видео"
                isLeader={isLeader}
              />

              <HashtagRuleCard
                icon={<Camera className="w-4 h-4" />}
                hashtags="#сторис"
                reward={200}
                periodLabel="макс. 3 в неделю"
                used={weeklyProgress?.storis?.used}
                max={3}
                period="weekly"
                note="С фото/видео"
                isLeader={isLeader}
              />

              <HashtagRuleCard
                icon={<Zap className="w-4 h-4" />}
                hashtags="#созвон + #сторис"
                reward={300}
                periodLabel="макс. 3 в неделю"
                used={weeklyProgress?.combo?.used}
                max={3}
                period="weekly"
                note="Комбо! С фото/видео"
                isLeader={isLeader}
                isCombo
              />
            </div>
          )}
        </div>

        {/* ── ДОПОЛНИТЕЛЬНЫЕ ПРАВИЛА (статичные) ── */}
        <div>
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: '18px',
              color: '#2d2620',
              marginBottom: '4px',
            }}
          >
            Другие начисления
          </p>
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '11px',
              color: '#6b5a4a',
              marginBottom: '12px',
            }}
          >
            Баллы за активность в приложении и клубе
          </p>

          <div className="space-y-3">
            {EXTRA_RULES.map((rule, index) => (
              <div
                key={index}
                className="rounded-xl px-4 py-3 bg-white border border-[#9c1723]/10"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 700,
                      fontSize: '13px',
                      lineHeight: 1.3,
                      color: '#2d2620',
                      flex: 1,
                    }}
                  >
                    {rule.title}
                  </p>
                  <div
                    className="flex-shrink-0 px-2.5 py-1 rounded-lg"
                    style={{
                      background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 700,
                        fontSize: '13px',
                        color: '#f7f1e8',
                      }}
                    >
                      +{isLeader ? rule.reward * 2 : rule.reward}
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '11px',
                    lineHeight: 1.4,
                    color: '#6b5a4a',
                    marginBottom: '2px',
                  }}
                >
                  {rule.description}
                </p>

                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#9c1723',
                    opacity: 0.8,
                  }}
                >
                  {rule.period}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Shop promo */}
        <div className="mt-6 text-center">
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: '18px',
              color: '#2d2620',
              marginBottom: '6px',
            }}
          >
            Куда потратить баллы?
          </p>
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '12px',
              lineHeight: 1.4,
              color: '#6b5a4a',
            }}
          >
            Обменивай баллы на бонусы, подарки и возможности клуба в Магазине Энергии.
          </p>
        </div>
      </div>
    </div>
  );
}
