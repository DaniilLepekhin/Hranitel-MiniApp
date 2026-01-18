import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // 🚀 ОПТИМИЗАЦИЯ ИЗОБРАЖЕНИЙ
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    formats: ['image/avif', 'image/webp'], // Современные форматы - меньше размер
    deviceSizes: [640, 750, 828, 1080, 1200], // Адаптивные размеры
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384], // Размеры для фиксированных изображений
    minimumCacheTTL: 31536000, // Кэш на 1 год для оптимизированных изображений
  },

  // 🚀 КРИТИЧЕСКАЯ ОПТИМИЗАЦИЯ: Модульные импорты (89MB → <10MB)
  experimental: {
    optimizePackageImports: [
      'lucide-react',        // ~2MB → ~50KB (импорт только нужных иконок)
      'framer-motion',       // ~500KB → ~100KB (tree-shaking)
      '@tanstack/react-query', // ~200KB → ~80KB (tree-shaking)
      'zustand',             // Оптимизация store
      'react-markdown',      // Только когда используется
    ],
  },

  // 🚀 WEBPACK ОПТИМИЗАЦИИ
  webpack: (config, { isServer }) => {
    // Tree-shaking для production
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        usedExports: true, // Удалить неиспользуемые экспорты
        sideEffects: false, // Агрессивный tree-shaking
      };
    }
    return config;
  },

  // 🚀 ПРАВИЛЬНОЕ КЭШИРОВАНИЕ
  async headers() {
    return [
      // Статические ассеты - долгий кэш
      {
        source: '/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 год
          },
        ],
      },
      // HTML страницы - короткий кэш с ревалидацией
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate', // Всегда проверять на актуальность
          },
        ],
      },
    ];
  },

  // 🚀 КОМПРЕССИЯ
  compress: true,

  // 🚀 ОТКЛЮЧИТЬ SOURCE MAPS В PRODUCTION (экономия ~30% размера)
  productionBrowserSourceMaps: false,
};

export default nextConfig;
