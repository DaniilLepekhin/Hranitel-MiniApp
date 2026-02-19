'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle, FileText, Download } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { getPdfViewerUrl } from '@/lib/pdf';

interface FileLessonProps {
  title: string;
  description?: string;
  pdfUrl: string;
  attachments?: { title: string; url: string; type?: string }[];
  onComplete?: () => void;
  isCompleted?: boolean;
  isPending?: boolean;
}

export function FileLesson({
  title,
  description,
  pdfUrl,
  attachments = [],
  onComplete,
  isCompleted = false,
  isPending = false,
}: FileLessonProps) {
  const { haptic } = useTelegram();
  const router = useRouter();

  const handleComplete = () => {
    if (isCompleted || isPending) return;
    onComplete?.();
    haptic.notification('success');
  };

  const handleOpenPdf = () => {
    haptic.impact('medium');
    router.push(getPdfViewerUrl(pdfUrl, title));
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
          
          {/* Open PDF Button */}
          <button
            onClick={handleOpenPdf}
            className="px-6 py-3 rounded-xl bg-white text-[#2b2520] font-semibold hover:bg-white/90 transition-all active:scale-95 flex items-center gap-2"
          >
            <FileText className="w-5 h-5" />
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
          {attachments.map((attachment, index) => {
            const isPdf = attachment.url?.toLowerCase().endsWith('.pdf');
            return (
              <button
                key={index}
                onClick={() => {
                  haptic.impact('light');
                  if (isPdf) {
                    router.push(getPdfViewerUrl(attachment.url, attachment.title));
                  } else {
                    window.open(attachment.url, '_blank');
                  }
                }}
                className="w-full px-4 py-3 rounded-xl bg-[#d93547]/10 text-[#d93547] font-semibold hover:bg-[#d93547]/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <FileText className="w-5 h-5" />
                {attachment.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Complete Button */}
      {!isCompleted && (
        <button
          onClick={handleComplete}
          disabled={isPending}
          className="w-full mt-4 px-6 py-4 rounded-xl bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white font-bold shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle className="w-5 h-5" />
          <span>{isPending ? 'Сохранение...' : 'Я изучил(а) материал'}</span>
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
