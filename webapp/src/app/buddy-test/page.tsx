'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronRight, AlertCircle, Trophy, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useTelegram } from '@/hooks/useTelegram';

// Типы
interface Question {
  id: number;
  block: string;
  blockTitle: string;
  title: string;
  description?: string;
  type: 'single' | 'multiple' | 'checkbox';
  maxSelections?: number;
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
    isStop?: boolean; // Стоп-ответ - сразу не проходит
  }[];
  requireAll?: boolean; // Для чекбоксов - нужны все
}

// Данные теста
const questions: Question[] = [
  // БЛОК 1. МОТИВАЦИЯ И РЕСУРС
  {
    id: 1,
    block: 'motivation',
    blockTitle: 'Мотивация и ресурс',
    title: 'Почему ты хочешь стать Лидером десятки?',
    description: 'Можно выбрать 1–2 варианта',
    type: 'multiple',
    maxSelections: 2,
    options: [
      { id: '1a', text: 'Хочу прокачать лидерство и ответственность', isCorrect: true },
      { id: '1b', text: 'Хочу быть полезной и поддерживать людей', isCorrect: true },
      { id: '1c', text: 'Хочу быть частью команды и процесса роста', isCorrect: true },
      { id: '1d', text: 'Хочу быть ближе к эксперту / клубу', isCorrect: false },
      { id: '1e', text: 'Хочу статус / регалии', isCorrect: false },
      { id: '1f', text: 'Хочу продавать свои услуги', isCorrect: false },
    ],
  },
  {
    id: 2,
    block: 'motivation',
    blockTitle: 'Мотивация и ресурс',
    title: 'Какая формулировка больше всего про тебя?',
    description: 'Выбери один вариант',
    type: 'single',
    options: [
      { id: '2a', text: 'Я умею слушать и удерживать фокус группы', isCorrect: true },
      { id: '2b', text: 'Я системная, люблю порядок и правила', isCorrect: true },
      { id: '2c', text: 'Я создаю спокойную и безопасную атмосферу', isCorrect: true },
      { id: '2d', text: 'Я вдохновляю и мотивирую эмоциями', isCorrect: false },
      { id: '2e', text: 'Я люблю быть главным голосом в пространстве', isCorrect: false },
    ],
  },
  {
    id: 3,
    block: 'motivation',
    blockTitle: 'Мотивация и ресурс',
    title: 'Оцени свой реальный ресурс по времени',
    description: 'Выбери один вариант',
    type: 'single',
    options: [
      { id: '3a', text: 'У меня много свободного времени, я стабильна', isCorrect: true },
      { id: '3b', text: 'Я работаю, но 3–4 часа в неделю точно найду', isCorrect: true },
      { id: '3c', text: 'У меня завал, но я постараюсь успевать', isCorrect: false, isStop: true },
    ],
  },
  // БЛОК 2. ПРОВЕРКА НА АДЕКВАТНОСТЬ (КЕЙСЫ)
  {
    id: 4,
    block: 'cases',
    blockTitle: 'Проверка на адекватность',
    title: 'Ситуация «Молчание»',
    description: 'Ты задала вопрос в чате и дала задание. Уже сутки никто не отвечает. Что ты сделаешь?',
    type: 'single',
    options: [
      { id: '4a', text: 'Напомню в чате, спокойно обозначив важность ответа', isCorrect: true },
      { id: '4b', text: 'Напишу личное сообщение участникам, чтобы включить их', isCorrect: true },
      { id: '4c', text: 'Подожду ещё пару дней, не хочу давить', isCorrect: false },
      { id: '4d', text: 'Начну писать сама за всех и закрывать вопрос', isCorrect: false },
    ],
  },
  {
    id: 5,
    block: 'cases',
    blockTitle: 'Проверка на адекватность',
    title: 'Ситуация «Нытик»',
    description: 'Участница постоянно жалуется, забирая внимание группы. Остальные раздражаются.',
    type: 'single',
    options: [
      { id: '5a', text: 'Мягко остановлю, верну фокус к теме и напомню правила', isCorrect: true },
      { id: '5b', text: 'Напишу ей в личку, обозначив границы и формат', isCorrect: true },
      { id: '5c', text: 'Начну её поддерживать и разбирать проблему', isCorrect: false },
      { id: '5d', text: 'Резко пресеку или удалю из чата', isCorrect: false },
    ],
  },
  {
    id: 6,
    block: 'cases',
    blockTitle: 'Проверка на адекватность',
    title: 'Ситуация «Границы»',
    description: 'Участница пишет тебе в 2 часа ночи с просьбой помочь с домашкой.',
    type: 'single',
    options: [
      { id: '6a', text: 'Отвечу утром и напомню о времени работы и границах', isCorrect: true },
      { id: '6b', text: 'Предложу задать вопрос в общем чате или на созвоне', isCorrect: true },
      { id: '6c', text: 'Отвечу сразу, чтобы не обидеть', isCorrect: false },
      { id: '6d', text: 'Проигнорирую без ответа', isCorrect: false },
    ],
  },
  // БЛОК 3. ТЕХНИЧЕСКИЕ НАВЫКИ
  {
    id: 7,
    block: 'tech',
    blockTitle: 'Технические навыки',
    title: 'Как у тебя с техникой (Zoom / боты)?',
    description: 'Выбери один вариант',
    type: 'single',
    options: [
      { id: '7a', text: 'Легко организую Zoom, могу записать созвон и прислать запись', isCorrect: true },
      { id: '7b', text: 'Пока не всё умею, но быстро обучаюсь по инструкции', isCorrect: true },
      { id: '7c', text: 'Мне сложно, с техникой я «на вы»', isCorrect: false, isStop: true },
    ],
  },
  // БЛОК 4. ВИДЕО-ФОРМАТ
  {
    id: 8,
    block: 'video',
    blockTitle: 'Видео-формат',
    title: 'Готова ли ты записать короткое видео?',
    description: 'До 1 минуты с ответом «Кто я и почему за мной могут идти люди»',
    type: 'single',
    options: [
      { id: '8a', text: 'Да, готова', isCorrect: true },
      { id: '8b', text: 'Да, но мне нужно немного времени', isCorrect: true },
      { id: '8c', text: 'Нет, мне некомфортно', isCorrect: false, isStop: true },
    ],
  },
  // БЛОК 5. СОГЛАСИЕ С ПРАВИЛАМИ
  {
    id: 9,
    block: 'rules',
    blockTitle: 'Согласие с правилами',
    title: 'Отметь пункты, с которыми ты согласна',
    description: 'Необходимо выбрать все пункты',
    type: 'checkbox',
    requireAll: true,
    options: [
      { id: '9a', text: 'Я понимаю, что роль Лидера — это ответственность, а не статус', isCorrect: true },
      { id: '9b', text: 'Я не продаю свои услуги участникам десятки', isCorrect: true },
      { id: '9c', text: 'Я принимаю правило конфиденциальности («правило Вегаса»)', isCorrect: true },
      { id: '9d', text: 'Я готова следовать методологии клуба', isCorrect: true },
    ],
  },
];

