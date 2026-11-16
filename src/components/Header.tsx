import React from 'react';
import { Radio, Calendar, Sparkles, HelpCircle, ArrowLeft, Clock, Sliders, Lock, Sun, Moon } from 'lucide-react';
import { type AvailabilityResult, DEFAULT_PROFILE } from '../lib/availability.ts';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  availability: AvailabilityResult;
  currentTimeStr: string;
  timezone?: string;
  profileName?: string;
  studioLocked?: boolean;
  passwordRequired?: boolean;
  onLockStudio?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  availability,
  currentTimeStr,
  timezone = 'Europe/Paris',
  profileName,
  studioLocked = false,
  passwordRequired = false,
  onLockStudio,
  isDark = false,
  onToggleTheme,
}) => {
  const isPublicOrLocked = currentTab === 'public' || studioLocked;
  const tzCity = timezone.split('/')[1]?.replace('_', ' ') || timezone;

  const tabs = [
    { id: 'signature', label: 'Générateur de Signature', icon: Sparkles },
    { id: 'simulator', label: 'Simulateur', icon: Sliders },
    { id: 'schedule', label: 'Horaires & Agenda', icon: Calendar },
    { id: 'guide', label: 'Guide & Astuces', icon: HelpCircle },
  ];

  const renderThemeToggle = () => {
    if (!onToggleTheme) return null;
    return (
      <button
        type="button"
        onClick={onToggleTheme}
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shrink-0"
        aria-label={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
        title={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      >
        {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
      </button>
    );
  };

  if (isPublicOrLocked) {
    return (
      <header className="border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md sticky top-0 z-40 shadow-xs transition-colors">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Minimal Profile Brand */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-slate-900 dark:from-indigo-500 dark:to-indigo-900 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                {profileName ? profileName.charAt(0) : (DEFAULT_PROFILE.name?.charAt(0) || 'A')}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base tracking-tight truncate">
                    {profileName || DEFAULT_PROFILE.name}
                  </span>
                  <span className="hidden sm:inline px-2 py-0.5 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70 rounded-full shrink-0">
                    En direct
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Local time, Live Status pill, Theme switch & Studio shortcut ONLY if already unlocked */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-200">{currentTimeStr}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">({tzCity})</span>
              </div>

              {/* Status pill */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xs whitespace-nowrap"
                style={{
                  borderColor: `${availability.badgeColor}40`,
                  backgroundColor: `${availability.badgeColor}15`,
                }}
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: availability.dotColor }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2.5 w-2.5"
                    style={{ backgroundColor: availability.dotColor }}
                  />
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: availability.badgeColor }}
                >
                  {availability.title}
                </span>
              </div>

              {renderThemeToggle()}

              {/* Only show Studio shortcut in public header if already authenticated */}
              {!studioLocked && currentTab === 'public' && (
                <button
                  onClick={() => onSelectTab('signature')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0"
                  title="Accéder au générateur de signature et aux réglages"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span className="hidden md:inline">Studio de signature</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
    );
  }

  // Owner Studio / Settings View Header
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md sticky top-0 z-40 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white shadow-xs">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight">DispoLive</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/70 rounded-full">
                  Studio
                </span>
              </div>
            </div>
          </div>

          {/* Right: Time, Status, Theme switch & Return to Public Page */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-slate-400 dark:text-slate-500">Heure ({tzCity}) :</span>
              <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-200">{currentTimeStr}</span>
            </div>

            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xs whitespace-nowrap"
              style={{
                borderColor: `${availability.badgeColor}40`,
                backgroundColor: `${availability.badgeColor}15`,
              }}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: availability.dotColor }}
                />
                <span
                  className="relative inline-flex rounded-full h-2.5 w-2.5"
                  style={{ backgroundColor: availability.dotColor }}
                />
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: availability.badgeColor }}
              >
                {availability.title}
              </span>
            </div>

            {renderThemeToggle()}

            <button
              onClick={() => onSelectTab('public')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voir ma page publique</span>
            </button>

            {passwordRequired && onLockStudio && (
              <button
                onClick={onLockStudio}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/50 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Verrouiller le Studio et fermer la session"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Verrouiller</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs for Owner */}
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-2 -mb-px scrollbar-none border-t border-slate-100 dark:border-slate-800">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
