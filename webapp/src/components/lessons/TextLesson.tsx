'use client';

import { useState } from 'react';
import { CheckCircle, FileText } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

interface TextLessonProps {
  title: string;
  content: string;
  onComplete?: () => void;
  attachments?: { title: string; url: string; type?: string }[];
}

export function TextLesson({
  title,
  content,
  onComplete,
  attachments = [],
}: TextLessonProps) {
  const { haptic } = useTelegram();
  const [hasCompleted, setHasCompleted] = useState(false);

  const handleComplete = () => {
    setHasCompleted(true);
    onComplete?.();
    haptic.notification('success');
  };

  return (
    <div className="w-full">
      {/* Title Card */}
      <div className="relative w-full bg-gradient-to-br from-[#2b2520] to-[#1a1512] rounded-2xl overflow-hidden shadow-lg p-6 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-white font-bold text-lg flex-1">{title}</h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 rounded-2xl bg-white/80 shadow-lg">
        <div 
          className="prose prose-sm max-w-none text-[#2b2520] leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="mt-4 space-y-2">
          {attachments.map((attachment, index) => (
            <a
              key={index}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-3 rounded-xl bg-[#d93547]/10 text-[#d93547] font-semibold hover:bg-[#d93547]/20 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {attachment.title}
            </a>
          ))}
        </div>
      )}

      {/* Complete Button */}
      {!hasCompleted && (
        <button
          onClick={handleComplete}
          className="w-full mt-4 px-6 py-4 rounded-xl bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white font-bold shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          <span>Я прочитал(а) урок</span>
        </button>
      )}

      {/* Completion Status */}
      {hasCompleted && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10 border border-[#9c1723]/30 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-[#d93547] flex-shrink-0" />
          <div>
            <p className="font-semibold text-[#2b2520]">Урок завершён!</p>
            <p className="text-[#6b5a4a] text-sm">Energy Points начислены на ваш счёт</p>
          </div>
        </div>
      )}
    </div>
  );
}
