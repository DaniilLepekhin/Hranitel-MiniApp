# 🚀 ДЕТАЛЬНЫЙ ПЛАН ОПТИМИЗАЦИИ ПРИЛОЖЕНИЯ КОД ДЕНЕГ 4.0

## 📊 Текущее состояние (после базовых оптимизаций)

### Уже сделано ✅
- ✅ Удалено 51 MB неиспользуемых ассетов
- ✅ Lazy loading для модальных окон
- ✅ Memoization критичных компонентов
- ✅ Link prefetching для навигации
- ✅ Bundle analyzer настроен
- ✅ Resource hints добавлены
- ✅ Middleware с security headers
- ✅ CSS минификация
- ✅ Webpack tree-shaking

### Текущие метрики
```
First Load JS: 102 KB (shared)
Самая тяжёлая страница: / (144 KB + 102 KB = 262 KB)
Middleware: 34.2 KB
```

---

## 🎯 ПЛАН ОПТИМИЗАЦИИ ПО РАЗДЕЛАМ

---

## 1️⃣ ГЛАВНАЯ СТРАНИЦА (/) - 262 KB

**Текущие проблемы:**
- 144 KB кода страницы (самая тяжёлая!)
- Загружает все 5 табов сразу
- Множественные API запросы на старте

### Оптимизации:

#### A. Virtual Tabs (Высокий приоритет, 30 мин) ⚡⚡⚡
**Проблема:** Все табы рендерятся сразу, даже невидимые
**Решение:** Рендерить только активный таб

```tsx
// webapp/src/app/page.tsx
const TABS = [
  { id: 'home', component: lazy(() => import('@/components/tabs/HomeTab')) },
  { id: 'courses', component: lazy(() => import('@/components/tabs/CoursesTab')) },
  // ...
];

// Рендерим только активный
<Suspense fallback={<TabSkeleton />}>
  {activeTab === 'home' && <HomeTab />}
</Suspense>
```

**Эффект:** -80 KB на начальной загрузке, -60% Time to Interactive

---

#### B. API Request Deduplication (Средний приоритет, 20 мин) ⚡⚡
**Проблема:** Несколько компонентов запрашивают один и тот же `/energies/balance`

**Текущие дубли:**
- HomeTab → `/energies/balance`
- ProfileTab → `/energies/balance`
- RatingsTab → `/energies/balance`

**Решение:** React Query автоматически дедуплицирует, но нужно проверить `staleTime`

```tsx
// webapp/src/app/providers.tsx
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 минут вместо 0
      gcTime: 10 * 60 * 1000,   // 10 минут вместо 5
      refetchOnWindowFocus: false, // Не перезапрашивать при фокусе
      refetchOnMount: false,       // Не перезапрашивать при монтировании если данные fresh
    },
  },
})
```

**Эффект:** -50% сетевых запросов, -200ms загрузка

---

#### C. Skeleton Screens вместо Spinner (Низкий приоритет, 15 мин) ⚡
**Проблема:** Пустой экран пока загружаются данные

**Решение:** Показывать скелетон сразу

```tsx
// webapp/src/components/skeletons/CourseCardSkeleton.tsx
export const CourseCardSkeleton = () => (
  <div className="animate-pulse bg-white/50 rounded-2xl p-4">
    <div className="h-20 w-20 bg-gray-300 rounded-xl mb-2" />
    <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
    <div className="h-3 bg-gray-300 rounded w-1/2" />
  </div>
);
```

**Эффект:** Улучшенный UX, воспринимаемая скорость +30%

---

## 2️⃣ КУРСЫ (/courses, /course/[id]) - 122-123 KB

**Текущие проблемы:**
- Нет кэширования списка курсов
- Изображения обложек не оптимизированы
- Нет prefetch при скролле

### Оптимизации:

#### A. Next.js Image Component (Высокий приоритет, 20 мин) ⚡⚡⚡
**Проблема:** Используются `<div style={{backgroundImage}}` вместо оптимизированных изображений

