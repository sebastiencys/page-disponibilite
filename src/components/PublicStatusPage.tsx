import React, { useMemo } from 'react';
import {
  Calendar,
  Clock,
  Mail,
  ExternalLink,
  CheckCircle,
  XCircle,
  Coffee,
  Moon,
  Sparkles,
  Lock,
  ShieldCheck,
  CalendarCheck,
} from 'lucide-react';
import {
  calculateAvailability,
  getZonedDateParts,
  formatTimeShort,
  type AvailabilityResult,
  type ScheduleConfig,
  type DayOfWeek,
  type AnonymizedSlot,
} from '../lib/availability.ts';

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
  onGoToStudio,
}) => {
  const getStatusIcon = () => {
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
      slots: { startStr: string; endStr: string; durationStr: string }[];
    }[] = [];

    for (const slot of upcomingSlots) {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const startParts = getZonedDateParts(start, timezone);
      const dateKey = `${startParts.year}-${startParts.month}-${startParts.day}`;

      let dayLabel = `${DAY_LABELS[startParts.dayOfWeek]} ${startParts.day}/${startParts.month}`;
      if (
        startParts.year === nowZoned.year &&
        startParts.month === nowZoned.month &&
        startParts.day === nowZoned.day
      ) {
        dayLabel = "Aujourd'hui";
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
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
      const durationStr = hours > 0 ? (mins > 0 ? `${hours}h${mins}` : `${hours}h`) : `${mins} min`;

      let group = groups.find(g => g.dateKey === dateKey);
      if (!group) {
        group = { dateKey, dayLabel, slots: [] };
        groups.push(group);
      }
      group.slots.push({ startStr, endStr, durationStr });
    }

    return groups;
  }, [upcomingSlots, timezone]);

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      {/* Hero Live Status Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 shadow-lg text-center relative overflow-hidden">
        {/* Subtle background glow */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none blur-3xl"
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
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {profile.name}
        </h1>
        <p className="text-sm text-slate-500 mt-1 font-medium">
          {profile.role} {profile.company && `• ${profile.company}`}
        </p>

        {/* Large Status Badge Pill */}
        <div className="mt-6 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full border shadow-xs"
          style={{
            borderColor: `${availability.badgeColor}40`,
            backgroundColor: `${availability.badgeColor}10`,
          }}
        >
          <span
            className="w-3 h-3 rounded-full animate-pulse"
            style={{ backgroundColor: availability.dotColor }}
          />
          <span className="text-base font-bold" style={{ color: availability.badgeColor }}>
            {availability.title}
          </span>
          <span className="text-sm text-slate-600 font-medium">
            • {availability.subtitle}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          {profile.bookingUrl && (
            <a
              href={profile.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-100 flex items-center justify-center gap-2 transition-all"
            >
              <Calendar className="w-4 h-4" />
              Réserver un créneau dans mon agenda
            </a>
          )}

          {profile.email && (
            <a
              href={`mailto:${profile.email}`}
              className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Mail className="w-4 h-4" />
              Lui envoyer un e-mail
            </a>
          )}
        </div>
      </div>

      {/* Upcoming Busy Slots Section (Privacy-Safe) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              Prochains créneaux occupés
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Agenda confidentiel • Motifs masqués</span>
          </span>
        </div>

        {groupedSlots.length > 0 ? (
          <div className="space-y-4 pt-1">
            {groupedSlots.map(group => (
              <div key={group.dateKey} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <span>{group.dayLabel}</span>
                  <span className="h-px bg-slate-100 flex-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {group.slots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/60 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-2xs" />
                        <div>
                          <span className="text-xs font-bold font-mono text-slate-800">
                            {slot.startStr} - {slot.endStr}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            Créneau réservé
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {slot.durationStr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 px-4 text-center rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">Aucun créneau occupé prévu prochainement</p>
            <p className="text-slate-400">Les créneaux de travail habituels sont entièrement disponibles.</p>
          </div>
        )}

        <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>
            Les détails des rendez-vous (intitulés, participants et lieux) restent strictement confidentiels et ne sont jamais divulgués.
          </span>
        </div>
      </div>

      {/* Working Hours Weekly Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            Horaires habituels de travail
          </h2>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md w-fit">
            Fuseau : {timezone}
          </span>
        </div>
        <div className="divide-y divide-slate-100 text-xs sm:text-sm">
          {([1, 2, 3, 4, 5, 6, 0] as DayOfWeek[]).map(day => {
            const conf = schedule.days[day];
            const zonedNow = getZonedDateParts(new Date(), timezone);
            const isToday = zonedNow.dayOfWeek === day;

            return (
              <div
                key={day}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
                  isToday ? 'bg-indigo-50/70 font-semibold text-indigo-950' : 'text-slate-700'
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
                    <span className="font-mono text-slate-600">
                      {conf.start.replace(':', 'h')} - {conf.end.replace(':', 'h')}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Fermé / Repos</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {schedule.lunchBreak.enabled && (
          <div className="pt-2 text-xs text-slate-500 flex items-center gap-1.5 border-t border-slate-100">
            <Coffee className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              {schedule.lunchBreak.label} :{' '}
              <strong className="font-medium text-slate-700">
                {schedule.lunchBreak.start.replace(':', 'h')} - {schedule.lunchBreak.end.replace(':', 'h')}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* Footer Banner */}
      {onGoToStudio && (
        <div className="text-center pt-4">
          <button
            onClick={onGoToStudio}
            className="inline-flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Créer votre propre signature dynamique avec DispoLive
          </button>
        </div>
      )}
    </div>
  );
};
