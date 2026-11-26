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
  QrCode,
  RefreshCw,
} from 'lucide-react';
import {
  getZonedDateParts,
  getEffectiveLunchBreak,
  getUpcomingClosures,
  formatTimeShort,
  getOffDayLabel,
  getScheduleHeadingLabel,
  sanitizeOptionalContactField,
  type AppLang,
  type ProfileMode,
  type AvailabilityResult,
  type ScheduleConfig,
  type DayOfWeek,
  type AnonymizedSlot,
  type CalendarSummaryItem,
} from '../lib/availability.ts';
import { formatTodayAppointmentsLabel } from '../lib/badgeSvg.ts';
import { copyTextToClipboard } from '../lib/clipboard.ts';
import { buildPublicVCard } from '../lib/vcard.ts';
import { QrCodeModal } from './QrCodeModal.tsx';

interface PublicStatusPageProps {
  profile: {
    name: string;
    role: string;
    company: string;
    email: string;
    bookingUrl: string;
    mode?: ProfileMode;
  };
  availability: AvailabilityResult;
  schedule: ScheduleConfig;
  timezone?: string;
  upcomingSlots?: AnonymizedSlot[];
  calendars?: CalendarSummaryItem[];
  lang?: AppLang;
  onChangeLang?: (lang: AppLang) => void;
  now?: Date;
  lastSyncedAt?: Date | null;
  onRefresh?: () => Promise<void> | void;
  onGoToStudio?: () => void;
}

const DAY_LABELS_BY_LANG: Record<AppLang, Record<DayOfWeek, string>> = {
  fr: {
    1: 'Lundi',
    2: 'Mardi',
    3: 'Mercredi',
    4: 'Jeudi',
    5: 'Vendredi',
    6: 'Samedi',
    0: 'Dimanche',
  },
  en: {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    0: 'Sunday',
  },
};