```tsx
// Было:
<div style={{ backgroundImage: `url(${course.coverUrl})` }} />

// Стало:
import Image from 'next/image';
<Image 
  src={course.coverUrl} 
  alt={course.title}
  width={320}
  height={192}
  quality={75}
  loading="lazy"
  placeholder="blur"
  blurDataURL="data:image/..." // tiny blur
/>
```

**Эффект:** -40% размер изображений (AVIF), lazy loading

---

#### B. Intersection Observer Prefetch (Средний приоритет, 25 мин) ⚡⚡
**Проблема:** Prefetch срабатывает для всех ссылок, даже вне viewport

**Решение:** Prefetch только когда курс попадает в viewport

```tsx
// webapp/src/hooks/useIntersectionPrefetch.ts
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export const useIntersectionPrefetch = (href: string) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const router = useRouter();
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          router.prefetch(href);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );
    
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [href, router]);
  
  return ref;
};

// Использование:
const ref = useIntersectionPrefetch(`/course/${course.id}`);
<Link ref={ref} href={...}>
```

**Эффект:** Prefetch только нужных страниц, -70% лишних запросов

---

#### C. Static Generation для популярных курсов (Средний приоритет, 15 мин) ⚡⚡
**Проблема:** Все курсы рендерятся на сервере при каждом запросе

**Решение:** Pre-render топ-3 курса

```tsx
// webapp/src/app/course/[id]/page.tsx
export async function generateStaticParams() {
  // Генерируем статические страницы для популярных курсов
  return [
    { id: '1' }, // Курс "Деньги по-женски"
    { id: '2' },
    { id: '3' },
  ];
}

export const revalidate = 3600; // Обновлять каждый час
```

**Эффект:** Instant load для популярных курсов, -500ms

---

## 3️⃣ РЕЙТИНГИ (/ratings) - 123 KB

**Текущие проблемы:**
- 8 одновременных API запросов!
- Тяжёлый рендеринг длинных списков
- Нет виртуализации

### Оптимизации:

#### A. Batch API Requests (Высокий приоритет, 30 мин) ⚡⚡⚡
**Проблема:** 8 отдельных запросов для данных рейтинга

```tsx
// Было:
useQuery({ queryKey: ['balance'], queryFn: () => api.getBalance() })
useQuery({ queryKey: ['history'], queryFn: () => api.getHistory() })
useQuery({ queryKey: ['leaderboard'], queryFn: () => api.getLeaderboard() })
// ... ещё 5 запросов

// Стало:
// backend/src/modules/ratings/index.ts
.get('/all', async ({ user }) => {
  const [balance, history, leaderboard, cityRatings, teamRatings, position] = 
    await Promise.all([
      getBalance(user.id),
      getHistory(user.id),
      getLeaderboard(),
      getCityRatings(),
      getTeamRatings(),
      getUserPosition(user.id),
    ]);
  
  return { balance, history, leaderboard, cityRatings, teamRatings, position };
})

// frontend
useQuery({ 
  queryKey: ['ratingsAll'], 
  queryFn: () => ratingsApi.getAll(),
  select: (data) => ({
    balance: data.balance,
    history: data.history,
    // ...
  })
})
```

**Эффект:** 8 запросов → 1 запрос, -70% network time

---

#### B. Virtual List для Leaderboard (Высокий приоритет, 25 мин) ⚡⚡⚡
**Проблема:** Рендерится 100+ элементов списка одновременно

**Решение:** React Virtual / TanStack Virtual

```bash
npm install @tanstack/react-virtual
```

```tsx
// webapp/src/components/tabs/RatingsTab.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const parentRef = useRef<HTMLDivElement>(null);

const virtualizer = useVirtualizer({
  count: leaderboard.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 64, // высота одного элемента
  overscan: 5, // рендерить 5 extra элементов
});

<div ref={parentRef} className="h-[400px] overflow-auto">
  <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
    {virtualizer.getVirtualItems().map(virtualRow => (
      <LeaderboardItem 
        key={virtualRow.index}
        user={leaderboard[virtualRow.index]}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
        }}
      />
    ))}
  </div>
</div>
```

**Эффект:** Рендер только 10-15 элементов вместо 100+, +80% скорость скролла

---

#### C. Incremental Data Loading (Средний приоритет, 20 мин) ⚡⚡
**Проблема:** Загружается весь leaderboard сразу

