const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    // 🚀 ОПТИМИЗАЦИЯ: Минимизация и оптимизация CSS в production
    ...(process.env.NODE_ENV === 'production' && {
      cssnano: {
        preset: [
          'default',
          {
            discardComments: { removeAll: true },
            normalizeWhitespace: true,
            colormin: true,
            minifyFontValues: true,
            minifyGradients: true,
            normalizeUrl: true,
          },
        ],
      },
    }),
  },
};

export default config;
