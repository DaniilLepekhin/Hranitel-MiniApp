'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function OfferPage() {
  const router = useRouter();

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
          Оферта
        </h1>
      </div>

      {/* Iframe */}
      <div className="flex-1">
        <iframe
          src="https://ishodnyi-kod.com/clubofert"
          className="w-full h-full border-0"
          title="Оферта"
        />
      </div>
    </div>
  );
}