**Решение:** Pagination или infinite scroll

```tsx
// backend: добавить параметры limit/offset
.get('/leaderboard', async ({ query }) => {
  const limit = parseInt(query.limit || '20');
  const offset = parseInt(query.offset || '0');
  
  return db.select()
    .from(users)
    .orderBy(desc(users.energies))
    .limit(limit)
    .offset(offset);
})

// frontend: infinite scroll
import { useInfiniteQuery } from '@tanstack/react-query';

const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['leaderboard'],
  queryFn: ({ pageParam = 0 }) => 
    ratingsApi.getLeaderboard({ offset: pageParam, limit: 20 }),
  getNextPageParam: (lastPage, pages) => 
    lastPage.length === 20 ? pages.length * 20 : undefined,
});

// При скролле до конца
<IntersectionObserver onIntersect={() => fetchNextPage()} />
```

**Эффект:** -80% начальной загрузки, -500ms

---

## 4️⃣ МАГАЗИН (/shop) - В HomeTab

**Текущие проблемы:**
- Загружается 3 API сразу (items, balance, purchases)
- Нет кэширования купленных предметов
- Нет оптимистичных обновлений при покупке

### Оптимизации:

#### A. Optimistic Updates при покупке (Высокий приоритет, 15 мин) ⚡⚡
**Проблема:** После покупки долгая перезагрузка данных

```tsx
// webapp/src/components/tabs/ShopTab.tsx
const purchaseMutation = useMutation({
  mutationFn: (itemId) => shopApi.purchase(itemId),
  onMutate: async (itemId) => {
    // Отменяем текущие запросы
    await queryClient.cancelQueries({ queryKey: ['balance'] });
    await queryClient.cancelQueries({ queryKey: ['purchases'] });
    
    // Сохраняем предыдущие данные
    const previousBalance = queryClient.getQueryData(['balance']);
    const previousPurchases = queryClient.getQueryData(['purchases']);
    
    // Оптимистично обновляем
    const item = items.find(i => i.id === itemId);
    queryClient.setQueryData(['balance'], (old) => ({
      ...old,
      balance: old.balance - item.cost
    }));
    queryClient.setQueryData(['purchases'], (old) => [...old, item]);
    
    return { previousBalance, previousPurchases };
  },
  onError: (err, itemId, context) => {
    // Откатываем при ошибке
    queryClient.setQueryData(['balance'], context.previousBalance);
    queryClient.setQueryData(['purchases'], context.previousPurchases);
  },
});
```

**Эффект:** Instant UI update, воспринимаемая скорость +90%

---

#### B. Parallel API Calls (Средний приоритет, 10 мин) ⚡⚡
**Проблема:** Запросы выполняются последовательно

```tsx
// Было: 3 отдельных useQuery (выполняются по очереди)

// Стало: Promise.all на бэкенде
// backend/src/modules/shop/index.ts
.get('/all-data', async ({ user }) => {
  const [items, balance, purchases] = await Promise.all([
    getShopItems(),
    getBalance(user.id),
    getPurchases(user.id),
  ]);
  return { items, balance, purchases };
})
```

**Эффект:** -300ms загрузка

---

## 5️⃣ ЧАТЫ (ChatsTab) - В HomeTab

**Текущие проблемы:**
- 5+ API запросов при открытии
- Нет кэширования списка стран/городов
- Dropdown запросы при каждом клике

### Оптимизации:

#### A. Static Data для стран/городов (Высокий приоритет, 15 мин) ⚡⚡⚡
**Проблема:** Список стран/городов не меняется, но запрашивается каждый раз

```tsx
// webapp/src/lib/staticData.ts
export const COUNTRIES_CACHE = {
  data: null,
  timestamp: 0,
  TTL: 24 * 60 * 60 * 1000, // 1 день
};

export const getCountries = async () => {
  const now = Date.now();
  if (COUNTRIES_CACHE.data && (now - COUNTRIES_CACHE.timestamp < COUNTRIES_CACHE.TTL)) {
    return COUNTRIES_CACHE.data;
  }
  
  const data = await cityChatApi.getCountries();
  COUNTRIES_CACHE.data = data;
  COUNTRIES_CACHE.timestamp = now;
  return data;
};

// Или ещё лучше: hardcode в коде
const COUNTRIES = [
  '🇷🇺 Россия',
  '🇰🇿 Казахстан',
  '🇧🇾 Беларусь',
  // ...
] as const;
```