export const PublicStatusPage: React.FC<PublicStatusPageProps> = ({
  profile,
  availability,
  schedule,
  timezone = schedule.timezone || 'Europe/Paris',
  upcomingSlots = [],
  calendars = [],
  lang = 'fr',
  onChangeLang,
  now = new Date(),
  lastSyncedAt = null,
  onRefresh,
  onGoToStudio,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isEn = lang === 'en';
  const dayLabels = DAY_LABELS_BY_LANG[lang];
  const contactEmail = sanitizeOptionalContactField(profile.email);
  const bookingHref = sanitizeOptionalContactField(profile.bookingUrl);
  const hasPrimaryContactCta = Boolean(bookingHref || contactEmail);
  const offDayLabel = getOffDayLabel(profile.mode, lang);
  const scheduleHeading = getScheduleHeadingLabel(profile.mode, lang);

  const todayRdvLabel = formatTodayAppointmentsLabel(
    availability.todayAppointmentsCount ?? 0,
    availability.todayAllDayAppointmentsCount ?? 0,
    lang
  );

  const nowParts = getZonedDateParts(now, timezone);
  const nowDateKey = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`;

  const upcomingClosures = useMemo(
    () => getUpcomingClosures(now, schedule, timezone, 30, lang),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nowDateKey, schedule, timezone, lang]
  );

  const getPublicShareUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?view=public${isEn ? '&lang=en' : ''}`;
  };

  const handleCopyLink = async () => {
    const publicUrl = getPublicShareUrl();
    if (!publicUrl) return;
    await copyTextToClipboard(publicUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadVCard = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const publicUrl = getPublicShareUrl();
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

  const formatScheduleTime = (hhmm: string) =>
    isEn ? hhmm : hhmm.replace(':', 'h');

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

    const nowZoned = getZonedDateParts(now, timezone);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowParts = getZonedDateParts(tomorrow, timezone);

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
      let dayLabel = `${dayLabels[startParts.dayOfWeek]} ${dayStr}/${monthStr}`;
      if (
        startParts.year === nowZoned.year &&
        startParts.month === nowZoned.month &&
        startParts.day === nowZoned.day
      ) {
        dayLabel = isEn ? 'Today' : "Aujourd'hui";
      } else if (
        startParts.year === tomorrowParts.year &&
        startParts.month === tomorrowParts.month &&
        startParts.day === tomorrowParts.day
      ) {
        dayLabel = isEn
          ? `Tomorrow (${dayLabels[startParts.dayOfWeek]})`
          : `Demain (${dayLabels[startParts.dayOfWeek]})`;
      }

      const startStr = formatTimeShort(start, timezone, lang);
      const endStr = formatTimeShort(end, timezone, lang);
      const diffMins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      const durationStr =
        hours > 0
          ? mins > 0
            ? isEn
              ? `${hours}h ${mins}m`
              : `${hours}h${String(mins).padStart(2, '0')}`
            : `${hours}h`
          : `${mins} min`;

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
  }, [upcomingSlots, now, timezone, lang, dayLabels, isEn]);

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      {/* Hero Live Status Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 sm:p-10 shadow-lg dark:shadow-none text-center relative overflow-hidden">
        {/* Subtle background glow */}
        <div
          className="absolute inset-0 opacity-10 dark:opacity-15 pointer-events-none blur-3xl"
          style={{ backgroundColor: availability.badgeColor }}
        />

        {/* Language Segmented Control (FR / EN) */}
        {onChangeLang && (
          <div className="flex justify-end mb-2 sm:mb-0 sm:absolute sm:top-6 sm:right-6 relative z-10">
            <div
              role="group"
              aria-label={isEn ? 'Page language' : 'Langue de la page'}
              className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/90 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              {(['fr', 'en'] as AppLang[]).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChangeLang(opt)}
                  aria-pressed={lang === opt}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase transition-all cursor-pointer whitespace-nowrap ${
                    lang === opt
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

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
          <span
            className={`text-base font-bold ${
              availability.state === 'available'
                ? 'text-emerald-700 dark:text-emerald-300'
                : availability.state === 'busy'
                ? 'text-red-700 dark:text-red-300'
                : availability.state === 'away'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
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
                        ? isEn
                          ? 'Busy'
                          : 'Occupé'
                        : cal.todayAppointmentsCount > 0
                        ? isEn
                          ? `${cal.todayAppointmentsCount} appt${cal.todayAppointmentsCount > 1 ? 's' : ''}`
                          : `${cal.todayAppointmentsCount} RDV`
                        : isEn
                        ? 'Free'
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
          {bookingHref && (
            <a
              href={bookingHref}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-100 dark:shadow-none flex items-center justify-center gap-2 transition-all whitespace-nowrap"
            >
              <Calendar className="w-4 h-4" />
              {isEn ? 'Book a slot' : "Réserver un créneau dans l'agenda"}
            </a>
          )}

          {contactEmail && (
            <a
              href={`mailto:${contactEmail}`}
              className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all whitespace-nowrap"
            >
              <Mail className="w-4 h-4" />
              {isEn ? 'Send email' : 'Envoyer un e-mail'}
            </a>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            className={
              hasPrimaryContactCta
                ? 'w-full sm:w-auto px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap'
                : 'w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-100 dark:shadow-none flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap'
            }
            title={isEn ? 'Copy public page URL' : 'Copier le lien de cette page publique'}
          >
            {copiedLink ? (
              <>
                <Check className={`w-4 h-4 ${hasPrimaryContactCta ? 'text-emerald-500' : 'text-emerald-200'}`} />
                <span>{isEn ? 'Link copied!' : 'Lien copié !'}</span>
              </>
            ) : (
              <>
                <Link2 className={`w-4 h-4 ${hasPrimaryContactCta ? 'text-slate-500 dark:text-slate-400' : 'text-white'}`} />
                <span>{isEn ? 'Copy link' : 'Copier le lien'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadVCard}
            className="w-full sm:w-auto px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            title={
              isEn
                ? 'Download contact card (.vcf) for your address book'
                : "Télécharger la fiche contact (.vcf) pour votre carnet d'adresses"
            }
          >
            <UserPlus className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <span>{isEn ? 'Add to contacts' : 'Ajouter aux contacts'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="w-full sm:w-auto px-4 py-3 bg-white hover:bg-slate-50 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            title={isEn ? 'Open QR code to share this status page on mobile' : 'Afficher le QR Code pour partager cette page sur mobile'}
          >
            <QrCode className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>QR Code</span>
          </button>
        </div>
      </div>

      {/* Upcoming Busy Slots Section (Privacy-Safe) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {isEn ? 'Upcoming busy slots' : 'Prochains créneaux occupés'}
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
                          <span className="text-xs font-bold font-mono tabular-nums text-slate-800 dark:text-slate-100">
                            {slot.startStr} - {slot.endStr}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{isEn ? 'Reserved slot' : 'Créneau réservé'}</span>
                            {slot.calendarLabel && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70 font-semibold text-[10px]">
                                {slot.calendarLabel}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
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
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              {isEn ? 'No busy slots scheduled soon' : 'Aucun créneau occupé prévu prochainement'}
            </p>
            <p className="text-slate-400 dark:text-slate-500">
              {profile.mode === 'shop'
                ? isEn
                  ? 'Regular opening hours remain fully available.'
                  : "Les horaires d'ouverture habituels restent entièrement disponibles."
                : isEn
                ? 'Normal working hours remain fully available.'
                : 'Les créneaux de travail habituels sont entièrement disponibles.'}
            </p>
          </div>
        )}
      </div>

      {/* Working Hours Weekly Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {scheduleHeading}
          </h2>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md w-fit">
            {isEn ? 'Timezone:' : 'Fuseau :'} {timezone}
          </span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
          {([1, 2, 3, 4, 5, 6, 0] as DayOfWeek[]).map(day => {
            const conf = schedule.days[day];
            const isToday = nowParts.dayOfWeek === day;

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
                  <span>{dayLabels[day]}</span>
                  {isToday && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                      {isEn ? 'Today' : "Aujourd'hui"}
                    </span>
                  )}
                </div>
                <div>
                  {conf.enabled ? (
                    <span className={`font-mono tabular-nums ${isToday ? 'text-indigo-950 dark:text-indigo-200' : 'text-slate-600 dark:text-slate-300'}`}>
                      {formatScheduleTime(conf.start)} - {formatScheduleTime(conf.end)}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 italic">
                      {offDayLabel}
                    </span>
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

          const globalLunchLabel =
            isEn && schedule.lunchBreak.label === 'Pause déjeuner'
              ? 'Lunch break'
              : schedule.lunchBreak.label;

          return (
            <div className="pt-2 text-xs text-slate-500 dark:text-slate-400 space-y-1 border-t border-slate-100 dark:border-slate-800">
              {schedule.lunchBreak.enabled && (
                <div className="flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>
                    {globalLunchLabel} :{' '}
                    <strong className="font-medium text-slate-700 dark:text-slate-200 font-mono tabular-nums">
                      {formatScheduleTime(schedule.lunchBreak.start)} - {formatScheduleTime(schedule.lunchBreak.end)}
                    </strong>
                  </span>
                </div>
              )}
              {customDays.length > 0 && (
                <div className="pl-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {customDays.map(({ day, eff }) => (
                    <span key={day}>
                      {dayLabels[day]} :{' '}
                      <strong className="font-medium text-slate-700 dark:text-slate-200 font-mono tabular-nums">
                        {eff.enabled
                          ? `${formatScheduleTime(eff.start)} - ${formatScheduleTime(eff.end)}`
                          : isEn
                          ? 'None'
                          : 'Aucune'}
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
              <span>{isEn ? 'Upcoming closures / leave (30d):' : 'Prochaines fermetures / congés (30 j) :'}</span>
            </div>
            <div className="pl-5 flex flex-wrap gap-2">
              {upcomingClosures.map((closure, idx) => {
                const fmt = (dStr: string) => {
                  const [, m, d] = dStr.split('-');
                  return isEn ? `${m}/${d}` : `${d}/${m}`;
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
                    <strong className="font-mono tabular-nums">{range}</strong>
                    <span>{closure.label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {(schedule.bufferMinutes || 0) > 0 && (
          <div className="pt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span>
              {isEn
                ? profile.mode === 'shop'
                  ? `Includes a ±${schedule.bufferMinutes} min buffer around booked slots.`
                  : `Includes a ±${schedule.bufferMinutes} min buffer around appointments.`
                : profile.mode === 'shop'
                ? `Inclut une marge de battement de ±${schedule.bufferMinutes} min autour des créneaux réservés.`
                : `Inclut une marge de battement de ±${schedule.bufferMinutes} min autour des rendez-vous.`}
            </span>
          </div>
        )}
      </div>

      {/* Discreet owner access, live refresh & JSON API footer */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
        {onRefresh && (
          <>
            <button
              type="button"
              disabled={isRefreshing}
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setIsRefreshing(false);
                }
              }}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 disabled:opacity-60 font-medium transition-colors cursor-pointer"
              title={isEn ? 'Refresh live availability now' : 'Actualiser la disponibilité maintenant'}
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>
                {lastSyncedAt
                  ? `${isEn ? 'Updated' : 'Mis à jour'} ${formatTimeShort(lastSyncedAt, timezone, lang)}`
                  : isEn
                  ? 'Refresh'
                  : 'Actualiser'}
              </span>
            </button>
            <span className="text-slate-300 dark:text-slate-700 text-[11px]">•</span>
          </>
        )}
        <a
          href={`/api/badge.json${isEn ? '?lang=en' : ''}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 font-medium transition-colors"
          title={isEn ? 'Open anonymized status in JSON format' : 'Ouvrir le statut anonymisé au format JSON'}
        >
          <FileCode className="w-3 h-3" />
          <span>{isEn ? 'JSON Feed' : 'Flux JSON'}</span>
        </a>
        {onGoToStudio && (
          <>
            <span className="text-slate-300 dark:text-slate-700 text-[11px]">•</span>
            <button
              onClick={onGoToStudio}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 font-medium transition-colors cursor-pointer"
              title={isEn ? 'Protected Studio access' : 'Accès protégé au Studio'}
            >
              <Lock className="w-3 h-3" />
              <span>{isEn ? 'Settings' : 'Accès Paramètres'}</span>
            </button>
          </>
        )}
      </div>

      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        url={getPublicShareUrl()}
        profileName={profile.name}
        lang={lang}
      />
    </div>
  );
};
