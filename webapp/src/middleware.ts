import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 🚀 PERFORMANCE: Add security and performance headers
  const headers = response.headers;

  // Enable compression hint for CDN/proxy
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Performance hints
  headers.set('X-DNS-Prefetch-Control', 'on');

  // Suggest compression (для прокси серверов)
  if (!headers.has('Content-Encoding')) {
    headers.set('Vary', 'Accept-Encoding');
  }

  return response;
}

// Apply to all routes except static assets
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public files (sw.js, manifest.json, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|assets).*)',
  ],
};
