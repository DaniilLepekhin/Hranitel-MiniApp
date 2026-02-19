'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';

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

function PdfViewerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get('url') || '';
  const title = searchParams.get('title') || 'Документ';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!url) {
    return (
      <div className="min-h-screen bg-[#f0ece8] flex items-center justify-center p-4">
        <p className="text-[#6b5a4a]">PDF не найден</p>
      </div>
    );
  }

  // Proxy through our backend — works everywhere, no CORS issues
  const proxyUrl = `${getApiUrl()}/api/v1/pdf-proxy?url=${encodeURIComponent(url)}`;

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const handleDownload = () => {
    // Fallback: open in external browser for actual download
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      window.Telegram.WebApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-[#f0ece8] flex flex-col">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3 safe-top"
        style={{
          background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
        }}
      >
        <button
          onClick={handleBack}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <p
          className="flex-1 truncate"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 600,
            fontSize: '15px',
            color: '#f7f1e8',
          }}
        >
          {title}
        </p>
        <button
          onClick={handleDownload}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          <Download className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* PDF Content */}
      <div className="flex-1 relative">
        {/* Loading overlay */}
        {loading && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#f0ece8]">
            <Loader2 className="w-8 h-8 text-[#d93547] animate-spin mb-3" />
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 500,
                fontSize: '14px',
                color: '#6b5a4a',
              }}
            >
              Загрузка документа...
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#f0ece8] p-6">
            <p
              className="text-center mb-4"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 500,
                fontSize: '14px',
                color: '#6b5a4a',
              }}
            >
              Не удалось загрузить документ
            </p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all active:scale-95"
              style={{
                background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                color: '#f7f1e8',
                fontFamily: 'Gilroy, sans-serif',
                fontSize: '14px',
              }}
            >
              <Download className="w-4 h-4" />
              Открыть в браузере
            </button>
          </div>
        )}

        <iframe
          src={proxyUrl}
          className="w-full h-full border-0"
          style={{ minHeight: 'calc(100vh - 52px)' }}
          title={title}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
        />
      </div>
    </div>
  );
}

export default function PdfViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f0ece8] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#d93547] animate-spin" />
        </div>
      }
    >
      <PdfViewerContent />
    </Suspense>
  );
}
