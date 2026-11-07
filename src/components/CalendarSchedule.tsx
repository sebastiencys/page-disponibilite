import React, { useState } from 'react';
import {
  Clock,
  Coffee,
  RefreshCw,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ShieldCheck,
  Lock,
  FileCode,
} from 'lucide-react';
import type {
  ScheduleConfig,
  DayOfWeek,
} from '../lib/availability.ts';

interface CalendarScheduleProps {
  schedule: ScheduleConfig;
  icsUrl: string;
  onUpdateIcsUrl: (url: string) => void;
  onSyncIcs: (url: string) => Promise<void>;
  isSyncing: boolean;
  hasEnvCalendar: boolean;
  onRefreshEnvCalendar: () => Promise<void>;
}

const DAYS_META: { key: DayOfWeek; label: string }[] = [
  { key: 1, label: 'Lundi' },
  { key: 2, label: 'Mardi' },
  { key: 3, label: 'Mercredi' },
  { key: 4, label: 'Jeudi' },
  { key: 5, label: 'Vendredi' },
  { key: 6, label: 'Samedi' },
  { key: 0, label: 'Dimanche' },
];

export const CalendarSchedule: React.FC<CalendarScheduleProps> = ({
  schedule,
  icsUrl,
  onUpdateIcsUrl,
  onSyncIcs,
  isSyncing,
  hasEnvCalendar,
  onRefreshEnvCalendar,
}) => {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showIcsHelp, setShowIcsHelp] = useState(false);

  const handleSyncSubmit = async () => {
    if (!icsUrl) return;
    try {
      setSyncStatus('Synchronisation en cours...');
      await onSyncIcs(icsUrl);
      setSyncStatus('Synchronisation réussie ! Les disponibilités sont synchronisées.');
      setTimeout(() => setSyncStatus(null), 4000);
    } catch (err: any) {
      setSyncStatus(`Erreur : ${err.message || 'Impossible de charger ce calendrier'}`);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Privacy Notice Banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-emerald-950">
              Protection Totale de la Confidentialité
            </div>
            <p className="text-xs text-emerald-800">
              Aucun détail de réunion (titre, participants, lieu) n'est jamais affiché ni exposé. Seul le voyant Libre/Occupé est calculé.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 bg-emerald-100/70 px-3 py-1.5 rounded-lg shrink-0">
          <Lock className="w-3.5 h-3.5" />
          Zéro données privées exposées
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Schedule & Working Days (Fixed via JSON) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Working Days Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  Jours & Horaires de Travail
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Déterminent quand le voyant passe automatiquement en mode "Hors horaires".
                </p>
              </div>

              {/* JSON Badge */}
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-mono font-medium border border-slate-200"
                title="Configuré dans config/schedule.json"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                config/schedule.json
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Ces horaires sont <strong>sécurisés et protégés en lecture seule</strong> dans le code pour empêcher toute modification par des tiers.
              </span>
            </div>

            <div className="space-y-2.5">
              {DAYS_META.map(({ key, label }) => {
                const dayConf = schedule.days[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      dayConf.enabled
                        ? 'border-indigo-100 bg-indigo-50/20'
                        : 'border-slate-100 bg-slate-50/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          dayConf.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                      />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800">
                        {label}
                      </span>
                    </div>

                    {dayConf.enabled ? (
                      <div className="text-xs font-mono font-semibold text-slate-700 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                        {dayConf.start.replace(':', 'h')} - {dayConf.end.replace(':', 'h')}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium italic">Repos</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lunch Break Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coffee className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">Pause Déjeuner Quotidienne</h3>
              </div>
              <span className="text-[11px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                Fixé via JSON
              </span>
            </div>

            {schedule.lunchBreak.enabled ? (
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between text-xs">
                <div className="text-slate-700 font-medium">Plage de pause automatique :</div>
                <div className="font-mono font-bold text-amber-900 bg-white px-3 py-1 rounded-md border border-amber-200">
                  {schedule.lunchBreak.start.replace(':', 'h')} à {schedule.lunchBreak.end.replace(':', 'h')}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Aucune pause déjeuner automatique configurée.</p>
            )}
          </div>
        </div>

        {/* Right Column: Calendar Connection with Secret URL Protection */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-indigo-600" />
                Lien de Calendrier Secret (iCal / Webcal)
              </h2>
              <button
                type="button"
                onClick={() => setShowIcsHelp(!showIcsHelp)}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Où trouver ce lien ?
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Pour calculer automatiquement votre statut en fonction de vos vrais rendez-vous, 
              le serveur analyse votre flux iCal. <strong>Aucun titre de rendez-vous n'est stocké ni exposé au public</strong>.
            </p>

            {/* Secure Env Banner */}
            {hasEnvCalendar ? (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-700" />
                      Lien d'agenda 100% protégé via CALENDAR_ICS_URL
                    </div>
                    <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                      L'adresse secrète de votre calendrier est stockée dans la variable d'environnement du serveur. 
                      Elle est <strong>totalement invisible</strong> aux yeux du public et de vos correspondants.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-emerald-200">
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Synchronisation automatique active en arrière-plan
                  </span>
                  <button
                    type="button"
                    onClick={onRefreshEnvCalendar}
                    disabled={isSyncing}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Actualisation...' : 'Actualiser maintenant'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-indigo-950">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  Recommandation sécurité (variable d'environnement) :
                </div>
                <p className="text-indigo-900 text-xs leading-relaxed">
                  Pour ne pas exposer votre lien de calendrier, définissez <code className="bg-indigo-100 px-1 py-0.5 rounded font-mono font-bold text-indigo-950">CALENDAR_ICS_URL="votre_lien_secret"</code> dans votre fichier <code>.env</code> ou dans les variables d'environnement de <strong>Vercel</strong>. Le serveur s'en occupera automatiquement en arrière-plan sans jamais révéler l'URL au navigateur.
                </p>
              </div>
            )}

            {!hasEnvCalendar && (
              <div className="space-y-2 pt-2">
                <div className="text-xs font-medium text-slate-700">Ou tester avec une URL manuelle :</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={icsUrl}
                    onChange={e => onUpdateIcsUrl(e.target.value)}
                    placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                    className="flex-1 text-xs sm:text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <button
                    onClick={handleSyncSubmit}
                    disabled={isSyncing || !icsUrl}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition-all shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Chargement...' : 'Synchroniser'}
                  </button>
                </div>
              </div>
            )}

            {syncStatus && (
              <div
                className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  syncStatus.startsWith('Erreur')
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {syncStatus.startsWith('Erreur') ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {syncStatus}
              </div>
            )}

            {showIcsHelp && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-2 mt-2">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                  Comment trouver votre adresse secrète Google Calendar :
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 ml-1">
                  <li>Ouvrez Google Calendar sur votre ordinateur.</li>
                  <li>Dans la colonne de gauche, survolez votre agenda principal &gt; cliquez sur les 3 points (<strong>⋮</strong>) &gt; <strong>Paramètres et partage</strong>.</li>
                  <li>Faites défiler jusqu'à la section <strong>"Intégrer l'agenda"</strong>.</li>
                  <li>Copiez le lien intitulé <strong>"Adresse secrète au format iCal"</strong>.</li>
                  <li>Ajoutez-le dans votre <code>.env</code> ou sur Vercel avec le nom <code>CALENDAR_ICS_URL</code> !</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
