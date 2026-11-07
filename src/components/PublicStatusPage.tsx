import React from 'react';
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
} from 'lucide-react';
import {
  calculateAvailability,
  getZonedDateParts,
  type AvailabilityResult,
  type ScheduleConfig,
  type DayOfWeek,
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