// Блоки для прогресс-бара
const blocks = [
  { id: 'motivation', title: 'Мотивация', questions: [1, 2, 3] },
  { id: 'cases', title: 'Кейсы', questions: [4, 5, 6] },
  { id: 'tech', title: 'Техника', questions: [7] },
  { id: 'video', title: 'Видео', questions: [8] },
  { id: 'rules', title: 'Правила', questions: [9] },
];

export default function BuddyTestPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { haptic } = useTelegram();

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [showResult, setShowResult] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [stopReason, setStopReason] = useState<string | null>(null);

  // Проверка доступа - только для tg_id 389209990
  const allowedTgId = '389209990';
  const hasAccess = user?.telegramId === allowedTgId;

  useEffect(() => {
    if (!hasAccess && user) {
      router.replace('/');
    }
  }, [hasAccess, user, router]);

  const question = questions[currentQuestion];
  const selectedAnswers = answers[question?.id] || [];

  // Вычисление прогресса
  const progress = ((currentQuestion) / questions.length) * 100;
  const currentBlock = blocks.find(b => b.questions.includes(question?.id));

  const handleSelect = useCallback((optionId: string) => {
    haptic.impact('light');

    const question = questions[currentQuestion];
    const option = question.options.find(o => o.id === optionId);

    if (question.type === 'single') {
      setAnswers(prev => ({ ...prev, [question.id]: [optionId] }));

      // Проверка на стоп-ответ
      if (option?.isStop) {
        setStopReason(option.text);
        setShowResult(true);
        setTestPassed(false);
        return;
      }
    } else if (question.type === 'multiple') {
      setAnswers(prev => {
        const current = prev[question.id] || [];
        if (current.includes(optionId)) {
          return { ...prev, [question.id]: current.filter(id => id !== optionId) };
        }
        if (current.length >= (question.maxSelections || 2)) {
          return prev;
        }
        return { ...prev, [question.id]: [...current, optionId] };
      });
    } else if (question.type === 'checkbox') {
      setAnswers(prev => {
        const current = prev[question.id] || [];
        if (current.includes(optionId)) {
          return { ...prev, [question.id]: current.filter(id => id !== optionId) };
        }
        return { ...prev, [question.id]: [...current, optionId] };
      });
    }
  }, [currentQuestion, haptic]);

  const handleNext = useCallback(() => {
    haptic.impact('medium');

    const question = questions[currentQuestion];
    const selected = answers[question.id] || [];

    // Проверка на стоп-ответ для single
    if (question.type === 'single' && selected.length > 0) {
      const option = question.options.find(o => o.id === selected[0]);
      if (option?.isStop) {
        setStopReason(option.text);
        setShowResult(true);
        setTestPassed(false);
        return;
      }
    }

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      // Подсчет результата
      calculateResult();
    }
  }, [currentQuestion, answers, haptic]);

  const calculateResult = useCallback(() => {
    let correctCount = 0;
    let hasStopAnswer = false;

    for (const q of questions) {
      const selected = answers[q.id] || [];

      if (q.type === 'checkbox' && q.requireAll) {
        // Для чекбоксов нужны все ответы
        const allSelected = q.options.every(opt => selected.includes(opt.id));
        if (allSelected) correctCount++;
      } else {
        // Проверка на стоп-ответы
        for (const optId of selected) {
          const opt = q.options.find(o => o.id === optId);
          if (opt?.isStop) {
            hasStopAnswer = true;
            setStopReason(opt.text);
            break;
          }
        }

        // Проверка правильности
        const hasCorrect = selected.some(optId => {
          const opt = q.options.find(o => o.id === optId);
          return opt?.isCorrect;
        });
        if (hasCorrect) correctCount++;
      }
    }

    // Тест пройден если нет стоп-ответов и >= 70% правильных
    const passRate = correctCount / questions.length;
    setTestPassed(!hasStopAnswer && passRate >= 0.7);
    setShowResult(true);
  }, [answers]);

  const canProceed = useCallback(() => {
    const question = questions[currentQuestion];
    const selected = answers[question.id] || [];

    if (question.type === 'single') return selected.length === 1;
    if (question.type === 'multiple') return selected.length >= 1 && selected.length <= (question.maxSelections || 2);
    if (question.type === 'checkbox') return question.requireAll ? selected.length === question.options.length : selected.length > 0;
    return false;
  }, [currentQuestion, answers]);

  // Показываем загрузку если нет доступа или проверяем пользователя
  if (!user || !hasAccess) {
    return (
      <div className="min-h-screen bg-[#f7f1e8] flex items-center justify-center">
        <div className="text-center p-6">
          <AlertCircle className="w-16 h-16 text-[#d93547] mx-auto mb-4" />
          <h2 style={{ fontFamily: '"TT Nooks", Georgia, serif', fontSize: '24px', color: '#2d2620' }}>
            Доступ ограничен
          </h2>
          <p style={{ fontFamily: 'Gilroy, sans-serif', color: '#6b5a4a', marginTop: '8px' }}>
            Этот тест доступен только по приглашению
          </p>
          <button
            onClick={() => router.back()}
            className="mt-6 px-6 py-3 rounded-xl transition-all active:scale-95"
            style={{
              background: 'linear-gradient(243deg, #ae1e2b 15%, #9c1723 99%)',
              color: '#fff',
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 600,
            }}
          >
            Вернуться назад
          </button>
        </div>
      </div>
    );
  }

  // Результат теста
  if (showResult) {
    return (
      <div className="min-h-screen bg-[#f7f1e8] flex flex-col">
        {/* Header */}
        <div className="flex items-center p-4 border-b border-[#2d2620]/10">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-95"
            style={{ border: '1px solid #2d2620' }}
          >
            <X className="w-5 h-5" style={{ color: '#2d2620' }} />
          </button>
        </div>

        {/* Result */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
            style={{
              background: testPassed
                ? 'linear-gradient(243deg, #22c55e 15%, #16a34a 99%)'
                : 'linear-gradient(243deg, #ae1e2b 15%, #9c1723 99%)'
            }}
          >
            {testPassed ? (
              <Trophy className="w-12 h-12 text-white" />
            ) : (
              <X className="w-12 h-12 text-white" />
            )}
          </div>

          <h1
            className="text-center mb-4"
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: '32px',
              color: '#2d2620',
            }}
          >
            {testPassed ? 'Поздравляем!' : 'К сожалению...'}
          </h1>

          <p
            className="text-center mb-8 max-w-sm"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '16px',
              lineHeight: 1.5,
              color: '#6b5a4a',
            }}
          >
            {testPassed
              ? 'Ты успешно прошла тест на Лидера десятки! Мы свяжемся с тобой в ближайшее время для следующего этапа.'
              : stopReason
                ? `Выбранный ответ "${stopReason}" не соответствует требованиям к роли Лидера. Попробуй позже, когда будешь готова.`
                : 'Результаты теста показывают, что сейчас роль Лидера десятки может быть не лучшим выбором. Попробуй ещё раз позже!'
            }
          </p>

          <button
            onClick={() => router.push('/')}
            className="w-full max-w-xs py-4 rounded-xl transition-all active:scale-95"
            style={{
              background: 'linear-gradient(243deg, #ae1e2b 15%, #9c1723 99%)',
              color: '#fff',
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 600,
              fontSize: '16px',
            }}
          >
            Вернуться в приложение
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f1e8] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[#2d2620]/10">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              if (currentQuestion > 0) {
                setCurrentQuestion(prev => prev - 1);
              } else {
                router.back();
              }
            }}
            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-95"
            style={{ border: '1px solid #2d2620' }}
          >
            <ArrowLeft className="w-5 h-5" style={{ color: '#2d2620' }} />
          </button>

          <span
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 600,
              fontSize: '14px',
              color: '#6b5a4a',
            }}
          >
            {currentQuestion + 1} / {questions.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-[#2d2620]/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(243deg, #ae1e2b 15%, #9c1723 99%)',
            }}
          />
        </div>

        {/* Block indicator */}
        <div className="flex justify-between mt-3">
          {blocks.map((block, idx) => {
            const isActive = block.id === currentBlock?.id;
            const isPassed = blocks.slice(0, idx).some(b =>
              b.questions.some(qId => answers[qId]?.length > 0)
            ) && !isActive;

            return (
              <div
                key={block.id}
                className="flex flex-col items-center"
                style={{ opacity: isActive ? 1 : 0.5 }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center mb-1"
                  style={{
                    background: isActive || isPassed
                      ? 'linear-gradient(243deg, #ae1e2b 15%, #9c1723 99%)'
                      : '#2d2620',
                    opacity: isActive ? 1 : 0.3,
                  }}
                >
                  {isPassed ? (
                    <Check className="w-3 h-3 text-white" />
                  ) : (
                    <span style={{ color: '#fff', fontSize: '10px', fontWeight: 600 }}>
                      {idx + 1}
                    </span>
                  )}
                </div>
                <span style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontSize: '10px',
                  color: '#2d2620',
                  fontWeight: isActive ? 600 : 400,
                }}>
                  {block.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 p-6 overflow-y-auto pb-32">
        <div className="mb-2">
          <span
            className="px-3 py-1 rounded-full"
            style={{
              background: 'linear-gradient(243deg, #ae1e2b 15%, #9c1723 99%)',
              color: '#fff',
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {question.blockTitle}
          </span>
        </div>

        <h2
          className="mb-3"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '28px',
            lineHeight: 1.2,
            color: '#2d2620',
          }}
        >
          {question.title}
        </h2>

        {question.description && (
          <p
            className="mb-6"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '14px',
              color: '#6b5a4a',
            }}
          >
            {question.description}
          </p>
        )}

        {/* Options */}
        <div className="space-y-3">
          {question.options.map((option) => {
            const isSelected = selectedAnswers.includes(option.id);

            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className="w-full p-4 rounded-xl text-left transition-all active:scale-[0.98]"
                style={{
                  border: isSelected ? '2px solid #9c1723' : '1px solid #2d2620',
                  background: isSelected
                    ? 'linear-gradient(243deg, rgba(174, 30, 43, 0.1) 15%, rgba(156, 23, 35, 0.1) 99%)'
                    : '#fff',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      border: isSelected ? 'none' : '2px solid #2d2620',
                      background: isSelected
                        ? 'linear-gradient(243deg, #ae1e2b 15%, #9c1723 99%)'
                        : 'transparent',
                    }}
                  >
                    {isSelected && <Check className="w-4 h-4 text-white" />}
                  </div>
                  <span
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontSize: '15px',
                      lineHeight: 1.4,
                      color: '#2d2620',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {option.text}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#f7f1e8] via-[#f7f1e8] to-transparent pt-8">
        <button
          onClick={handleNext}
          disabled={!canProceed()}
          className="w-full py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
          style={{
            background: canProceed()
              ? 'linear-gradient(243deg, #ae1e2b 15%, #9c1723 99%)'
              : '#d1d5db',
            color: '#fff',
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 600,
            fontSize: '16px',
          }}
        >
          {currentQuestion < questions.length - 1 ? (
            <>
              Далее
              <ChevronRight className="w-5 h-5" />
            </>
          ) : (
            'Завершить тест'
          )}
        </button>
      </div>
    </div>
  );
}
