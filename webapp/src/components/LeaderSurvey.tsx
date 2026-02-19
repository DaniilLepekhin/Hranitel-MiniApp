'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useTelegram } from '@/hooks/useTelegram';
import { Check, ChevronDown } from 'lucide-react';

const getApiUrl = (): string => {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'https://app.successkod.com';
  }
  const hostname = window.location.hostname;
  if (hostname.includes('successkod.com')) {
    return `https://${hostname}`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://app.successkod.com';
};

const API_URL = getApiUrl();

interface SurveyOption {
  key: string;
  label: string;
  color: string;
  emoji?: string;
}

interface SurveyQuestion {
  id: string;
  text: string;
  options: SurveyOption[];
  orderIndex: number;
}

interface SurveyData {
  success: boolean;
  isLeader: boolean;
  weekStart?: string;
  questions: SurveyQuestion[];
  votes: Record<string, string>;
}

/** Small colored dot indicator */
function ColorDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}60`,
        flexShrink: 0,
      }}
    />
  );
}

/** SVG traffic light icon — 3 small circles */
function TrafficLightIcon({ size = 20, done = false }: { size?: number; done?: boolean }) {
  const c = done ? '#f7f1e8' : '#f7f1e8';
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="6" y="1" width="8" height="18" rx="4" stroke={c} strokeWidth="1.2" opacity={0.7} />
      <circle cx="10" cy="5.5" r="2" fill={done ? '#22c55e' : '#ef4444'} opacity={done ? 1 : 0.5} />
      <circle cx="10" cy="10" r="2" fill={done ? '#22c55e' : '#eab308'} opacity={done ? 1 : 0.4} />
      <circle cx="10" cy="14.5" r="2" fill={done ? '#22c55e' : '#22c55e'} opacity={done ? 1 : 0.3} />
    </svg>
  );
}

export function LeaderSurvey() {
  const { user } = useAuthStore();
  const { haptic } = useTelegram();
  const queryClient = useQueryClient();
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SurveyData>({
    queryKey: ['leader-survey', user?.telegramId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/leader-survey/current?telegram_id=${user?.telegramId}`);
      if (!res.ok) throw new Error('Failed to fetch survey');
      return res.json();
    },
    enabled: !!user?.telegramId,
    staleTime: 30_000,
    retry: 1,
  });

  const voteMutation = useMutation({
    mutationFn: async ({ questionId, answer }: { questionId: string; answer: string }) => {
      const res = await fetch(`${API_URL}/api/v1/leader-survey/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: user?.telegramId?.toString(),
          question_id: questionId,
          answer,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Vote failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leader-survey'] });
    },
  });

  const handleVote = useCallback((questionId: string, answer: string) => {
    haptic.impact('medium');
    voteMutation.mutate({ questionId, answer });
  }, [haptic, voteMutation]);

  // Don't show for non-leaders or no data
  if (isLoading || !data?.isLeader || data.questions.length === 0) {
    return null;
  }

  const questions = data.questions;
  const votes = data.votes;
  const allVoted = questions.every(q => votes[q.id]);
  const totalQuestions = questions.length;
  const votedCount = questions.filter(q => votes[q.id]).length;

  // ========= SINGLE QUESTION — compact inline card =========
  if (totalQuestions === 1) {
    const question = questions[0];
    const voted = votes[question.id];
    const options = question.options as SurveyOption[];

    return (
      <div
        className="w-full mt-3 active:scale-[0.99] transition-transform"
        style={{
          borderRadius: '8px',
          border: '1px solid #d93547',
          background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
          padding: '16px',
        }}
      >
        {/* Header row */}
        <div className="flex items-center gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            {allVoted ? (
              <Check className="w-5 h-5" style={{ color: '#f7f1e8' }} strokeWidth={2.5} />
            ) : (
              <TrafficLightIcon size={20} done={false} />
            )}
          </div>
          <div className="flex-1">
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 700,
                fontSize: '15px',
                color: '#f7f1e8',
                marginBottom: '1px',
              }}
            >
              Светофор
            </p>
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 400,
                fontSize: '12px',
                color: 'rgba(247, 241, 232, 0.7)',
              }}
            >
              {voted ? 'Ответ принят' : 'Еженедельный отчёт'}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-[1px] bg-white/15 my-3" />

        {/* Question text */}
        <p
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 500,
            fontSize: '13px',
            color: 'rgba(247, 241, 232, 0.85)',
            marginBottom: '10px',
          }}
        >
          {question.text}
        </p>

        {/* Options — compact pills */}
        <div className="flex gap-2">
          {options.map((option) => {
            const isSelected = voted === option.key;
            const isDisabled = !!voted;

            return (
              <button
                key={option.key}
                onClick={() => !isDisabled && handleVote(question.id, option.key)}
                disabled={isDisabled || voteMutation.isPending}
                className="flex items-center gap-2 transition-all duration-200 active:scale-95"
                style={{
                  borderRadius: '8px',
                  padding: '8px 14px',
                  border: isSelected
                    ? '1.5px solid rgba(255,255,255,0.6)'
                    : '1.5px solid rgba(255,255,255,0.15)',
                  background: isSelected
                    ? 'rgba(255,255,255,0.18)'
                    : 'rgba(255,255,255,0.06)',
                  opacity: isDisabled && !isSelected ? 0.35 : 1,
                  cursor: isDisabled ? 'default' : 'pointer',
                }}
              >
                {isSelected ? (
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: option.color,
                    }}
                  >
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <ColorDot color={option.color} size={10} />
                )}
                <span
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: '#f7f1e8',
                  }}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ========= MULTIPLE QUESTIONS — expandable card =========
  return (
    <div className="w-full mt-3">
      <div
        style={{
          borderRadius: '8px',
          border: '1px solid #d93547',
          background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
          padding: '16px',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            {allVoted ? (
              <Check className="w-5 h-5" style={{ color: '#f7f1e8' }} strokeWidth={2.5} />
            ) : (
              <TrafficLightIcon size={20} done={false} />
            )}
          </div>
          <div className="flex-1">
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 700,
                fontSize: '15px',
                color: '#f7f1e8',
                marginBottom: '1px',
              }}
            >
              Светофор
            </p>
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 400,
                fontSize: '12px',
                color: 'rgba(247, 241, 232, 0.7)',
              }}
            >
              {allVoted
                ? `Все ответы приняты`
                : `${votedCount} из ${totalQuestions} — ответь на все`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="w-full mb-3 rounded-full overflow-hidden"
          style={{ height: '3px', background: 'rgba(255,255,255,0.1)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(votedCount / totalQuestions) * 100}%`,
              background: allVoted
                ? 'rgba(255,255,255,0.7)'
                : 'rgba(255,255,255,0.45)',
            }}
          />
        </div>

        {/* Divider */}
        <div className="w-full h-[1px] bg-white/10 mb-3" />

        {/* Questions */}
        <div className="space-y-1">
          {questions.map((question) => {
            const voted = votes[question.id];
            const options = question.options as SurveyOption[];
            const selectedOption = options.find(o => o.key === voted);
            const isExpanded = expandedQuestion === question.id;

            return (
              <div key={question.id}>
                {/* Question row */}
                <button
                  onClick={() => {
                    haptic.impact('light');
                    setExpandedQuestion(isExpanded ? null : question.id);
                  }}
                  className="w-full flex items-center gap-2.5 py-2.5 px-2 rounded-lg transition-all"
                  style={{
                    background: isExpanded
                      ? 'rgba(255,255,255,0.08)'
                      : 'transparent',
                  }}
                >
                  {/* Status dot */}
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {voted ? (
                      <ColorDot color={selectedOption?.color || '#22c55e'} size={8} />
                    ) : (
                      <span
                        style={{
                          fontFamily: 'Gilroy, sans-serif',
                          fontWeight: 600,
                          fontSize: '11px',
                          color: 'rgba(247, 241, 232, 0.4)',
                        }}
                      >
                        {question.orderIndex + 1}
                      </span>
                    )}
                  </div>

                  {/* Question text */}
                  <p
                    className="flex-1 text-left"
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 500,
                      fontSize: '13px',
                      color: voted ? 'rgba(247, 241, 232, 0.6)' : '#f7f1e8',
                    }}
                  >
                    {question.text}
                  </p>

                  {/* Voted badge or chevron */}
                  {voted ? (
                    <span
                      className="flex items-center gap-1.5 flex-shrink-0"
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 600,
                        fontSize: '11px',
                        color: 'rgba(247, 241, 232, 0.5)',
                      }}
                    >
                      {selectedOption?.label}
                    </span>
                  ) : (
                    <ChevronDown
                      className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
                      style={{
                        color: 'rgba(247, 241, 232, 0.35)',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  )}
                </button>

                {/* Expanded options */}
                {isExpanded && !voted && (
                  <div className="flex gap-2 px-2 pb-2 pt-1">
                    {options.map((option) => (
                      <button
                        key={option.key}
                        onClick={() => handleVote(question.id, option.key)}
                        disabled={voteMutation.isPending}
                        className="flex items-center gap-2 transition-all active:scale-95"
                        style={{
                          borderRadius: '8px',
                          padding: '7px 12px',
                          border: '1.5px solid rgba(255,255,255,0.15)',
                          background: 'rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                        }}
                      >
                        <ColorDot color={option.color} size={8} />
                        <span
                          style={{
                            fontFamily: 'Gilroy, sans-serif',
                            fontWeight: 600,
                            fontSize: '12px',
                            color: '#f7f1e8',
                          }}
                        >
                          {option.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
