/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Lock } from 'lucide-react';
import { Header } from './components/Header.tsx';
import { SignatureStudio } from './components/SignatureStudio.tsx';
import { CalendarSchedule } from './components/CalendarSchedule.tsx';
import { PublicStatusPage } from './components/PublicStatusPage.tsx';
import { EmailGuideModal } from './components/EmailGuideModal.tsx';
import { AvailabilitySimulator } from './components/AvailabilitySimulator.tsx';
import { StudioAuthGate } from './components/StudioAuthGate.tsx';
import {
  calculateAvailability,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  formatTimeShort,
  type AvailabilityResult,
  type UserProfile,
  type AnonymizedSlot,
  type CalendarSummaryItem,
} from './lib/availability.ts';
import type { SyncedCalendarInfo } from './server/calendarSync.ts';

const LOCAL_STORAGE_KEY = 'dispolive_user_state_v2';
const STUDIO_TOKEN_KEY = 'dispolive_studio_token_v1';
const THEME_STORAGE_KEY = 'dispolive_theme_v1';

export default function App() {
  // Check URL params / path on initial load - default is 'public'
  const [currentTab, setCurrentTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path === '/studio') return 'signature';
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      if (view === 'studio' || view === 'signature') return 'signature';
      if (view === 'simulator' || view === 'simulation') return 'simulator';
      if (view === 'schedule') return 'schedule';
      if (view === 'guide') return 'guide';
      if (view === 'public') return 'public';
    }
    return 'public';
  });

  // Studio authentication state (backed by STUDIO_PASSWORD in .env)
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [passwordRequired, setPasswordRequired] = useState<boolean>(true);
  const [isStudioAuthenticated, setIsStudioAuthenticated] = useState<boolean>(false);
  const [studioToken, setStudioToken] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(STUDIO_TOKEN_KEY) || '';
    }
    return '';
  });

  // App theme state ('light' | 'dark'), initialized from localStorage or system preference
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    }
    return false;
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    }
  }, [isDark]);

  // Profile data (read-only from config/personal.json, refreshed via /api/status)
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const name = profile?.name?.trim();
      document.title = name
        ? `${name} — Disponibilité en direct | DispoLive`
        : 'DispoLive - Statut & Badge Signature en Temps Réel';
    }
  }, [profile?.name]);

  const [icsUrl, setIcsUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`${LOCAL_STORAGE_KEY}_ics`) || '';
    }
    return '';
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [hasEnvCalendar, setHasEnvCalendar] = useState(false);
  const [envCalendars, setEnvCalendars] = useState<SyncedCalendarInfo[]>([]);
  const [calendarsSummary, setCalendarsSummary] = useState<CalendarSummaryItem[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<AnonymizedSlot[]>([]);
  const [now, setNow] = useState(new Date());
  const [timezone, setTimezone] = useState<string>(DEFAULT_SCHEDULE.timezone || 'Europe/Paris');

  // Current computed availability (initialized with client calculation, refreshed via server status)
  const [availability, setAvailability] = useState<AvailabilityResult>(() => {
    return calculateAvailability(new Date(), DEFAULT_SCHEDULE, [], { type: 'auto' }, DEFAULT_SCHEDULE.timezone || 'Europe/Paris');
  });

  // Base URL
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Check Studio auth session on mount
  const checkStudioAuth = useCallback(async (tokenOverride?: string) => {
    const activeToken = tokenOverride ?? studioToken;
    try {
      const res = await fetch('/api/studio-auth', {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPasswordRequired(Boolean(data.passwordRequired));
        setIsStudioAuthenticated(Boolean(data.authenticated));
        if (!data.authenticated && activeToken) {
          sessionStorage.removeItem(STUDIO_TOKEN_KEY);
          setStudioToken('');
        }
      }
    } catch {
      // Keep locked on network error if password protection expected
    } finally {
      setAuthLoading(false);
    }
  }, [studioToken]);

  useEffect(() => {
    checkStudioAuth();
  }, [checkStudioAuth]);

  const handleStudioUnlockSuccess = (newToken: string) => {
    if (newToken) {
      sessionStorage.setItem(STUDIO_TOKEN_KEY, newToken);
      setStudioToken(newToken);
    }
    setIsStudioAuthenticated(true);
    setAuthLoading(false);
  };

  const handleLockStudio = async () => {
    try {
      await fetch('/api/studio-auth', { method: 'DELETE' });
    } catch {
      // Ignore network errors on logout
    }
    sessionStorage.removeItem(STUDIO_TOKEN_KEY);
    setStudioToken('');
    setIsStudioAuthenticated(false);
    setCurrentTab('public');
  };

  // Fetch live status from server (which evaluates schedule.json + private CALENDAR_ICS_URL + process.env.TIMEZONE)
  const fetchServerStatus = useCallback(async (forceRefresh = false) => {
    try {
      const endpoint = forceRefresh ? '/api/status?refresh=1' : '/api/status';
      const res = await fetch(endpoint, {
        headers: forceRefresh && studioToken ? { Authorization: `Bearer ${studioToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.availability) {
          setAvailability(data.availability);
        }
        if (data.profile) {
          setProfile(data.profile);
        }
        if (data.upcomingSlots) {
          setUpcomingSlots(data.upcomingSlots);
        }
        if (data.hasEnvCalendar !== undefined) {
          setHasEnvCalendar(data.hasEnvCalendar);
        }
        if (Array.isArray(data.envCalendars)) {
          setEnvCalendars(data.envCalendars);
        }
        if (Array.isArray(data.calendars)) {
          setCalendarsSummary(data.calendars);
        }
        if (data.timezone) {
          setTimezone(data.timezone);
        }
      }
    } catch {
      // Fallback to local computation with timezone
      setAvailability(calculateAvailability(new Date(), DEFAULT_SCHEDULE, [], { type: 'auto' }, timezone));
    }
  }, [studioToken, timezone]);

  // Initial check, interval polling every 10 seconds, and immediate refresh when tab wakes up
  useEffect(() => {
    fetchServerStatus();
    const syncNow = () => {
      setNow(new Date());
      fetchServerStatus();
    };
    const timer = setInterval(syncNow, 10000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncNow();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', syncNow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', syncNow);
    };
  }, [fetchServerStatus]);

  // Persist icsUrl to localStorage
  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_ics`, icsUrl);
  }, [icsUrl]);

  const handleSyncIcs = async (url: string) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/fetch-ics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(studioToken ? { Authorization: `Bearer ${studioToken}` } : {}),
        },
        body: JSON.stringify({ url }),
      });
      if (res.status === 401) {
        setIsStudioAuthenticated(false);
        throw new Error('Session expirée. Veuillez vous reconnecter.');
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du téléchargement du calendrier');
      }
      setIcsUrl(url);
      await fetchServerStatus();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefreshEnvCalendar = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/calendar-refresh', {
        method: 'POST',
        headers: studioToken ? { Authorization: `Bearer ${studioToken}` } : {},
      });
      if (res.status === 401) {
        setIsStudioAuthenticated(false);
        return;
      }
      await fetchServerStatus(true);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefreshBadgeGenerator = useCallback(
    async (forceCalendarSync = false) => {
      setNow(new Date());
      if (forceCalendarSync) {
        try {
          const res = await fetch('/api/calendar-refresh', {
            method: 'POST',
            headers: studioToken ? { Authorization: `Bearer ${studioToken}` } : {},
          });
          if (res.status === 401 && passwordRequired) {
            setIsStudioAuthenticated(false);
            return;
          }
        } catch {
          // Ignore calendar refresh network errors and still refresh status via ?refresh=1
        }
      }
      await fetchServerStatus(forceCalendarSync);
    },
    [fetchServerStatus, passwordRequired, studioToken]
  );

  const isStudioRoute = currentTab !== 'public';
  const studioLocked = authLoading || (passwordRequired && !isStudioAuthenticated);
  const failedCalendarsCount = envCalendars.filter(c => !c.ok).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white transition-colors">
      {/* Navigation Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        availability={availability}
        currentTimeStr={formatTimeShort(now, timezone)}
        timezone={timezone}
        profileName={profile.name}
        studioLocked={studioLocked}
        passwordRequired={passwordRequired}
        onLockStudio={handleLockStudio}
        isDark={isDark}
        onToggleTheme={() => setIsDark(d => !d)}
        calendarErrorCount={failedCalendarsCount}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {currentTab === 'public' && (
          <PublicStatusPage
            profile={profile}
            availability={availability}
            schedule={DEFAULT_SCHEDULE}
            timezone={timezone}
            upcomingSlots={upcomingSlots}
            calendars={calendarsSummary}
            onGoToStudio={() => setCurrentTab('signature')}
          />
        )}

        {isStudioRoute && authLoading && (
          <div className="min-h-[50vh] flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
            Vérification de l&apos;accès...
          </div>
        )}

        {isStudioRoute && !authLoading && passwordRequired && !isStudioAuthenticated && (
          <StudioAuthGate
            onSuccess={handleStudioUnlockSuccess}
            onCancelToPublic={() => setCurrentTab('public')}
          />
        )}

        {isStudioRoute && !authLoading && (!passwordRequired || isStudioAuthenticated) && (
          <>
            {!passwordRequired && (
              <div className="mb-6 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  Aucun mot de passe défini : ajoutez <code className="font-mono font-bold bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">STUDIO_PASSWORD</code> dans votre fichier <code className="font-mono">.env</code> (ou variables d&apos;environnement) pour verrouiller le Studio.
                </span>
              </div>
            )}

            {currentTab === 'signature' && (
              <SignatureStudio
                availability={availability}
                profile={profile}
                timezone={timezone}
                appBaseUrl={appBaseUrl}
                onGoToSimulator={() => setCurrentTab('simulator')}
                onRefreshLive={handleRefreshBadgeGenerator}
              />
            )}

            {currentTab === 'simulator' && (
              <AvailabilitySimulator
                schedule={DEFAULT_SCHEDULE}
                profile={profile}
                timezone={timezone}
                upcomingSlots={upcomingSlots}
                calendars={calendarsSummary}
                appBaseUrl={appBaseUrl}
                onGoToStudio={() => setCurrentTab('signature')}
              />
            )}

            {currentTab === 'schedule' && (
              <CalendarSchedule
                schedule={DEFAULT_SCHEDULE}
                icsUrl={icsUrl}
                onUpdateIcsUrl={setIcsUrl}
                onSyncIcs={handleSyncIcs}
                isSyncing={isSyncing}
                hasEnvCalendar={hasEnvCalendar}
                envCalendars={envCalendars}
                onRefreshEnvCalendar={handleRefreshEnvCalendar}
              />
            )}

            {currentTab === 'guide' && <EmailGuideModal />}
          </>
        )}
      </main>
    </div>
  );
}
