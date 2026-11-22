import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import type { AppLang } from '../lib/availability.ts';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  lang?: AppLang;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang = 'fr' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const isEn = lang === 'en';

  useEffect(() => {
    if (!showIOSGuide) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowIOSGuide(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showIOSGuide]);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/70 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        title={isEn ? 'Install DispoLive as an app' : "Installer DispoLive comme application"}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden lg:inline">{isEn ? 'Install' : 'Installer'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title={isEn ? 'Add to Home Screen on iOS' : "Ajouter à l'écran d'accueil sur iOS"}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">{isEn ? 'Install' : 'Installer'}</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ios-install-title"
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 id="ios-install-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {isEn ? 'Install on iPhone / iPad' : 'Installer sur iPhone / iPad'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label={isEn ? 'Close' : 'Fermer'}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  {isEn
                    ? 'Tap the Share button in Safari.'
                    : 'Appuyez sur le bouton Partager dans la barre Safari.'}
                </li>
                <li>
                  {isEn
                    ? 'Scroll down and choose "Add to Home Screen".'
                    : 'Faites défiler puis sélectionnez « Sur l’écran d’accueil ».'}
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
              >
                {isEn ? 'Close' : 'Fermer'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
