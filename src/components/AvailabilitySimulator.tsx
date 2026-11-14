import React, { useState, useMemo } from 'react';
import {
  Clock,
  Calendar as CalendarIcon,
  RotateCcw,
  Sun,
  Moon,
  Sparkles,
  Info,
  Sliders,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Briefcase,
  Coffee,
  MoonStar,
  CalendarCheck2,
  CalendarDays,
  ArrowRight,
} from 'lucide-react';
import {
  calculateAvailability,
  createDateInTimezone,
  getZonedDateParts,
  formatTimeShort,
  type ScheduleConfig,
  type UserProfile,
  type AvailabilityResult,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
} from '../lib/availability.ts';
import {
  renderBadgeSvg,
  type BadgeStyle,
  type BadgeTheme,
} from '../lib/badgeSvg.ts';

interface AvailabilitySimulatorProps {
  schedule?: ScheduleConfig;
  profile?: UserProfile;
  timezone?: string;
  appBaseUrl: string;
  onGoToStudio?: () => void;
}

export const AvailabilitySimulator: React.FC<AvailabilitySimulatorProps> = ({
  schedule = DEFAULT_SCHEDULE,
  profile = DEFAULT_PROFILE,
  timezone = schedule.timezone || 'Europe/Paris',
  appBaseUrl,
  onGoToStudio,
}) => {
  // Initialize with current zoned date & time
  const nowParts = useMemo(() => getZonedDateParts(new Date(), timezone), [timezone]);

  const initialDateStr = useMemo(() => {
    const y = nowParts.year;
    const m = String(nowParts.month).padStart(2, '0');
    const d = String(nowParts.day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [nowParts]);

  const initialTimeStr = useMemo(() => {
    const h = String(nowParts.hour).padStart(2, '0');
    const min = String(nowParts.minute).padStart(2, '0');
    return `${h}:${min}`;
  }, [nowParts]);

  const [dateStr, setDateStr] = useState<string>(initialDateStr);
  const [timeStr, setTimeStr] = useState<string>(initialTimeStr);
  const [theme, setTheme] = useState<BadgeTheme>('light');
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null);

  // Minutes from 00:00 for the 24h interactive slider
  const sliderMinutes = useMemo(() => {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }, [timeStr]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const totalMinutes = parseInt(e.target.value, 10);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    setTimeStr(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  // Build target simulated Date
  const simulatedDate = useMemo(() => {
    return createDateInTimezone(dateStr, timeStr, timezone);
  }, [dateStr, timeStr, timezone]);

  // Compute availability for this simulated wall-clock time
  const simulatedAvailability = useMemo<AvailabilityResult>(() => {
    return calculateAvailability(simulatedDate, schedule, [], { type: 'auto' }, timezone);
  }, [simulatedDate, schedule, timezone]);

  // Simulation day analysis info
  const simulatedParts = useMemo(() => {
    return getZonedDateParts(simulatedDate, timezone);
  }, [simulatedDate, timezone]);

  const daySchedule = schedule.days[simulatedParts.dayOfWeek];
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const currentDayName = dayNames[simulatedParts.dayOfWeek];

  // Quick preset shortcuts
  const applyPreset = (presetType: 'morning' | 'lunch' | 'afternoon' | 'evening' | 'weekend' | 'now') => {
    if (presetType === 'now') {
      const parts = getZonedDateParts(new Date(), timezone);
      const y = parts.year;
      const m = String(parts.month).padStart(2, '0');
      const d = String(parts.day).padStart(2, '0');
      const h = String(parts.hour).padStart(2, '0');
      const min = String(parts.minute).padStart(2, '0');
      setDateStr(`${y}-${m}-${d}`);
      setTimeStr(`${h}:${min}`);
      return;
    }

    if (presetType === 'weekend') {
      // Find upcoming Saturday
      const d = new Date();
      const currentDay = d.getDay();
      const daysUntilSaturday = (6 - currentDay + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilSaturday);
      const parts = getZonedDateParts(d, timezone);
      const y = parts.year;
      const m = String(parts.month).padStart(2, '0');
      const day = String(parts.day).padStart(2, '0');
      setDateStr(`${y}-${m}-${day}`);
      setTimeStr('14:30');
      return;
    }

    // For weekday presets: if current simulated day is weekend, shift to Monday
    if (simulatedParts.dayOfWeek === 0 || simulatedParts.dayOfWeek === 6) {
      const d = new Date(simulatedDate);
      const currentDay = d.getDay();
      const daysUntilMonday = ((1 - currentDay + 7) % 7) || 1;
      d.setDate(d.getDate() + daysUntilMonday);
      const parts = getZonedDateParts(d, timezone);
      const y = parts.year;
      const m = String(parts.month).padStart(2, '0');
      const day = String(parts.day).padStart(2, '0');
      setDateStr(`${y}-${m}-${day}`);
    }

    if (presetType === 'morning') {
      setTimeStr('10:00');
    } else if (presetType === 'lunch') {
      setTimeStr('12:45');
    } else if (presetType === 'afternoon') {
      setTimeStr('15:30');
    } else if (presetType === 'evening') {
      setTimeStr('20:30');
    }
  };

  // SVGs for the 4 variants
  const badges = useMemo(() => {
    const opts = {
      theme,
      name: profile.name || DEFAULT_PROFILE.name,
      role: profile.role || DEFAULT_PROFILE.role,
      company: profile.company || DEFAULT_PROFILE.company,
    };

    const pillSvg = renderBadgeSvg(simulatedAvailability, { ...opts, style: 'pill' });
    const signatureSvg = renderBadgeSvg(simulatedAvailability, { ...opts, style: 'signature' });
    const cardSvg = renderBadgeSvg(simulatedAvailability, { ...opts, style: 'card' });
    const dotSvg = renderBadgeSvg(simulatedAvailability, { ...opts, style: 'dot' });

    return [
      {
        id: 'pill' as BadgeStyle,
        title: '1. Pill Moderne',
        badgeType: 'Capsule 2 Lignes',
        dimensions: '400 × 54 px',
        description: 'Format capsule fluide affichant le statut en gras au-dessus et les détails horaires au-dessous.',
        svg: pillSvg,
      },
      {
        id: 'signature' as BadgeStyle,
        title: '2. Signature Complète',
        badgeType: 'Bannière Tout-en-un',
        dimensions: '480 × 114 px',
        description: 'Bannière complète intégrant avatar avec initiales, coordonnées professionnelles et cartouche de statut.',
        svg: signatureSvg,
      },
      {
        id: 'card' as BadgeStyle,
        title: '3. Carte Compacte',
        badgeType: 'Widget Encadré',
        dimensions: '380 × 100 px',
        description: 'Widget encadré élégant avec en-tête et conteneur de statut bicolore multiligne.',
        svg: cardSvg,
      },
      {
        id: 'dot' as BadgeStyle,
        title: '4. Point Minimaliste',
        badgeType: 'Pastille Discrète',
        dimensions: '36 × 36 px',
        description: 'Point indicateur d\'activité pulsant, ultra compact pour être placé à côté de vos coordonnées existantes.',
        svg: dotSvg,
      },
    ];
  }, [simulatedAvailability, theme, profile]);

  const handleCopySvg = (styleId: string, svg: string) => {
    navigator.clipboard.writeText(svg);
    setCopiedStyle(styleId);
    setTimeout(() => setCopiedStyle(null), 2000);
  };

  const getSimulatedPngUrl = (style: BadgeStyle) => {
    const iso = simulatedDate.toISOString();
    return `${appBaseUrl}/api/badge.png?style=${style}&theme=${theme}&time=${encodeURIComponent(iso)}&name=${encodeURIComponent(profile.name || DEFAULT_PROFILE.name)}&role=${encodeURIComponent(profile.role || DEFAULT_PROFILE.role)}&company=${encodeURIComponent(profile.company || DEFAULT_PROFILE.company)}`;
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
              <Sliders className="w-3.5 h-3.5 text-indigo-300" />
              <span>Simulateur & Prévisualisation Temps Réel</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Simulateur de Disponibilité
            </h1>
            <p className="text-indigo-100/90 text-sm sm:text-base leading-relaxed">
              Testez n'importe quel jour ou heure de la semaine pour observer comment vos badges réagiront automatiquement (heures de bureau, pause déjeuner, soirées, week-ends).
            </p>
          </div>

          {onGoToStudio && (
            <button
              onClick={onGoToStudio}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-indigo-50 text-indigo-900 rounded-xl font-semibold text-sm transition-all shadow-md self-start md:self-auto cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Retour au Studio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Control Panel: Date, Time & Quick Presets */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Paramètres de la simulation</h2>
              <p className="text-xs text-slate-500">
                Fuseau horaire : <span className="font-semibold text-slate-700">{timezone}</span>
              </p>
            </div>
          </div>

          {/* Theme Selector */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Clair</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Sombre</span>
            </button>
          </div>
        </div>

        {/* Inputs row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Date Picker */}
          <div className="md:col-span-4 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Date simulée</span>
            </label>
            <input
              type="date"
              value={dateStr}
              onChange={e => setDateStr(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
            />
          </div>

          {/* Time Picker */}
          <div className="md:col-span-3 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Heure simulée</span>
            </label>
            <input
              type="time"
              value={timeStr}
              onChange={e => setTimeStr(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all font-mono"
            />
          </div>

          {/* Quick Presets Buttons */}
          <div className="md:col-span-5 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Situations types (1 clic)
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('morning')}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-lg transition-colors cursor-pointer"
                title="10h00 : Matinée au bureau"
              >
                <Briefcase className="w-3 h-3 text-emerald-600" />
                <span>10h00 Travail</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('lunch')}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-lg transition-colors cursor-pointer"
                title="12h45 : Pause déjeuner"
              >
                <Coffee className="w-3 h-3 text-amber-600" />
                <span>12h45 Déjeuner</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('evening')}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-lg transition-colors cursor-pointer"
                title="20h30 : Soirée / Hors horaires"
              >
                <MoonStar className="w-3 h-3 text-slate-600" />
                <span>20h30 Soirée</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('weekend')}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-lg transition-colors cursor-pointer"
                title="Samedi 14h30 : Week-end"
              >
                <CalendarDays className="w-3 h-3 text-purple-600" />
                <span>Week-end</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('now')}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-2xs cursor-pointer"
                title="Réinitialiser à maintenant"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Maintenant</span>
              </button>
            </div>
          </div>
        </div>

        {/* 24h Interactive Slider */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>Défilement continu sur la journée :</span>
            </span>
            <span className="font-mono font-bold text-indigo-600 text-sm bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
              {timeStr}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1439"
            step="15"
            value={sliderMinutes}
            onChange={handleSliderChange}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>00h00</span>
            <span>06h00</span>
            <span>12h00</span>
            <span>18h00</span>
            <span>23h59</span>
          </div>
        </div>
      </div>

      {/* Status Diagnostic Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Résultat du calcul automatique
            </span>
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: simulatedAvailability.dotColor }}
                />
                <span
                  className="relative inline-flex rounded-full h-3.5 w-3.5"
                  style={{ backgroundColor: simulatedAvailability.dotColor }}
                />
              </span>
              <h3
                className="text-lg sm:text-xl font-bold tracking-tight"
                style={{ color: simulatedAvailability.badgeColor }}
              >
                {simulatedAvailability.title}
              </h3>
            </div>
            <p className="text-sm font-medium text-slate-600">
              Sous-titre affiché : <strong className="text-slate-800">{simulatedAvailability.subtitle}</strong>
            </p>
          </div>

          {/* Quick Context Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>{currentDayName} {simulatedParts.day}/{simulatedParts.month}/{simulatedParts.year}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{timeStr} ({timezone.split('/')[1]?.replace('_', ' ') || timezone})</span>
            </span>
          </div>
        </div>

        {/* Explain Rule Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-slate-400 block font-medium">1. Horaires du jour ({currentDayName})</span>
            <span className="font-semibold text-slate-800">
              {daySchedule?.enabled ? `${daySchedule.start} - ${daySchedule.end}` : 'Fermé (Jour non travaillé)'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-slate-400 block font-medium">2. Pause déjeuner</span>
            <span className="font-semibold text-slate-800">
              {schedule.lunchBreak?.enabled
                ? `${schedule.lunchBreak.start} - ${schedule.lunchBreak.end}`
                : 'Désactivée'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-slate-400 block font-medium">3. Heures de bureau actives ?</span>
            <span className={`font-semibold ${simulatedAvailability.isWorkTime ? 'text-emerald-600' : 'text-slate-600'}`}>
              {simulatedAvailability.isWorkTime ? '✓ Oui (Période active)' : '✗ Non (En dehors des horaires)'}
            </span>
          </div>
        </div>
      </div>

      {/* The 4 Badge Variants Presentation */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Aperçu des 4 variantes de badge prévues
            </h2>
            <p className="text-xs text-slate-500">
              Tous les rendus sont calculés en temps réel avec vos polices officielles Plus Jakarta Sans.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Thème sélectionné : <strong className="text-indigo-600 capitalize">{theme}</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {badges.map(b => {
            const pngUrl = getSimulatedPngUrl(b.id);
            const isCopied = copiedStyle === b.id;

            return (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all p-5 flex flex-col justify-between gap-4"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <span>{b.title}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-semibold">
                        {b.dimensions}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">{b.description}</p>
                  </div>
                </div>

                {/* Badge SVG Visual Preview Container */}
                <div
                  className={`p-6 rounded-xl border flex items-center justify-center min-h-[140px] transition-colors ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50/70 border-slate-200/80'
                  }`}
                >
                  <div
                    className="max-w-full overflow-hidden flex items-center justify-center drop-shadow-xs"
                    dangerouslySetInnerHTML={{ __html: b.svg }}
                  />
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-medium text-slate-400">
                    Type : {b.badgeType}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopySvg(b.id, b.svg)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                      title="Copier le code SVG de ce badge"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copié !</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copier SVG</span>
                        </>
                      )}
                    </button>

                    <a
                      href={pngUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer"
                      title="Générer et afficher le PNG simulé via l'API"
                    >
                      <span>Tester en PNG</span>
                      <ExternalLink className="w-3 h-3 text-indigo-500" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