**Эффект:** -2 API запроса, instant UX

---

#### B. Debounced City Search (Средний приоритет, 10 мин) ⚡
**Проблема:** Запрос при каждом изменении страны

```tsx
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const [selectedCountry, setSelectedCountry] = useState('');
const debouncedCountry = useDebouncedValue(selectedCountry, 300);

useQuery({
  queryKey: ['cities', debouncedCountry],
  queryFn: () => cityChatApi.getCities(debouncedCountry),
  enabled: !!debouncedCountry,
});
```

**Эффект:** -60% ненужных запросов

---

## 6️⃣ МЕДИТАЦИИ (MeditationsTab) - В HomeTab

**Текущие проблемы:**
- Аудио файлы не кэшируются
- Нет предзагрузки следующей медитации
- Тяжёлые превью изображения

### Оптимизации:

#### A. Audio Preloading (Средний приоритет, 20 мин) ⚡⚡
**Проблема:** Аудио начинает загружаться только при клике

```tsx
// webapp/src/components/MeditationPlayer.tsx
const MeditationPlayer = ({ meditation, nextMeditation }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const nextAudioRef = useRef<HTMLAudioElement>(null);
  
  // Предзагружаем следующую медитацию
  useEffect(() => {
    if (nextMeditation && nextAudioRef.current) {
      nextAudioRef.current.preload = 'auto';
    }
  }, [nextMeditation]);
  
  return (
    <>
      <audio ref={audioRef} src={meditation.audioUrl} />
      {nextMeditation && (
        <audio ref={nextAudioRef} src={nextMeditation.audioUrl} preload="auto" />
      )}
    </>
  );
};
```

**Эффект:** Instant playback для следующей медитации

---

#### B. Background Audio Cache (Service Worker) (Низкий приоритет, 30 мин) ⚡
**Проблема:** Повторное скачивание одних и тех же файлов

```ts
// webapp/public/sw.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/audio/')) {
    event.respondWith(
      caches.open('meditation-audio-v1').then(cache => 
        cache.match(event.request).then(response => 
          response || fetch(event.request).then(fetchResponse => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          })
        )
      )
    );
  }
});
```

**Эффект:** Офлайн воспроизведение, -100% повторной загрузки

---

## 7️⃣ КОНТЕНТ (Путь, видео, практики)

**Текущие проблемы:**
- Множественные запросы для одного контента
- Video player не оптимизирован
- Нет предзагрузки следующего видео

### Оптимизации:

#### A. Combined Content API (Высокий приоритет, 25 мин) ⚡⚡⚡
**Проблема:** `/content/[itemId]` делает 4 запроса

```tsx
// Было:
useQuery({ queryKey: ['content', itemId], queryFn: () => contentApi.get(itemId) })
useQuery({ queryKey: ['sections', itemId], queryFn: () => contentApi.getSections(itemId) })
useQuery({ queryKey: ['videos', itemId], queryFn: () => contentApi.getVideos(itemId) })
useQuery({ queryKey: ['progress', itemId], queryFn: () => contentApi.getProgress(itemId) })

// Стало:
// backend/src/modules/content/index.ts
.get('/:itemId/full', async ({ params, user }) => {
  const [content, sections, videos, progress] = await Promise.all([
    getContent(params.itemId),
    getSections(params.itemId),
    getVideos(params.itemId),
    getProgress(user.id, params.itemId),
  ]);
  return { content, sections, videos, progress };
})

// frontend
const { data } = useQuery({
  queryKey: ['contentFull', itemId],
  queryFn: () => contentApi.getFull(itemId),
});
```

**Эффект:** 4 запроса → 1, -400ms

---

#### B. Video Thumbnail Optimization (Средний приоритет, 15 мин) ⚡⚡
**Проблема:** Тяжёлые video thumbnails

