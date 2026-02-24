'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, CheckCircle2, Send } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { geographySurveyApi } from '@/lib/api';

export default function GeographyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data } = useQuery({
    queryKey: ['geography-survey', user?.id],
    queryFn: () => geographySurveyApi.getMy(),
    enabled: !!user,
  });

  const existing = data?.response;
  const [city, setCity] = useState(existing?.city ?? '');
  const [submitted, setSubmitted] = useState(false);

  // Обновляем поле когда данные загрузились
  if (existing?.city && !city) setCity(existing.city);

  const submitMutation = useMutation({
    mutationFn: () => geographySurveyApi.submit(city),
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['geography-survey'] });
    },
  });

  const canSubmit = city.trim().length >= 2 && !submitMutation.isPending;

  if (submitted) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ background: '#f7f1e8' }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 style={{ width: '40px', height: '40px', color: '#22c55e' }} />
          </div>
          <p style={{ fontFamily: 'Gilroy, sans-serif', fontWeight: 700, fontSize: '22px', color: '#2d2620' }}>
            Спасибо!
          </p>
          <p style={{ fontFamily: 'Gilroy, sans-serif', fontSize: '15px', color: '#2d2620', opacity: 0.7, maxWidth: '280px' }}>
            Ваш город <b>{city}</b> сохранён. Мы учтём это при открытии новых городских чатов 🤍
          </p>
          <button
            onClick={() => router.back()}
            style={{
              marginTop: '16px',
              padding: '12px 32px',
              borderRadius: '100px',
              background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
              color: '#f7f1e8',
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 700,
              fontSize: '15px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Вернуться
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f1e8' }}>
      {/* Шапка */}
      <div
        className="flex items-center gap-3 px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid rgba(45,38,32,0.08)' }}
      >
        <button
          onClick={() => router.back()}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'rgba(45,38,32,0.07)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ArrowLeft style={{ width: '18px', height: '18px', color: '#2d2620' }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin style={{ width: '20px', height: '20px', color: '#9c1723' }} />
          <span style={{ fontFamily: 'Gilroy, sans-serif', fontWeight: 700, fontSize: '17px', color: '#2d2620' }}>
            География нашего Клуба
          </span>
        </div>
      </div>

      {/* Контент */}
      <div className="flex-1 px-4 py-5 flex flex-col gap-5">
        {/* Описание */}
        <div
          style={{
            borderRadius: '12px',
            background: 'rgba(90, 60, 160, 0.07)',
            border: '1px solid rgba(90, 60, 160, 0.15)',
            padding: '16px',
          }}
        >
          <p style={{ fontFamily: 'Gilroy, sans-serif', fontSize: '14px', color: '#2d2620', lineHeight: 1.55, marginBottom: '10px' }}>
            Мы хотим знать, где находится каждая из вас, чтобы открывать новые города и делать наши встречи ближе! Пожалуйста, укажите город, в котором вы живете. Если вы из небольшого поселка, напишите ближайший к вам город.
          </p>
          <p style={{ fontFamily: 'Gilroy, sans-serif', fontSize: '13px', color: '#2d2620', opacity: 0.7, lineHeight: 1.5 }}>
            Заполняйте, если сейчас вашего города нет в списке и вы временно состоите в чате ближайшего соседа — указывайте свой реальный город. Это поможет нам увидеть, какой город мы можем вывести в отдельный чат.
          </p>
        </div>

        {/* Вопрос */}
        <div className="flex flex-col gap-2">
          <label
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 600,
              fontSize: '14px',
              color: '#2d2620',
            }}
          >
            Ваш город (или чат города, который вы предлагаете открыть):
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Например: Казань"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '15px',
              color: '#2d2620',
              background: '#fff',
              border: '1px solid rgba(45,38,32,0.15)',
              borderRadius: '10px',
              padding: '13px 14px',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>

        {/* Кнопка */}
        <button
          onClick={() => submitMutation.mutate()}
          disabled={!canSubmit}
          style={{
            padding: '14px',
            borderRadius: '100px',
            background: canSubmit
              ? 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)'
              : 'rgba(45,38,32,0.12)',
            color: canSubmit ? '#f7f1e8' : 'rgba(45,38,32,0.4)',
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 700,
            fontSize: '15px',
            border: 'none',
            cursor: canSubmit ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Send style={{ width: '16px', height: '16px' }} />
          {submitMutation.isPending ? 'Сохраняем...' : existing ? 'Обновить' : 'Отправить'}
        </button>

        {submitMutation.isError && (
          <p style={{ fontSize: '13px', color: '#9c1723', textAlign: 'center' }}>
            Что-то пошло не так. Попробуйте ещё раз.
          </p>
        )}
      </div>
    </div>
  );
}
