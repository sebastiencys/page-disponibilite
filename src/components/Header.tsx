import React from 'react';
import { Radio, Calendar, Sparkles, HelpCircle, ArrowLeft, Clock, Sliders } from 'lucide-react';
import { type AvailabilityResult, DEFAULT_PROFILE } from '../lib/availability.ts';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  availability: AvailabilityResult;
  currentTimeStr: string;
  timezone?: string;
  profileName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  availability,
  currentTimeStr,
  timezone = 'Europe/Paris',
  profileName,
}) => {
  const isPublicView = currentTab === 'public';
  const tzCity = timezone.split('/')[1]?.replace('_', ' ') || timezone;

  const tabs = [
    { id: 'signature', label: 'Générateur de Signature', icon: Sparkles },
    { id: 'simulator', label: 'Simulateur', icon: Sliders },
    { id: 'schedule', label: 'Horaires & Agenda', icon: Calendar },
    { id: 'guide', label: 'Guide & Astuces', icon: HelpCircle },
  ];

  if (isPublicView) {
    return (
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Minimal Profile Brand */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {profileName ? profileName.charAt(0) : (DEFAULT_PROFILE.name?.charAt(0) || 'A')}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 text-sm sm:text-base tracking-tight">
                    {profileName || DEFAULT_PROFILE.name}
                  </span>
                  <span className="hidden sm:inline px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                    En direct
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Local time, Live Status pill & discreet Studio link */}
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono font-medium text-slate-700">{currentTimeStr}</span>
                <span className="text-[10px] text-slate-400">({tzCity})</span>
              </div>

              {/* Status pill */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xs"
                style={{
                  borderColor: `${availability.badgeColor}40`,
                  backgroundColor: `${availability.badgeColor}10`,
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

              {/* Studio configuration link */}
              <button
                onClick={() => onSelectTab('signature')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg transition-all cursor-pointer"
                title="Accéder au générateur de signature et aux réglages"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden md:inline">Studio de signature</span>
              </button>
            </div>
          </div>
        </div>
      </header>
    );
  }

  // Owner Studio / Settings View Header
  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white shadow-xs">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-900 tracking-tight">DispoLive</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                  Studio
                </span>
              </div>
            </div>
          </div>

          {/* Right: Time, Status & Return to Public Page */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-slate-400">Heure ({tzCity}) :</span>
              <span className="font-mono font-medium text-slate-700">{currentTimeStr}</span>
            </div>

            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xs"
              style={{
                borderColor: `${availability.badgeColor}40`,
                backgroundColor: `${availability.badgeColor}10`,
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

            <button
              onClick={() => onSelectTab('public')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-indigo-600 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voir ma page publique</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs for Owner */}
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-2 -mb-px scrollbar-none border-t border-slate-100">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