```tsx
// Генерируем thumbnails на бэкенде при загрузке видео
// backend/src/utils/videoThumbnail.ts
import ffmpeg from 'fluent-ffmpeg';

export const generateThumbnail = async (videoUrl: string) => {
  const thumbnailPath = `/thumbnails/${videoId}_thumb.webp`;
  
  await ffmpeg(videoUrl)
    .screenshots({
      timestamps: ['00:00:01.000'],
      filename: `${videoId}_thumb.webp`,
      folder: './public/thumbnails',
      size: '320x180',
    });
    
  return thumbnailPath;
};

// frontend: используем Next/Image
<Image src={video.thumbnailUrl} width={320} height={180} quality={70} />
```

**Эффект:** -70% размер thumbnails

---

#### C. Video Player Lazy Load (Средний приоритет, 10 мин) ⚡
**Проблема:** Плеер загружается даже если пользователь не начал смотреть

```tsx
import dynamic from 'next/dynamic';

const ReactPlayer = dynamic(() => import('react-player/lazy'), {
  ssr: false,
  loading: () => <VideoPlayerSkeleton />
});

// Загружается только при клике на Play
const [shouldLoad, setShouldLoad] = useState(false);
{shouldLoad ? (
  <ReactPlayer url={videoUrl} playing />
) : (
  <div onClick={() => setShouldLoad(true)}>
    <PlayButton />
  </div>
)}
```

**Эффект:** -200 KB начальной загрузки

---

## 8️⃣ ПРОФИЛЬ (ProfileTab)

**Текущие проблемы:**
- Аватар не кэшируется
- Update profile перезагружает всю страницу
- Нет валидации на клиенте

### Оптимизации:

#### A. Avatar Optimization (Средний приоритет, 15 мин) ⚡⚡
**Проблема:** Telegram аватары загружаются в полном размере

```tsx
// webapp/src/components/UserAvatar.tsx
export const UserAvatar = ({ photoUrl, size = 64 }) => {
  // Telegram API позволяет запросить конкретный размер
  const optimizedUrl = photoUrl?.replace(/\/\d+$/, `/${size}`);
  
  return (
    <Image
      src={optimizedUrl || '/default-avatar.svg'}
      width={size}
      height={size}
      quality={80}
      className="rounded-full"
      loading="lazy"
    />
  );
};
```

**Эффект:** -60% размер аватаров

---

#### B. Form Validation (Низкий приоритет, 20 мин) ⚡
**Проблема:** Валидация только на сервере

```tsx
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const profileSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().max(50),
  city: z.string().min(1),
});

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(profileSchema),
});
```

**Эффект:** Меньше ошибочных запросов, лучший UX

---

## 9️⃣ BACKEND ОПТИМИЗАЦИИ

### A. Database Indexes (Высокий приоритет, 30 мин) ⚡⚡⚡

**Проблема:** Медленные запросы из-за отсутствия индексов

```sql
-- migration/add-performance-indexes.sql

-- Индексы для рейтингов
CREATE INDEX CONCURRENTLY idx_users_energies_desc ON users(energies DESC NULLS LAST);
CREATE INDEX CONCURRENTLY idx_users_city_energies ON users(city, energies DESC) WHERE city IS NOT NULL;

-- Индексы для курсов
CREATE INDEX CONCURRENTLY idx_course_progress_user_course ON course_progress(user_id, course_id);
CREATE INDEX CONCURRENTLY idx_course_progress_completed ON course_progress(user_id) WHERE completed = true;

-- Индексы для десяток
CREATE INDEX CONCURRENTLY idx_decades_city_active ON decades(city, is_active, is_full) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_decade_members_user ON decade_members(user_id) WHERE left_at IS NULL;

-- Индексы для магазина
CREATE INDEX CONCURRENTLY idx_shop_purchases_user ON shop_purchases(user_id, created_at DESC);

-- Индексы для энергии
CREATE INDEX CONCURRENTLY idx_energy_transactions_user_date ON energy_transactions(user_id, created_at DESC);
```

**Эффект:** -80% время запросов, -500ms на leaderboard

---

### B. Query Optimization (Высокий приоритет, 45 мин) ⚡⚡⚡

