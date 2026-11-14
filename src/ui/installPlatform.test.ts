import { describe, expect, it } from 'vitest';
import { chromeIntentUrl, detectInstallPlatform } from './installPlatform';

const UA = {
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  chromeOnSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('detectInstallPlatform', () => {
  it('reconoce Samsung Internet', () => {
    expect(detectInstallPlatform(UA.samsungInternet, 5)).toBe('samsung');
  });

  it('un Samsung con Chrome es un Android más', () => {
    expect(detectInstallPlatform(UA.chromeOnSamsung, 5)).toBe('android');
    expect(detectInstallPlatform(UA.chromeAndroid, 5)).toBe('android');
  });

  it('reconoce el iPhone en Safari y en Chrome', () => {
    expect(detectInstallPlatform(UA.safariIphone, 5)).toBe('ios');
    expect(detectInstallPlatform(UA.chromeIphone, 5)).toBe('ios');
  });

  it('distingue el iPad (se presenta como Mac) de una Mac', () => {
    expect(detectInstallPlatform(UA.safariMac, 5)).toBe('ios');
    expect(detectInstallPlatform(UA.safariMac, 0)).toBe('other');
  });

  it('en la computadora no muestra nada', () => {
    expect(detectInstallPlatform(UA.chromeWindows, 0)).toBe('other');
  });
});

describe('chromeIntentUrl', () => {
  it('abre la misma dirección en Chrome, con la página como alternativa', () => {
    expect(chromeIntentUrl('https://sound-2-sheet.pages.dev/?a=1')).toBe(
      'intent://sound-2-sheet.pages.dev/?a=1#Intent;scheme=https;package=com.android.chrome;' +
        'S.browser_fallback_url=https%3A%2F%2Fsound-2-sheet.pages.dev%2F%3Fa%3D1;end',
    );
  });
});
