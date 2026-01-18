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

  // 🚀 ОПТИМИЗАЦИЯ ИМПОРТОВ
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', '@tanstack/react-query'],
    // Включить turbopack в dev для быстрой сборки (Bun уже быстрый, но это доп. ускорение)
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

  // 🚀 PRODUCTION OPTIMIZATIONS
  swcMinify: true, // Быстрая минификация через SWC

  // 🚀 ОТКЛЮЧИТЬ SOURCE MAPS В PRODUCTION
  productionBrowserSourceMaps: false,
};

export default nextConfig;
