/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { SignatureStudio } from './components/SignatureStudio.tsx';
import { CalendarSchedule } from './components/CalendarSchedule.tsx';
import { PublicStatusPage } from './components/PublicStatusPage.tsx';
import { EmailGuideModal } from './components/EmailGuideModal.tsx';
import { AvailabilitySimulator } from './components/AvailabilitySimulator.tsx';
import {
  calculateAvailability,
  DEFAULT_SCHEDULE,
  DEFAULT_PROFILE,
  formatTimeShort,
  type AvailabilityResult,
  type UserProfile,
  type AnonymizedSlot,
} from './lib/availability.ts';

const LOCAL_STORAGE_KEY = 'dispolive_user_state_v2';

export default function App() {
  // Check URL params on initial load - default is now 'public'
  const [currentTab, setCurrentTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
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

  // Profile data (read-only from config/personal.json, refreshed via /api/status)
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  const [icsUrl, setIcsUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`${LOCAL_STORAGE_KEY}_ics`) || '';
    }
    return '';
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [hasEnvCalendar, setHasEnvCalendar] = useState(false);
  const [upcomingSlots, setUpcomingSlots] = useState<AnonymizedSlot[]>([]);
  const [now, setNow] = useState(new Date());
  const [timezone, setTimezone] = useState<string>(DEFAULT_SCHEDULE.timezone || 'Europe/Paris');

  // Current computed availability (initialized with client calculation, refreshed via server status)
  const [availability, setAvailability] = useState<AvailabilityResult>(() => {
    return calculateAvailability(new Date(), DEFAULT_SCHEDULE, [], { type: 'auto' }, DEFAULT_SCHEDULE.timezone || 'Europe/Paris');
  });

  // Base URL
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Fetch live status from server (which evaluates schedule.json + private CALENDAR_ICS_URL + process.env.TIMEZONE)
  const fetchServerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
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
        if (data.timezone) {
          setTimezone(data.timezone);
        }
      }
    } catch {
      // Fallback to local computation with timezone
      setAvailability(calculateAvailability(new Date(), DEFAULT_SCHEDULE, [], { type: 'auto' }, timezone));
    }
  }, [timezone]);

  // Initial check & interval polling every 10 seconds
  useEffect(() => {
    fetchServerStatus();
    const timer = setInterval(() => {
      setNow(new Date());
      fetchServerStatus();
    }, 10000);
    return () => clearInterval(timer);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
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
      const res = await fetch('/api/calendar-refresh', { method: 'POST' });
      if (res.ok) {
        await fetchServerStatus();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Navigation Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        availability={availability}
        currentTimeStr={formatTimeShort(now, timezone)}
        timezone={timezone}
        profileName={profile.name}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {currentTab === 'signature' && (
          <SignatureStudio
            availability={availability}
            profile={profile}
            appBaseUrl={appBaseUrl}
            onGoToSimulator={() => setCurrentTab('simulator')}
          />
        )}

        {currentTab === 'simulator' && (
          <AvailabilitySimulator
            schedule={DEFAULT_SCHEDULE}
            profile={profile}
            timezone={timezone}
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
            onRefreshEnvCalendar={handleRefreshEnvCalendar}
          />
        )}

        {currentTab === 'public' && (
          <PublicStatusPage
            profile={profile}
            availability={availability}
            schedule={DEFAULT_SCHEDULE}
            timezone={timezone}
            upcomingSlots={upcomingSlots}
            onGoToStudio={() => setCurrentTab('signature')}
          />
        )}

        {currentTab === 'guide' && <EmailGuideModal />}
      </main>
    </div>
  );
}
