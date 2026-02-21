'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MessageSquareHeart,
  Star,
  Users,
  Heart,
  Send,
  Zap,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { feedbackSurveyApi } from '@/lib/api';
import { FullscreenButton } from '@/components/ui/FullscreenButton';

export default function FeedbackPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['feedback-survey', user?.id],
    queryFn: () => feedbackSurveyApi.getCurrent(),
    enabled: !!user,
  });

  const survey = data?.survey;

  // Form state
  const [q1, setQ1] = useState<number | null>(null);
  const [q2, setQ2] = useState<number | null>(null);
  const [q3, setQ3] = useState<number | null>(null);
  const [q4, setQ4] = useState<number | null>(null);
  const [q5, setQ5] = useState<number | null>(null);
  const [q6, setQ6] = useState('');
  const [q7, setQ7] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [awardedEnergy, setAwardedEnergy] = useState(0);

  const submitMutation = useMutation({
    mutationFn: () =>
      feedbackSurveyApi.submit({
        q1Useful: q1!,
        q2Involved: q2!,
        q3Ambassador: q3!,
        q4Decade: survey?.isInDecade ? q4 : null,
        q5Nps: q5!,
        q6Valuable: q6 || null,
        q7Improve: q7 || null,
      }),
    onSuccess: (res) => {
      setSubmitted(true);
      setAwardedEnergy(res.energyAwarded);
      queryClient.invalidateQueries({ queryKey: ['feedback-survey'] });
      queryClient.invalidateQueries({ queryKey: ['energies'] });
    },
  });

  const isFormValid =
    q1 !== null &&
    q2 !== null &&
    q3 !== null &&
    q5 !== null &&
    (!survey?.isInDecade || q4 !== null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#d93547] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not open yet
  if (survey && !survey.isOpen && !survey.isCompleted) {
    return (
      <>
        <FullscreenButton />
        <div className="px-4 pt-6 pb-24 min-h-screen">
          <Header onBack={() => router.back()} />
          <div className="mt-20 text-center">
            <Clock className="w-16 h-16 mx-auto mb-4 text-[#d93547]/30" />
            <h2 className="text-xl font-bold text-[#2b2520] mb-2">Анкета откроется скоро</h2>
            <p className="text-sm text-[#6b5a4a]">
              Доступна с 23 февраля (понедельник) в 00:00 по Москве
            </p>
          </div>
        </div>
      </>
    );
  }

  // Already completed or just submitted
  if (survey?.isCompleted || submitted) {
    return (
      <>
        <FullscreenButton />
        <div className="px-4 pt-6 pb-24 min-h-screen">
          <Header onBack={() => router.back()} />
          <div className="mt-12 text-center">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#2b2520] mb-2">Спасибо!</h2>
            <p className="text-sm text-[#6b5a4a] mb-6">
              Ваши ответы помогут нам сделать клуб лучше
            </p>
            {awardedEnergy > 0 && (
              <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10">
                <Zap className="w-5 h-5 text-[#d93547]" />
                <span className="text-lg font-bold text-[#d93547]">+{awardedEnergy}</span>
                <span className="text-sm text-[#6b5a4a]">энергий начислено</span>
              </div>
            )}
            <button
              onClick={() => router.push('/')}
              className="mt-8 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white font-semibold text-sm"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <FullscreenButton />
      <div className="px-4 pt-6 pb-32 min-h-screen">
        <Header onBack={() => router.back()} />

        {/* Reward banner */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10 border border-[#d93547]/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#2b2520]">
                +{survey?.energyReward} энергий за заполнение
              </p>
              <p className="text-xs text-[#6b5a4a]">
                Ответьте на вопросы и получите баллы
              </p>
            </div>
          </div>
        </div>

        {/* PART 1: Оценка месяца */}
        <SectionHeader
          icon={<Star className="w-5 h-5 text-white" />}
          title="Оценка месяца"
          part={1}
        />

        <ScaleInfo />

        <RatingQuestion
          number={1}
          text="Этот месяц был для меня полезным"
          value={q1}
          onChange={setQ1}
          max={5}
        />

        <RatingQuestion
          number={2}
          text="Я была вовлечена в жизнь Клуба (эфиры, активности, общение)"
          value={q2}
          onChange={setQ2}
          max={5}
        />

        <RatingQuestion
          number={3}
          text="Взаимодействие с Амбассадором (лицом города)"
          value={q3}
          onChange={setQ3}
          max={5}
        />

        {survey?.isInDecade && (
          <RatingQuestion
            number={4}
            text="Формат Десятки помогает моему росту"
            value={q4}
            onChange={setQ4}
            max={5}
            badge="Для участников десятки"
          />
        )}

        {/* PART 2: Лояльность */}
        <SectionHeader
          icon={<Heart className="w-5 h-5 text-white" />}
          title="Лояльность"
          part={2}
        />

        <NpsQuestion value={q5} onChange={setQ5} />

        {/* PART 3: Обратная связь */}
        <SectionHeader
          icon={<MessageSquareHeart className="w-5 h-5 text-white" />}
          title="Короткая обратная связь"
          part={3}
          optional
        />

        <TextQuestion
          number={1}
          text="Что было для вас самым ценным в этом месяце?"
          value={q6}
          onChange={setQ6}
          placeholder="Напишите коротко..."
        />

        <TextQuestion
          number={2}
          text="Что стоит улучшить в следующем месяце?"
          value={q7}
          onChange={setQ7}
          placeholder="Напишите коротко..."
        />

        {/* Submit */}
        <div className="mt-8">
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!isFormValid || submitMutation.isPending}
            className={`w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-all ${
              isFormValid && !submitMutation.isPending
                ? 'bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white shadow-lg shadow-[#d93547]/25'
                : 'bg-[#e8e4de] text-[#9a958d] cursor-not-allowed'
            }`}
          >
            {submitMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                Отправить и получить +{survey?.energyReward}
              </>
            )}
          </button>

          {submitMutation.isError && (
            <p className="mt-3 text-center text-sm text-red-500">
              {(submitMutation.error as any)?.message || 'Ошибка при отправке'}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// --- Sub-components ---

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <button
        onClick={onBack}
        className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#9c1723]/30"
      >
        <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
      </button>
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-[#2b2520]">Обратная связь</h1>
        <p className="text-xs text-[#6b5a4a]">Февраль 2026</p>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  part,
  optional,
}: {
  icon: React.ReactNode;
  title: string;
  part: number;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-bold text-[#2b2520]">
          Часть {part}. {title}
        </h2>
        {optional && (
          <p className="text-[10px] text-[#6b5a4a]">Необязательная часть, можно пропустить</p>
        )}
      </div>
    </div>
  );
}

function ScaleInfo() {
  return (
    <div className="mb-4 p-3 rounded-xl bg-[#f8f6f0] border border-[#e8e4de]">
      <p className="text-[11px] text-[#6b5a4a] leading-relaxed">
        <span className="font-semibold text-[#2b2520]">1</span> — совсем не согласна / разочарована{'  '}
        <span className="font-semibold text-[#2b2520]">3</span> — нейтрально{'  '}
        <span className="font-semibold text-[#2b2520]">5</span> — полностью согласна / очень довольна
      </p>
    </div>
  );
}

function RatingQuestion({
  number,
  text,
  value,
  onChange,
  max,
  badge,
}: {
  number: number;
  text: string;
  value: number | null;
  onChange: (v: number) => void;
  max: number;
  badge?: string;
}) {
  return (
    <div className="mb-4 p-4 rounded-2xl bg-white border border-[#9c1723]/10 shadow-sm">
      {badge && (
        <div className="mb-2">
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-[#d93547]/10 text-[#d93547]">
            {badge}
          </span>
        </div>
      )}
      <p className="text-sm text-[#2b2520] mb-3">
        <span className="font-bold text-[#d93547] mr-1.5">{number}.</span>
        {text}
      </p>
      <div className="flex gap-2">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`flex-1 h-11 rounded-xl font-bold text-sm transition-all ${
              value === n
                ? 'bg-gradient-to-br from-[#d93547] to-[#9c1723] text-white shadow-md shadow-[#d93547]/20 scale-105'
                : 'bg-[#f8f6f0] text-[#6b5a4a] hover:bg-[#f0ede8] border border-[#e8e4de]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function NpsQuestion({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4 p-4 rounded-2xl bg-white border border-[#9c1723]/10 shadow-sm">
      <p className="text-sm text-[#2b2520] mb-2">
        <span className="font-bold text-[#d93547] mr-1.5">1.</span>
        Насколько вы готовы рекомендовать Клуб &laquo;Код Успеха&raquo; своим знакомым?
      </p>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[#9a958d]">Точно нет</span>
        <span className="text-[10px] text-[#9a958d]">Обязательно</span>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const isSelected = value === n;
          let bgClass = 'bg-[#f8f6f0] text-[#6b5a4a] border border-[#e8e4de]';
          if (isSelected) {
            if (n <= 6) bgClass = 'bg-[#ef4444] text-white shadow-md';
            else if (n <= 8) bgClass = 'bg-[#f59e0b] text-white shadow-md';
            else bgClass = 'bg-[#22c55e] text-white shadow-md';
          }
          return (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`h-10 rounded-lg font-bold text-xs transition-all ${bgClass} ${
                isSelected ? 'scale-110' : 'hover:bg-[#f0ede8]'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextQuestion({
  number,
  text,
  value,
  onChange,
  placeholder,
}: {
  number: number;
  text: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-4 p-4 rounded-2xl bg-white border border-[#9c1723]/10 shadow-sm">
      <p className="text-sm text-[#2b2520] mb-3">
        <span className="font-bold text-[#d93547] mr-1.5">{number}.</span>
        {text}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3.5 py-2.5 rounded-xl bg-[#f8f6f0] border border-[#e8e4de] text-sm text-[#2b2520] placeholder:text-[#b0aaa2] resize-none focus:outline-none focus:border-[#d93547]/40 focus:ring-1 focus:ring-[#d93547]/20 transition-all"
      />
    </div>
  );
}
