import { chromeIntentUrl, detectInstallPlatform } from './installPlatform';

/** Evento de Chrome que permite abrir el diálogo de instalación (no está en lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    /** Lo guarda el script del <head> de index.html. */
    installPromptEvent?: BeforeInstallPromptEvent;
  }
}

interface InstallBannerElements {
  banner: HTMLElement;
  text: HTMLElement;
  action: HTMLButtonElement;
  close: HTMLButtonElement;
  iosDialog: HTMLDialogElement;
}

const DISMISSED_KEY = 'install-banner-dismissed-at';
const DISMISS_DAYS = 14;

function isInstalled(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Sin almacenamiento (modo privado): el banner vuelve a aparecer la próxima vez.
  }
}

/**
 * Banner para instalar la app en el teléfono:
 * Android abre el diálogo del navegador, iPhone explica los pasos y Samsung Internet pide usar Chrome.
 */
export function setupInstallBanner(ui: InstallBannerElements) {
  if (isInstalled() || recentlyDismissed()) return;

  let onAction = () => {};
  const show = (text: string, actionLabel: string, action: () => void) => {
    ui.text.textContent = text;
    ui.action.textContent = actionLabel;
    onAction = action;
    ui.banner.hidden = false;
  };
  const hide = () => {
    ui.banner.hidden = true;
  };

  ui.action.addEventListener('click', () => onAction());
  ui.close.addEventListener('click', () => {
    rememberDismissed();
    hide();
  });
  window.addEventListener('appinstalled', hide);

  ui.iosDialog.querySelector('[data-close]')?.addEventListener('click', () => ui.iosDialog.close());
  // Tocar fuera del recuadro también lo cierra.
  ui.iosDialog.addEventListener('click', (event) => {
    if (event.target === ui.iosDialog) ui.iosDialog.close();
  });

  switch (detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints)) {
    case 'samsung':
      show(
        'Samsung Internet puede dar problemas con esta app. Para usarla e instalarla, abrila en Chrome.',
        'Abrir en Chrome',
        () => {
          window.location.href = chromeIntentUrl(window.location.href);
        },
      );
      break;

    case 'ios':
      show('Instalá Sound 2 Sheet en la pantalla de inicio para abrirla como una app, también sin internet.', 'Ver cómo', () =>
        ui.iosDialog.showModal(),
      );
      break;

    case 'android': {
      // El navegador solo deja abrir su diálogo después de un toque, así que el evento lo guarda
      // un script en index.html y acá se ofrece el botón. Si nunca llega (ya instalada, otro
      // navegador), no se muestra nada.
      const offer = () => {
        const prompt = window.installPromptEvent;
        if (!prompt) return;
        show('Instalá Sound 2 Sheet para abrirla como una app, también sin internet.', 'Instalar', () => {
          hide();
          window.installPromptEvent = undefined;
          void prompt.prompt();
          void prompt.userChoice.then(({ outcome }) => {
            if (outcome === 'dismissed') rememberDismissed();
          });
        });
      };
      offer();
      window.addEventListener('installpromptready', offer);
      break;
    }

    case 'other':
      break;
  }
}
