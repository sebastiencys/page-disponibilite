import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarOff,
  Clock,
  Mail,
  CheckCircle,
  XCircle,
  Coffee,
  Moon,
  Lock,
  CalendarCheck,
  Copy,
  Check,
  FileCode,
  Link2,
  UserPlus,
} from 'lucide-react';
import {
  getZonedDateParts,
  getEffectiveLunchBreak,
  getUpcomingClosures,
  formatTimeShort,
  type AvailabilityResult,
  type ScheduleConfig,
  type DayOfWeek,
  type AnonymizedSlot,
  type CalendarSummaryItem,
} from '../lib/availability.ts';
import { formatTodayAppointmentsLabel } from '../lib/badgeSvg.ts';
import { copyTextToClipboard } from '../lib/clipboard.ts';
import { buildPublicVCard } from '../lib/vcard.ts';

interface PublicStatusPageProps {
  profile: {
    name: string;
    role: string;
    company: string;
    email: string;
    bookingUrl: string;
  };
  availability: AvailabilityResult;
  schedule: ScheduleConfig;
  timezone?: string;
  upcomingSlots?: AnonymizedSlot[];
  calendars?: CalendarSummaryItem[];
  onGoToStudio?: () => void;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  0: 'Dimanche',
};

export const PublicStatusPage: React.FC<PublicStatusPageProps> = ({
  profile,
  availability,
  schedule,
  timezone = schedule.timezone || 'Europe/Paris',
  upcomingSlots = [],
  calendars = [],
  onGoToStudio,
}) => {
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const todayRdvLabel = formatTodayAppointmentsLabel(
    availability.todayAppointmentsCount ?? 0,
    availability.todayAllDayAppointmentsCount ?? 0
  );

  const upcomingClosures = useMemo(
    () => getUpcomingClosures(new Date(), schedule, timezone, 30),
    [schedule, timezone]
  );

  const handleCopyStatus = async () => {
    const parts = [`${profile.name} — ${availability.title} (${availability.subtitle})`];
    if (todayRdvLabel) {
      parts.push(todayRdvLabel);
    }
    await copyTextToClipboard(parts.join(' • '));
    setCopiedStatus(true);
    setTimeout(() => setCopiedStatus(false), 2000);
  };

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    const publicUrl = `${window.location.origin}/?view=public`;
    await copyTextToClipboard(publicUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadVCard = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const publicUrl = `${window.location.origin}/?view=public`;
    const vcardContent = buildPublicVCard(profile, publicUrl);
    const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const rawSlug = (profile.name || 'contact')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${rawSlug || 'contact'}.vcf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const getStatusIcon = () => {
    if (availability.status === 'HOLIDAY') {
      return <CalendarOff className="w-8 h-8 text-slate-300" />;
    }
    switch (availability.state) {
      case 'available':
        return <CheckCircle className="w-8 h-8 text-emerald-500" />;
      case 'busy':
        return <XCircle className="w-8 h-8 text-red-500" />;
      case 'away':
        return <Coffee className="w-8 h-8 text-amber-500" />;
      default:
        return <Moon className="w-8 h-8 text-slate-400" />;
    }
  };

  // Group slots by day for clear and structured reading
  const groupedSlots = useMemo(() => {
    if (!upcomingSlots || upcomingSlots.length === 0) return [];

    const nowZoned = getZonedDateParts(new Date(), timezone);
    const groups: {
      dateKey: string;
      dayLabel: string;
      slots: { startStr: string; endStr: string; durationStr: string; calendarLabel?: string }[];
    }[] = [];

    for (const slot of upcomingSlots) {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const startParts = getZonedDateParts(start, timezone);
      const dateKey = `${startParts.year}-${startParts.month}-${startParts.day}`;

      const dayStr = String(startParts.day).padStart(2, '0');
      const monthStr = String(startParts.month).padStart(2, '0');
      let dayLabel = `${DAY_LABELS[startParts.dayOfWeek]} ${dayStr}/${monthStr}`;
      if (
        startParts.year === nowZoned.year &&
        startParts.month === nowZoned.month &&
        startParts.day === nowZoned.day
      ) {
        dayLabel = "Aujourd'hui";
      } else {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const tomorrowParts = getZonedDateParts(tomorrow, timezone);
        if (
          startParts.year === tomorrowParts.year &&
          startParts.month === tomorrowParts.month &&
          startParts.day === tomorrowParts.day
        ) {
          dayLabel = `Demain (${DAY_LABELS[startParts.dayOfWeek]})`;
        }
      }

      const startStr = formatTimeShort(start, timezone);
      const endStr = formatTimeShort(end, timezone);
      const diffMins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      const durationStr = hours > 0 ? (mins > 0 ? `${hours}h${String(mins).padStart(2, '0')}` : `${hours}h`) : `${mins} min`;

      let group = groups.find(g => g.dateKey === dateKey);
      if (!group) {
        group = { dateKey, dayLabel, slots: [] };
        groups.push(group);
      }
      group.slots.push({
        startStr,
        endStr,
        durationStr,
        calendarLabel: slot.calendarLabel,
      });
    }

    return groups;
  }, [upcomingSlots, timezone]);

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      {/* Hero Live Status Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 sm:p-10 shadow-lg dark:shadow-none text-center relative overflow-hidden">
        {/* Subtle background glow */}
        <div
          className="absolute inset-0 opacity-10 dark:opacity-15 pointer-events-none blur-3xl"
          style={{ backgroundColor: availability.badgeColor }}
        />

        {/* Big Animated Status Indicator */}
        <div className="inline-flex items-center justify-center mb-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center relative shadow-inner"
            style={{ backgroundColor: `${availability.badgeColor}15` }}
          >
            <span
              className="absolute w-20 h-20 rounded-full animate-ping opacity-30"
              style={{ backgroundColor: availability.dotColor }}
            />
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center shadow-md text-white font-bold"
              style={{ backgroundColor: availability.dotColor }}
            >
              {getStatusIcon()}
            </span>
          </div>
        </div>

        {/* User Identity */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
          {profile.name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
          {profile.role} {profile.company && `• ${profile.company}`}
        </p>

        {/* Large Status Badge Pill */}
        <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2.5 px-5 py-2.5 rounded-full border shadow-xs"
          style={{
            borderColor: `${availability.badgeColor}40`,
            backgroundColor: `${availability.badgeColor}14`,
          }}
        >
          <span
            className="w-3 h-3 rounded-full animate-pulse"
            style={{ backgroundColor: availability.dotColor }}
          />
          <span className="text-base font-bold" style={{ color: availability.badgeColor }}>
            {availability.title}
          </span>
          <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">
            • {availability.subtitle}
          </span>
        </div>

        {/* Today's RDV summary & multi-calendar breakdown */}
        {(todayRdvLabel || calendars.length > 1) && (
          <div className="mt-4 flex flex-col items-center gap-2">
            {todayRdvLabel && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/70 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                <CalendarCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{todayRdvLabel}</span>
              </div>
            )}

            {calendars.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {calendars.map(cal => (
                  <span
                    key={cal.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium border ${
                      cal.isBusyNow
                        ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        cal.isBusyNow ? 'bg-red-500' : 'bg-emerald-500'
                      }`}
                    />
                    <span>{cal.label}</span>
                    <span className="text-slate-400 dark:text-slate-500">•</span>
                    <span className="font-semibold">
                      {cal.isBusyNow
                        ? 'Occupé'
                        : cal.todayAppointmentsCount > 0
                        ? `${cal.todayAppointmentsCount} RDV`
                        : 'Libre'}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
          {profile.bookingUrl && (
            <a
              href={profile.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-100 dark:shadow-none flex items-center justify-center gap-2 transition-all"
            >
              <Calendar className="w-4 h-4" />
              Réserver un créneau dans l'agenda
            </a>
          )}

          {profile.email && (
            <a
              href={`mailto:${profile.email}`}
              className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Mail className="w-4 h-4" />
              Envoyer un e-mail
            </a>
          )}

          <button
            type="button"
            onClick={handleCopyStatus}
            className="w-full sm:w-auto px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
            title="Copier le statut actuel en texte"
          >
            {copiedStatus ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Statut copié !</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Copier mon statut</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full sm:w-auto px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
            title="Copier le lien de cette page publique"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Lien copié !</span>
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Copier le lien</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadVCard}
            className="w-full sm:w-auto px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
            title="Télécharger la fiche contact (.vcf) pour votre carnet d'adresses"
          >
            <UserPlus className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <span>Ajouter aux contacts</span>
          </button>
        </div>
      </div>

      {/* Upcoming Busy Slots Section (Privacy-Safe) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Prochains créneaux occupés
            </h2>
          </div>
        </div>

        {groupedSlots.length > 0 ? (
          <div className="space-y-4 pt-1">
            {groupedSlots.map(group => (
              <div key={group.dateKey} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <span>{group.dayLabel}</span>
                  <span className="h-px bg-slate-100 dark:bg-slate-800 flex-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {group.slots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-2xs" />
                        <div>
                          <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-100">
                            {slot.startStr} - {slot.endStr}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>Créneau réservé</span>
                            {slot.calendarLabel && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70 font-semibold text-[10px]">
                                {slot.calendarLabel}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                        {slot.durationStr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 px-4 text-center rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p className="font-semibold text-slate-700 dark:text-slate-200">Aucun créneau occupé prévu prochainement</p>
            <p className="text-slate-400 dark:text-slate-500">Les créneaux de travail habituels sont entièrement disponibles.</p>
          </div>
        )}
      </div>

      {/* Working Hours Weekly Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Horaires habituels de travail
          </h2>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md w-fit">
            Fuseau : {timezone}
          </span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
          {([1, 2, 3, 4, 5, 6, 0] as DayOfWeek[]).map(day => {
            const conf = schedule.days[day];
            const zonedNow = getZonedDateParts(new Date(), timezone);
            const isToday = zonedNow.dayOfWeek === day;

            return (
              <div
                key={day}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
                  isToday
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/50 font-semibold text-indigo-950 dark:text-indigo-100'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{DAY_LABELS[day]}</span>
                  {isToday && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                      Aujourd'hui
                    </span>
                  )}
                </div>
                <div>
                  {conf.enabled ? (
                    <span className={`font-mono ${isToday ? 'text-indigo-950 dark:text-indigo-200' : 'text-slate-600 dark:text-slate-300'}`}>
                      {conf.start.replace(':', 'h')} - {conf.end.replace(':', 'h')}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 italic">Fermé / Repos</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {(() => {
          const customDays = ([1, 2, 3, 4, 5, 6, 0] as DayOfWeek[])
            .map(d => {
              const eff = getEffectiveLunchBreak(schedule, d);
              return schedule.days[d]?.enabled && eff.isCustomForDay ? { day: d, eff } : null;
            })
            .filter(Boolean) as { day: DayOfWeek; eff: ReturnType<typeof getEffectiveLunchBreak> }[];

          if (!schedule.lunchBreak.enabled && customDays.length === 0) return null;

          return (
            <div className="pt-2 text-xs text-slate-500 dark:text-slate-400 space-y-1 border-t border-slate-100 dark:border-slate-800">
              {schedule.lunchBreak.enabled && (
                <div className="flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>
                    {schedule.lunchBreak.label} :{' '}
                    <strong className="font-medium text-slate-700 dark:text-slate-200">
                      {schedule.lunchBreak.start.replace(':', 'h')} - {schedule.lunchBreak.end.replace(':', 'h')}
                    </strong>
                  </span>
                </div>
              )}
              {customDays.length > 0 && (
                <div className="pl-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {customDays.map(({ day, eff }) => (
                    <span key={day}>
                      {DAY_LABELS[day]} :{' '}
                      <strong className="font-medium text-slate-700 dark:text-slate-200">
                        {eff.enabled ? `${eff.start.replace(':', 'h')} - ${eff.end.replace(':', 'h')}` : 'Aucune'}
                      </strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {upcomingClosures.length > 0 && (
          <div className="pt-2 text-xs text-slate-500 dark:text-slate-400 space-y-1.5 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-medium text-violet-700 dark:text-violet-300">
              <CalendarOff className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
              <span>Prochaines fermetures / congés (30 j) :</span>
            </div>
            <div className="pl-5 flex flex-wrap gap-2">
              {upcomingClosures.map((closure, idx) => {
                const fmt = (dStr: string) => {
                  const [, m, d] = dStr.split('-');
                  return `${d}/${m}`;
                };
                const range =
                  closure.endDate !== closure.startDate
                    ? `${fmt(closure.startDate)} → ${fmt(closure.endDate)}`
                    : fmt(closure.startDate);
                return (
                  <span
                    key={`${closure.startDate}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/50 border border-violet-200/80 dark:border-violet-800/60 text-[11px] text-violet-900 dark:text-violet-200"
                  >
                    <strong className="font-mono">{range}</strong>
                    <span>{closure.label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Discreet owner access & JSON API footer */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
        <a
          href="/api/badge.json"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 font-medium transition-colors"
          title="Ouvrir le statut anonymisé au format JSON"
        >
          <FileCode className="w-3 h-3" />
          <span>Flux JSON</span>
        </a>
        {onGoToStudio && (
          <>
            <span className="text-slate-300 dark:text-slate-700 text-[11px]">•</span>
            <button
              onClick={onGoToStudio}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 font-medium transition-colors cursor-pointer"
              title="Accès protégé au Studio"
            >
              <Lock className="w-3 h-3" />
              <span>Accès Paramètres</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
