'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';

const PDF_URL = 'https://store.daniillepekhin.com/IK%2Fclub_miniapp%2F%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0%20%D0%BA%D0%BB%D1%83%D0%B1%D0%B0.pdf';

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

export default function RulesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const proxyUrl = `${getApiUrl()}/api/v1/pdf-proxy?url=${encodeURIComponent(PDF_URL)}`;

  return (
    <div className="h-screen w-full flex flex-col bg-[#f7f1e8]">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-[#2d2620]">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all active:scale-95"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 600,
            fontSize: '16px',
            color: '#2d2620',
            border: '1px solid #2d2620',
            backgroundColor: 'transparent',
          }}
        >
          <ArrowLeft className="w-5 h-5" />
          Назад
        </button>
        <h1
          className="flex-1 text-center mr-20"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '24px',
            color: '#2d2620',
          }}
        >
          Правила клуба
        </h1>
      </div>

      {/* PDF iframe */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#f7f1e8]">
            <Loader2 className="w-8 h-8 text-[#d93547] animate-spin mb-3" />
            <p style={{ fontFamily: 'Gilroy, sans-serif', color: '#6b5a4a', fontSize: '14px' }}>
              Загрузка правил...
            </p>
          </div>
        )}
        <iframe
          src={proxyUrl}
          className="w-full h-full border-0"
          title="Правила клуба"
          loading="eager"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
}
