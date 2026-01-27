'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function RulesPage() {
  const router = useRouter();
  const [showIframe, setShowIframe] = useState(false);

  // ⚡️ OPTIMIZATION: Delay iframe render to show UI instantly
  useEffect(() => {
    // Show UI immediately, load PDF after paint
    const timer = setTimeout(() => setShowIframe(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="h-screen w-full flex flex-col bg-[#f7f1e8]">
      {/* Кнопка назад */}
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
        {!showIframe && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#d93547] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p style={{ fontFamily: 'Gilroy, sans-serif', color: '#2d2620' }}>
                Загрузка правил...
              </p>
            </div>
          </div>
        )}
        {showIframe && (
          <iframe
            src="https://store.daniillepekhin.com/IK%2Fclub_miniapp%2F%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0%20%D0%BA%D0%BB%D1%83%D0%B1%D0%B0.pdf"
            className="w-full h-full border-0"
            title="Правила клуба"
            loading="eager"
          />
        )}
      </div>
    </div>
  );
}
