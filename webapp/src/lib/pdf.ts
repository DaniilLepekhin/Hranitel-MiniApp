/**
 * Build the in-app PDF viewer URL.
 * Usage: router.push(getPdfViewerUrl(url, title))
 */
export function getPdfViewerUrl(pdfUrl: string, title?: string): string {
  const params = new URLSearchParams({ url: pdfUrl });
  if (title) params.set('title', title);
  return `/pdf-viewer?${params.toString()}`;
}
