/**
 * Cómo se instala la app según el navegador:
 * - `samsung`: Samsung Internet. Se pide abrir la página en Chrome.
 * - `ios`: iPhone o iPad. No hay botón de instalar: se explica cómo agregarla a inicio.
 * - `android`: Chrome y similares. El navegador ofrece su diálogo de instalación.
 * - `other`: computadora u otro caso; no se muestra nada.
 */
export type InstallPlatform = 'samsung' | 'ios' | 'android' | 'other';

export function detectInstallPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (/SamsungBrowser/i.test(userAgent)) return 'samsung';
  // El iPad con iPadOS 13 o más nuevo se presenta como una Mac, pero tiene pantalla táctil.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

/** Dirección `intent:` que abre la misma página en Chrome (o en la Play Store si no está instalado). */
export function chromeIntentUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  const fallback = encodeURIComponent(url.href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}