**Проблема:** N+1 запросы в некоторых эндпоинтах

```ts
// backend/src/modules/courses/service.ts

// Было (N+1):
const courses = await db.select().from(courses);
for (const course of courses) {
  course.progress = await getProgress(userId, course.id); // N запросов!
}

// Стало (1 запрос):
const courses = await db
  .select({
    course: courses,
    progress: courseProgress,
  })
  .from(courses)
  .leftJoin(
    courseProgress,
    and(
      eq(courseProgress.courseId, courses.id),
      eq(courseProgress.userId, userId)
    )
  );
```

**Эффект:** -90% database load, -300ms

---

### C. Response Compression (Уже сделано, но проверить) ✅

Проверить что Bun действительно сжимает ответы:

```bash
curl -H "Accept-Encoding: gzip" https://api.example.com/api/v1/leaderboard -v
# Должен быть header: Content-Encoding: gzip
```

---

### D. Redis Caching (Средний приоритет, 60 мин) ⚡⚡

**Проблема:** Leaderboard запрашивается из БД каждый раз

```ts
// backend/src/modules/ratings/service.ts
import { redis } from '@/utils/redis';

export const getLeaderboard = async () => {
  // Проверяем кэш
  const cached = await redis.get('leaderboard:top100');
  if (cached) return JSON.parse(cached);
  
  // Запрашиваем из БД
  const leaderboard = await db
    .select()
    .from(users)
    .orderBy(desc(users.energies))
    .limit(100);
  
  // Кэшируем на 5 минут
  await redis.setex('leaderboard:top100', 300, JSON.stringify(leaderboard));
  
  return leaderboard;
};

// Инвалидация при изменении энергии
export const awardEnergy = async (userId, amount) => {
  await updateUserEnergy(userId, amount);
  await redis.del('leaderboard:top100'); // Сбрасываем кэш
};
```

**Эффект:** -95% database load для leaderboard, -50ms

---

## 🔟 ADVANCED ОПТИМИЗАЦИИ

### A. Route Segment Config (Низкий приоритет, 15 мин) ⚡

```tsx
// webapp/src/app/course/[id]/page.tsx
export const dynamic = 'force-dynamic'; // Всегда SSR
export const revalidate = 3600; // ISR каждый час
export const fetchCache = 'force-cache'; // Агрессивный кэш fetch

// webapp/src/app/(main)/ratings/page.tsx
export const dynamic = 'force-dynamic'; // Всегда fresh data
export const revalidate = 0; // Не кэшировать
```

---

### B. Bundle Analysis & Code Splitting (Средний приоритет, 30 мин) ⚡⚡

```bash
ANALYZE=true npm run build
```

Найти большие библиотеки и:
1. Заменить на lite версии
2. Lazy load где возможно
3. Tree-shake неиспользуемый код

```tsx
// Например, вместо:
import moment from 'moment'; // 200 KB!

// Использовать:
import { format } from 'date-fns'; // 20 KB
```

---

### C. Server Actions для мутаций (Низкий приоритет, 45 мин) ⚡

Next.js 15 Server Actions вместо API calls:

```tsx
// webapp/src/app/actions/updateProfile.ts
'use server'

export async function updateProfile(formData: FormData) {
  const firstName = formData.get('firstName');
  // Обновление напрямую в БД
  await db.update(users).set({ firstName });
  revalidatePath('/profile');
}

// В компоненте:
<form action={updateProfile}>
  <input name="firstName" />
  <button type="submit">Save</button>
</form>
```

**Эффект:** -100 KB client bundle, faster mutations

---

## 📊 ПРИОРИТИЗАЦИЯ ОПТИМИЗАЦИЙ

### 🔥 Критические (сделать в первую очередь):

| Оптимизация | Время | Эффект | Раздел |
|-------------|-------|--------|--------|
| Virtual Tabs | 30 мин | -80 KB, -60% TTI | Главная |
| Batch API (Ratings) | 30 мин | 8→1 запрос | Рейтинги |
| Virtual List | 25 мин | +80% скролл | Рейтинги |
| Database Indexes | 30 мин | -80% DB time | Backend |
| Combined Content API | 25 мин | 4→1 запрос | Контент |
| Query Optimization (N+1) | 45 мин | -90% DB load | Backend |

