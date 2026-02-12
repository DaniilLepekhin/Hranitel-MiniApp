'use client';

import { useState } from 'react';
import { CheckCircle, FileText, Download } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

interface FileLessonProps {
  title: string;
  description?: string;
  pdfUrl: string;
  attachments?: { title: string; url: string; type?: string }[];
  onComplete?: () => void;
  isCompleted?: boolean;
}

export function FileLesson({
  title,
  description,
  pdfUrl,
  attachments = [],
  onComplete,
  isCompleted = false,
}: FileLessonProps) {
  const { haptic } = useTelegram();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = () => {
    if (isCompleted || isSubmitting) return;
    setIsSubmitting(true);
    onComplete?.();
    haptic.notification('success');
  };

  const handleDownload = () => {
    haptic.impact('medium');
    window.open(pdfUrl, '_blank');
  };

  return (
    <div className="w-full">
      {/* Preview Card */}
      <div className="relative w-full aspect-[3/4] bg-gradient-to-br from-[#2b2520] to-[#1a1512] rounded-2xl overflow-hidden shadow-lg mb-4">
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mb-4">
            <FileText className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
          {description && (
            <p className="text-white/60 text-sm line-clamp-3 mb-4">{description}</p>
          )}
          
          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="px-6 py-3 rounded-xl bg-white text-[#2b2520] font-semibold hover:bg-white/90 transition-all active:scale-95 flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            Открыть PDF
          </button>
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-[#d93547]/5 to-[#9c1723]/5">
          <p className="text-[#6b5a4a] leading-relaxed text-sm whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {/* Additional Attachments */}
      {attachments.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[#6b5a4a] text-sm font-semibold mb-2">Дополнительные материалы:</p>
          {attachments.map((attachment, index) => (
            <a
              key={index}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-3 rounded-xl bg-[#d93547]/10 text-[#d93547] font-semibold hover:bg-[#d93547]/20 transition-all flex items-center justify-center gap-2"
              onClick={() => haptic.impact('light')}
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
      {!isCompleted && (
        <button
          onClick={handleComplete}
          disabled={isSubmitting}
          className="w-full mt-4 px-6 py-4 rounded-xl bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white font-bold shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle className="w-5 h-5" />
          <span>{isSubmitting ? 'Сохранение...' : 'Я изучил(а) материал'}</span>
        </button>
      )}

      {/* Completion Status */}
      {isCompleted && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/30 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-[#2b2520]">Материал изучен!</p>
            <p className="text-[#6b5a4a] text-sm">Energy Points уже начислены</p>
          </div>
        </div>
      )}
    </div>
  );
}
