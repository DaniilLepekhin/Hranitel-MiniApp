'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, BookOpen, Headphones, Radio, ChevronRight, Filter, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { contentApi, type ContentItem } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';
import { Card } from '@/components/ui/Card';

type ContentType = 'course' | 'podcast' | 'stream_record' | 'practice';

export default function ContentListPage() {
  const router = useRouter();
  const params = useParams();
  const { haptic } = useTelegram();
  const type = params.type as ContentType;

  const [selectedKey, setSelectedKey] = useState<number | null>(null);

  // Fetch content by type
  const { data: contentData, isLoading } = useQuery({
    queryKey: ['content', 'list', type, selectedKey],
    queryFn: () =>
      contentApi.getItems({
        type,
        ...(selectedKey && { keyNumber: selectedKey }),
      }),
  });

  const items = contentData?.items || [];

  // Group items by key
  const itemsByKey = items.reduce((acc, item) => {
    const key = item.keyNumber || 0;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<number, ContentItem[]>);

  const keys = Object.keys(itemsByKey)
    .map(Number)
    .sort((a, b) => a - b);

  const getTypeConfig = (type: ContentType) => {
    switch (type) {
      case 'course':
        return {
          title: 'Курсы',
          icon: BookOpen,
          description: 'Структурированные программы обучения',
          gradient: 'from-[#d93547] to-[#9c1723]',
        };
      case 'podcast':
        return {
          title: 'Подкасты',
          icon: Headphones,
          description: 'Аудио-контент для обучения в любое время',
          gradient: 'from-[#d93547] to-[#9c1723]',
        };
      case 'stream_record':
        return {
          title: 'Записи эфиров',
          icon: Radio,
          description: 'Записи прямых эфиров с разбором тем',
          gradient: 'from-[#d93547] to-[#9c1723]',
        };
      case 'practice':
        return {
          title: 'Практики',
          icon: Sparkles,
          description: 'Практические упражнения для трансформации',
          gradient: 'from-[#d93547] to-[#9c1723]',
        };
      default:
        return {
          title: 'Контент',
          icon: BookOpen,
          description: 'Материалы для изучения',
          gradient: 'from-[#d93547] to-[#9c1723]',
        };
    }
  };

  const config = getTypeConfig(type);
  const Icon = config.icon;

  const handleItemClick = (itemId: string) => {
    haptic.impact('light');
    router.push(`/content/${itemId}`);
  };

  const handleKeyFilter = (key: number | null) => {
    haptic.impact('light');
    setSelectedKey(key);
  };

  if (isLoading) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="space-y-4">
          <div className="h-32 rounded-3xl bg-[#e8dcc6] animate-pulse" />
          <div className="h-24 rounded-xl bg-[#e8dcc6] animate-pulse" />
          <div className="h-24 rounded-xl bg-[#e8dcc6] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#d93547]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#2b2520]">{config.title}</h1>
          <p className="text-sm text-[#6b5a4a]">{config.description}</p>
        </div>
      </div>

      {/* Hero Card */}
      <Card className={`p-6 mb-6 bg-gradient-to-br ${config.gradient}/20 border-2 border-[#d93547]`}>
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg`}>
            <Icon className="w-8 h-8 text-white" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[#2b2520] mb-1">{config.title}</h2>
            <p className="text-[#6b5a4a]">{items.length} материалов</p>
          </div>
        </div>
      </Card>

      {/* Key Filter */}
      {keys.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-[#d93547]" />
            <span className="text-sm font-semibold text-[#2b2520]">Фильтр по ключам</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <button
              onClick={() => handleKeyFilter(null)}
              className={`px-4 py-2 rounded-full whitespace-nowrap transition-all flex-shrink-0 ${
                selectedKey === null
                  ? 'bg-[#d93547] text-white'
                  : 'bg-white/80 text-[#6b5a4a] hover:bg-white'
              }`}
            >
              Все
            </button>
            {keys.map((key) => (
              <button
                key={key}
                onClick={() => handleKeyFilter(key)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedKey === key
                    ? 'bg-[#d93547] text-white'
                    : 'bg-white/80 text-[#6b5a4a] hover:bg-white'
                }`}
              >
                Ключ #{key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <Icon className="w-16 h-16 mx-auto text-[#d93547]/50 mb-4" />
          <h3 className="text-lg font-semibold text-[#2b2520] mb-2">
            Пока нет материалов
          </h3>
          <p className="text-[#6b5a4a]">
            Скоро здесь появятся {config.title.toLowerCase()}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className="p-4 hover:scale-[1.02] transition-all cursor-pointer"
              onClick={() => handleItemClick(item.id)}
            >
              <div className="flex items-center gap-4">
                {/* Thumbnail */}
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-10 h-10 text-white" strokeWidth={2} />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {item.keyNumber && (
                      <span className="px-2 py-0.5 rounded-full bg-[#d93547]/20 text-[#d93547] text-xs font-semibold">
                        Ключ #{item.keyNumber}
                      </span>
                    )}
                    {item.monthProgram && (
                      <span className="px-2 py-0.5 rounded-full bg-[#d93547]/20 text-[#d93547] text-xs font-semibold">
                        Программа месяца
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-[#2b2520] line-clamp-1 mb-1">
                    {item.title}
                  </h4>
                  {item.description && (
                    <p className="text-sm text-[#6b5a4a] line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <ChevronRight className="w-5 h-5 text-[#d93547] flex-shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
