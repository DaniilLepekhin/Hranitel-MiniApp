'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useTelegram } from '@/hooks/useTelegram';
import { ChevronRight, Check } from 'lucide-react';

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
  emoji: string;
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

  // Не показываем если не лидер или нет данных
  if (isLoading || !data?.isLeader || data.questions.length === 0) {
    return null;
  }

  const questions = data.questions;
  const votes = data.votes;
  const allVoted = questions.every(q => votes[q.id]);
  const totalQuestions = questions.length;
  const votedCount = questions.filter(q => votes[q.id]).length;

  // Один вопрос — компактный вид прямо в карточке
  if (totalQuestions === 1) {
    const question = questions[0];
    const voted = votes[question.id];
    const options = question.options as SurveyOption[];

    return (
      <div
        className="w-full mt-3"
        style={{
          borderRadius: '8px',
          border: '1px solid rgba(217, 53, 71, 0.3)',
          background: 'linear-gradient(135deg, #2d2620 0%, #3a302a 100%)',
          padding: '16px',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: allVoted
                ? 'rgba(34, 197, 94, 0.2)'
                : 'rgba(217, 53, 71, 0.2)',
              border: `1px solid ${allVoted ? 'rgba(34, 197, 94, 0.4)' : 'rgba(217, 53, 71, 0.4)'}`,
            }}
          >
            <span style={{ fontSize: '20px' }}>
              {allVoted ? '✅' : '🚦'}
            </span>
          </div>
          <div className="flex-1">
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 700,
                fontSize: '15px',
                color: '#f7f1e8',
                marginBottom: '2px',
              }}
            >
              Светофор
            </p>
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 400,
                fontSize: '12px',
                color: 'rgba(247, 241, 232, 0.6)',
              }}
            >
              {voted ? 'Ответ принят' : 'Еженедельный отчёт лидера'}
            </p>
          </div>
        </div>

        {/* Question */}
        <p
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 500,
            fontSize: '14px',
            color: 'rgba(247, 241, 232, 0.9)',
            marginBottom: '12px',
          }}
        >
          {question.text}
        </p>

        {/* Options */}
        <div className="flex gap-3">
          {options.map((option) => {
            const isSelected = voted === option.key;
            const isDisabled = !!voted;

            return (
              <button
                key={option.key}
                onClick={() => !isDisabled && handleVote(question.id, option.key)}
                disabled={isDisabled || voteMutation.isPending}
                className="flex-1 relative overflow-hidden transition-all duration-300"
                style={{
                  borderRadius: '12px',
                  padding: '14px 12px',
                  border: isSelected
                    ? `2px solid ${option.color}`
                    : isDisabled
                      ? '2px solid rgba(247, 241, 232, 0.1)'
                      : `2px solid ${option.color}40`,
                  background: isSelected
                    ? `${option.color}20`
                    : isDisabled
                      ? 'rgba(247, 241, 232, 0.03)'
                      : `${option.color}10`,
                  opacity: isDisabled && !isSelected ? 0.4 : 1,
                  cursor: isDisabled ? 'default' : 'pointer',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                {/* Checkmark for selected */}
                {isSelected && (
                  <div
                    className="absolute top-2 right-2"
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: option.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                )}

                <span style={{ fontSize: '28px', display: 'block', marginBottom: '6px' }}>
                  {option.emoji}
                </span>
                <span
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: isSelected ? option.color : '#f7f1e8',
                    display: 'block',
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

  // Множество вопросов — карточка со стрелкой, drill-down
  return (
    <div className="w-full mt-3">
      {/* Main card */}
      <div
        className="w-full"
        style={{
          borderRadius: '8px',
          border: '1px solid rgba(217, 53, 71, 0.3)',
          background: 'linear-gradient(135deg, #2d2620 0%, #3a302a 100%)',
          padding: '16px',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: allVoted
                ? 'rgba(34, 197, 94, 0.2)'
                : 'rgba(217, 53, 71, 0.2)',
              border: `1px solid ${allVoted ? 'rgba(34, 197, 94, 0.4)' : 'rgba(217, 53, 71, 0.4)'}`,
            }}
          >
            <span style={{ fontSize: '20px' }}>
              {allVoted ? '✅' : '🚦'}
            </span>
          </div>
          <div className="flex-1">
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 700,
                fontSize: '15px',
                color: '#f7f1e8',
                marginBottom: '2px',
              }}
            >
              Светофор
            </p>
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 400,
                fontSize: '12px',
                color: 'rgba(247, 241, 232, 0.6)',
              }}
            >
              {allVoted
                ? `Все ответы приняты (${votedCount}/${totalQuestions})`
                : `Ответь на ${totalQuestions} вопросов (${votedCount}/${totalQuestions})`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full mb-4" style={{ background: 'rgba(247, 241, 232, 0.1)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(votedCount / totalQuestions) * 100}%`,
              background: allVoted
                ? '#22c55e'
                : 'linear-gradient(90deg, #d93547, #9c1723)',
            }}
          />
        </div>

        {/* Questions list */}
        <div className="space-y-2">
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
                  className="w-full flex items-center gap-3 p-3 rounded-lg transition-all"
                  style={{
                    background: isExpanded
                      ? 'rgba(247, 241, 232, 0.08)'
                      : 'rgba(247, 241, 232, 0.04)',
                  }}
                >
                  {/* Status indicator */}
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{
                      background: voted
                        ? `${selectedOption?.color || '#22c55e'}30`
                        : 'rgba(247, 241, 232, 0.1)',
                      border: `1.5px solid ${voted ? selectedOption?.color || '#22c55e' : 'rgba(247, 241, 232, 0.2)'}`,
                    }}
                  >
                    {voted ? (
                      <Check className="w-3.5 h-3.5" style={{ color: selectedOption?.color }} strokeWidth={3} />
                    ) : (
                      <span style={{ fontSize: '10px', color: 'rgba(247, 241, 232, 0.5)' }}>
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
                      color: voted ? 'rgba(247, 241, 232, 0.7)' : '#f7f1e8',
                    }}
                  >
                    {question.text}
                  </p>

                  {/* Voted badge or arrow */}
                  {voted ? (
                    <span
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 600,
                        fontSize: '12px',
                        color: selectedOption?.color,
                        padding: '2px 8px',
                        borderRadius: '8px',
                        background: `${selectedOption?.color}15`,
                      }}
                    >
                      {selectedOption?.emoji} {selectedOption?.label}
                    </span>
                  ) : (
                    <ChevronRight
                      className="w-4 h-4 flex-shrink-0 transition-transform"
                      style={{
                        color: 'rgba(247, 241, 232, 0.4)',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}
                    />
                  )}
                </button>

                {/* Expanded voting area */}
                {isExpanded && !voted && (
                  <div className="flex gap-3 px-3 pb-2 pt-1">
                    {options.map((option) => (
                      <button
                        key={option.key}
                        onClick={() => handleVote(question.id, option.key)}
                        disabled={voteMutation.isPending}
                        className="flex-1 transition-all active:scale-95"
                        style={{
                          borderRadius: '10px',
                          padding: '12px 8px',
                          border: `2px solid ${option.color}40`,
                          background: `${option.color}10`,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: '24px', display: 'block', marginBottom: '4px' }}>
                          {option.emoji}
                        </span>
                        <span
                          style={{
                            fontFamily: 'Gilroy, sans-serif',
                            fontWeight: 600,
                            fontSize: '12px',
                            color: '#f7f1e8',
                            display: 'block',
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