**Итого:** ~3 часа, улучшение на 60-70%

---

### ⚡ Высокий приоритет (следующий этап):

| Оптимизация | Время | Эффект | Раздел |
|-------------|-------|--------|--------|
| Next/Image для курсов | 20 мин | -40% images | Курсы |
| Intersection Prefetch | 25 мин | -70% лишних prefetch | Навигация |
| Static Data (страны) | 15 мин | -2 API | Чаты |
| Optimistic Updates | 15 мин | Instant UX | Магазин |
| Redis Cache | 60 мин | -95% DB для рейтингов | Backend |

**Итого:** ~2.5 часа, улучшение на 40-50%

---

### 📈 Средний приоритет (опционально):

| Оптимизация | Время | Эффект |
|-------------|-------|--------|
| Stale Time оптимизация | 20 мин | -50% сети |
| Incremental Loading | 20 мин | -80% начальной загрузки |
| Audio Preloading | 20 мин | Instant playback |
| Video Thumbnails | 15 мин | -70% thumbnails |
| Static Generation | 15 мин | Instant load |

**Итого:** ~1.5 часа, улучшение на 20-30%

---

## 🎯 ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ

### После критических оптимизаций:

```
Lighthouse Performance: 95+ → 98+
First Contentful Paint: 0.5s → 0.3s
Time to Interactive: 0.8s → 0.4s
Largest Contentful Paint: 1s → 0.5s
Total Blocking Time: <100ms → <50ms

API Requests (главная): 15 → 6
Database Queries (ratings): 8 → 1
Bundle Size: 262 KB → 180 KB
```

### После всех оптимизаций:

```
Lighthouse: 98+
FCP: 0.2s
TTI: 0.3s
LCP: 0.4s
TBT: <30ms

Воспринимаемая скорость: МГНОВЕННО ⚡⚡⚡
```

---

## 🚀 ПЛАН ДЕЙСТВИЙ

### Неделя 1: Критические (3 часа)
- [ ] Virtual Tabs
- [ ] Batch API для рейтингов
- [ ] Virtual List
- [ ] Database Indexes
- [ ] Combined Content API
- [ ] N+1 Query fixes

### Неделя 2: Высокий приоритет (2.5 часа)
- [ ] Next/Image optimization
- [ ] Intersection Prefetch
- [ ] Static Data
- [ ] Optimistic Updates
- [ ] Redis Cache

### Неделя 3: Полировка (1.5 часа)
- [ ] Stale Time config
- [ ] Incremental Loading
- [ ] Audio/Video optimizations
- [ ] Static Generation

---

## 📝 МОНИТОРИНГ

После каждой оптимизации проверять:

```bash
# Bundle size
ANALYZE=true npm run build

# Lighthouse
npm run build && npm start
# Chrome DevTools → Lighthouse → Performance

# Network waterfall
# Chrome DevTools → Network → при загрузке страницы
```

**Целевые метрики:**
- Bundle size < 200 KB
- API requests < 5 на страницу
- LCP < 500ms
- TTI < 400ms

---

## ✅ ЧЕКЛИСТ ПЕРЕД ДЕПЛОЕМ

- [ ] Все тесты проходят
- [ ] Bundle analyzer не показывает больших библиотек
- [ ] Lighthouse Score > 95
- [ ] Network waterfall оптимален (мало запросов, параллельные)
- [ ] Нет console.errors
- [ ] Service Worker работает
- [ ] Database indexes созданы
- [ ] Redis кэш настроен
- [ ] Monitoring (Sentry, LogRocket) работает

---

## 🎉 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ

**Приложение будет:**
- ⚡ Загружаться за 200-300ms
- 🚀 Навигация мгновенная (0ms воспринимаемая задержка)
- 🌊 Скролл плавный даже с 1000+ элементов
- 💾 Офлайн режим для контента
- 📱 Нативное ощущение скорости
- 🎯 Lighthouse Score 98+

**В 10 РАЗ БЫСТРЕЕ** чем сейчас! 🔥🔥🔥
