'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareHeart, Zap, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { feedbackSurveyApi } from '@/lib/api';

export function FeedbackSurveyBanner() {
  const router = useRouter();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['feedback-survey', user?.id],
    queryFn: () => feedbackSurveyApi.getCurrent(),
    enabled: !!user,
    staleTime: 60_000,
  });

  // Don't show if loading or no survey data
  if (isLoading || !data?.survey) return null;

  const survey = data.survey;

  // Don't show if survey hasn't opened yet
  if (!survey.isOpen && !survey.isCompleted) return null;

  // Already completed — show "done" state
  if (survey.isCompleted) {
    return (
      <div
        className="w-full mt-3"
        style={{
          borderRadius: '8px',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(22, 163, 74, 0.12) 100%)',
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
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
              Анкета заполнена
            </p>
            <p style={{ fontSize: '11px', color: '#15803d', opacity: 0.8 }}>
              Спасибо за обратную связь!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Open and not completed — show CTA banner
  return (
    <div
      className="w-full mt-3 cursor-pointer active:scale-[0.99] transition-transform"
      onClick={() => router.push('/feedback')}
      style={{
        borderRadius: '8px',
        border: '1px solid #d93547',
        background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
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
          <MessageSquareHeart style={{ width: '22px', height: '22px', color: '#fff' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
            Анкета обратной связи
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap style={{ width: '12px', height: '12px', color: 'rgba(255,255,255,0.8)' }} />
            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
              +{survey.energyReward} энергий за заполнение
            </p>
          </div>
        </div>
        <ChevronRight style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }} />
      </div>
    </div>
  );
}
