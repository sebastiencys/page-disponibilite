import React from 'react';
import { WifiOff } from 'lucide-react';
import type { AppLang } from '../lib/availability.ts';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

interface OfflineIndicatorProps {
  lang?: AppLang;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ lang = 'fr' }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  const isEn = lang === 'en';
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg border border-amber-500"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {isEn ? 'Offline — Cached status displayed' : 'Hors ligne — Dernier statut affiché'}
      </span>
    </div>
  );
};
