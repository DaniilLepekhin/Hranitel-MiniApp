'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MapPin, ChevronRight, CheckCircle2, PencilLine } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { geographySurveyApi } from '@/lib/api';

export function GeographySurveyBanner() {
  const router = useRouter();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['geography-survey', user?.id],
    queryFn: () => geographySurveyApi.getMy(),
    enabled: !!user,
    staleTime: 60_000,
  });

  if (isLoading) return null;

  const existing = data?.response;

  // Уже заполнена — показываем город с кнопкой "Изменить"
  if (existing) {
    return (
      <div
        className="w-full mt-3 cursor-pointer active:scale-[0.99] transition-transform"
        onClick={() => router.push('/geography')}
        style={{
          borderRadius: '8px',
          border: '1px solid rgba(34, 197, 94, 0.35)',
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.07) 0%, rgba(22, 163, 74, 0.11) 100%)',
          padding: '14px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(34, 197, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 style={{ width: '20px', height: '20px', color: '#22c55e' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#166534', marginBottom: '1px' }}>
              География клуба
            </p>
            <p style={{ fontSize: '12px', color: '#15803d', opacity: 0.85 }}>
              Ваш город: <b>{existing.city}</b>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PencilLine style={{ width: '14px', height: '14px', color: '#15803d', opacity: 0.6 }} />
            <span style={{ fontSize: '11px', color: '#15803d', opacity: 0.6 }}>Изменить</span>
          </div>
        </div>
      </div>
    );
  }

  // Не заполнена — CTA баннер
  return (
    <div
      className="w-full mt-3 cursor-pointer active:scale-[0.99] transition-transform"
      onClick={() => router.push('/geography')}
      style={{
        borderRadius: '8px',
        border: '1px solid rgba(114, 90, 193, 0.5)',
        background: 'linear-gradient(243.413deg, rgb(90, 60, 160) 15.721%, rgb(70, 42, 130) 99.389%)',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <MapPin style={{ width: '22px', height: '22px', color: '#fff' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
            География нашего Клуба
          </p>
          <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
            Заполните, если чата вашего города нет
          </p>
        </div>
        <ChevronRight style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }} />
      </div>
    </div>
  );
}
