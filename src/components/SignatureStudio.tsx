import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Mail,
  Palette,
  Sparkles,
  RefreshCw,
  Sliders,
  Send,
  Paperclip,
  Smile,
  Image as ImageIcon,
  Link2,
  Trash2,
  Maximize2,
  Minus,
  X,
  Info,
  CheckCheck,
  Lock,
  FileCode,
  UserCheck,
  Clock,
  Globe,
  QrCode,
} from 'lucide-react';
import {
  normalizeAppLang,
  sanitizeOptionalContactField,
  type AppLang,
  type AvailabilityResult,
  DEFAULT_PROFILE,
  DEFAULT_SCHEDULE,
} from '../lib/availability.ts';
import {
  escapeHtml,
  normalizeBadgeStyle,
  normalizeBadgeTheme,
  type BadgeStyle,
  type BadgeTheme,
} from '../lib/badgeSvg.ts';
import { copyTextToClipboard } from '../lib/clipboard.ts';
import { EnvJsonConverter } from './EnvJsonConverter.tsx';
import {
  AUTO_REFRESH_OPTIONS,
  AUTO_REFRESH_STORAGE_KEY,
  buildAvailabilityFingerprint,
  buildBadgePreviewUrl,
  buildBadgePublicUrl,
  formatLastRefreshedTime,
  formatRemainingRefreshTime,
  normalizeAutoRefreshMs,
  shouldTriggerAutoRefresh,
} from '../lib/badgeRefresh.ts';
import { QrCodeModal } from './QrCodeModal.tsx';

const STUDIO_PREFS_STORAGE_KEY = 'dispolive_studio_prefs_v1';

interface StudioPrefs {
  badgeStyle: BadgeStyle;
  badgeTheme: BadgeTheme;
  badgeLang: AppLang;
  format: 'png' | 'svg';
  emailClientTab: 'gmail' | 'outlook' | 'apple';
}

function loadStudioPrefs(): StudioPrefs {
  const defaults: StudioPrefs = {
    badgeStyle: 'pill',
    badgeTheme: 'light',
    badgeLang: 'fr',
    format: 'png',
    emailClientTab: 'gmail',
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STUDIO_PREFS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<keyof StudioPrefs, unknown>>;
    const client =
      parsed.emailClientTab === 'outlook' || parsed.emailClientTab === 'apple' || parsed.emailClientTab === 'gmail'
        ? parsed.emailClientTab
        : 'gmail';
    const fmt = parsed.format === 'svg' || parsed.format === 'png' ? parsed.format : 'png';
    return {
      badgeStyle: normalizeBadgeStyle(typeof parsed.badgeStyle === 'string' ? parsed.badgeStyle : undefined),
      badgeTheme: normalizeBadgeTheme(typeof parsed.badgeTheme === 'string' ? parsed.badgeTheme : undefined),
      badgeLang: normalizeAppLang(typeof parsed.badgeLang === 'string' ? parsed.badgeLang : undefined),
      format: client === 'outlook' ? 'png' : fmt,
      emailClientTab: client,
    };
  } catch {
    return defaults;
  }
}

interface SignatureStudioProps {
  availability: AvailabilityResult;
  profile: {
    name: string;
    role: string;
    company: string;
    email: string;
    bookingUrl: string;
  };
  timezone?: string;
  onUpdateProfile?: (field: string, value: string) => void;
  appBaseUrl: string;
  onGoToSimulator?: () => void;
  onRefreshLive?: (forceCalendarSync?: boolean) => Promise<void>;
}

export const SignatureStudio: React.FC<SignatureStudioProps> = ({
  availability,
  profile,
  timezone = DEFAULT_SCHEDULE.timezone || 'Europe/Paris',
  onUpdateProfile,
  appBaseUrl,
  onGoToSimulator,
  onRefreshLive,
}) => {
  const initialPrefs = useMemo(() => loadStudioPrefs(), []);
  const safeProfileEmail = sanitizeOptionalContactField(profile.email);
  const safeProfileBookingUrl = sanitizeOptionalContactField(profile.bookingUrl);
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>(initialPrefs.badgeStyle);
  const [badgeTheme, setBadgeTheme] = useState<BadgeTheme>(initialPrefs.badgeTheme);
  const [badgeLang, setBadgeLang] = useState<AppLang>(initialPrefs.badgeLang);
  const [format, setFormat] = useState<'png' | 'svg'>(initialPrefs.format);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [emailClientTab, setEmailClientTab] = useState<'gmail' | 'outlook' | 'apple'>(initialPrefs.emailClientTab);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(() => Date.now());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(() => Date.now());
  const [clockNow, setClockNow] = useState<number>(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return normalizeAutoRefreshMs(localStorage.getItem(AUTO_REFRESH_STORAGE_KEY));
    }
    return normalizeAutoRefreshMs(undefined);
  });

  // Persist Studio badge preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          STUDIO_PREFS_STORAGE_KEY,
          JSON.stringify({ badgeStyle, badgeTheme, badgeLang, format, emailClientTab })
        );
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [badgeStyle, badgeTheme, badgeLang, format, emailClientTab]);

  // Persist auto-refresh preference (default: 10 minutes)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefreshMs));
    }
  }, [autoRefreshMs]);

  const triggerBadgeRefresh = useCallback(
    async (forceCalendarSync = false) => {
      setIsRefreshing(true);
      try {
        if (onRefreshLive) {
          await onRefreshLive(forceCalendarSync);
        }
      } finally {
        const nowTs = Date.now();
        setRefreshKey(prev => (nowTs > prev ? nowTs : prev + 1));
        setLastRefreshedAt(nowTs);
        setClockNow(nowTs);
        setIsRefreshing(false);
      }
    },
    [onRefreshLive]
  );

  // Immediately refresh badge images whenever server availability status/text/RDV counts change
  const availabilityFingerprint = useMemo(
    () => buildAvailabilityFingerprint(availability),
    [availability]
  );
  const prevFingerprintRef = useRef<string>(availabilityFingerprint);
  useEffect(() => {
    if (prevFingerprintRef.current !== availabilityFingerprint) {
      prevFingerprintRef.current = availabilityFingerprint;
      const nowTs = Date.now();
      setRefreshKey(prev => (nowTs > prev ? nowTs : prev + 1));
      setLastRefreshedAt(nowTs);
      setClockNow(nowTs);
    }
  }, [availabilityFingerprint]);

  // Periodic wall-clock auto-refresh check (default: every 10 minutes, plus tab wake-up catch-up)
  const lastRefreshedAtRef = useRef<number>(lastRefreshedAt);
  lastRefreshedAtRef.current = lastRefreshedAt;
  const isRefreshingRef = useRef<boolean>(isRefreshing);
  isRefreshingRef.current = isRefreshing;

  useEffect(() => {
    const checkAndRefresh = () => {
      const nowTs = Date.now();
      setClockNow(nowTs);
      if (
        !isRefreshingRef.current &&
        shouldTriggerAutoRefresh(lastRefreshedAtRef.current, nowTs, autoRefreshMs)
      ) {
        triggerBadgeRefresh(true);
      }
    };

    const tick = setInterval(checkAndRefresh, 15000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkAndRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [autoRefreshMs, triggerBadgeRefresh]);

  // When user switches to Outlook, default to PNG because Outlook Desktop Word engine doesn't render SVG
  const handleSelectClient = (client: 'gmail' | 'outlook' | 'apple') => {
    setEmailClientTab(client);
    if (client === 'outlook') {
      setFormat('png');
    }
  };

  // Canonical clean URL (for copying / HTML / Markdown) vs cache-busted preview URL
  const badgeUrl = buildBadgePublicUrl(appBaseUrl, {
    format,
    style: badgeStyle,
    theme: badgeTheme,
    name: profile.name,
    role: profile.role,
    company: profile.company,
    lang: badgeLang,
  });
  const previewBadgeUrl = buildBadgePreviewUrl(
    appBaseUrl,
    {
      format,
      style: badgeStyle,
      theme: badgeTheme,
      name: profile.name,
      role: profile.role,
      company: profile.company,
      lang: badgeLang,
    },
    refreshKey
  );
  const badgeJsonUrl = `${appBaseUrl}/api/badge.json${badgeLang === 'en' ? '?lang=en' : ''}`;
  const publicPageUrl = `${appBaseUrl}?view=public${badgeLang === 'en' ? '&lang=en' : ''}`;

  const todayCount = Math.max(0, Math.floor(availability.todayAppointmentsCount ?? 0));
  const hasTodayRdvs = todayCount > 0;
  const dotDimLabel = hasTodayRdvs ? (todayCount >= 10 ? '44 × 38 px' : '42 × 38 px') : '36 × 36 px';
  const pillDimLabel = hasTodayRdvs ? '400 × 70 px' : '400 × 54 px';
  const cardDimLabel = hasTodayRdvs ? '380 × 118 px' : '380 × 100 px';
  const sigDimLabel = hasTodayRdvs ? '480 × 132 px' : '480 × 114 px';

  // HTML Signature code with bulletproof email client compatibility (tables + inline CSS)
  const generateHtmlSignature = () => {
    const isOutlook = emailClientTab === 'outlook';
    const isApple = emailClientTab === 'apple';

    const fontFamily = isOutlook
      ? "Calibri, 'Segoe UI', Arial, sans-serif"
      : isApple
      ? "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Helvetica, Arial, sans-serif"
      : "Roboto, Arial, sans-serif";

    const rawName = profile.name || DEFAULT_PROFILE.name;
    const rawRole = profile.role || '';
    const rawCompany = profile.company || '';
    const safeName = escapeHtml(rawName);
    const safeRole = escapeHtml(rawRole);
    const safeCompany = escapeHtml(rawCompany);
    const safeBookingUrl = safeProfileBookingUrl ? escapeHtml(safeProfileBookingUrl) : '';
    const safePublicUrl = escapeHtml(publicPageUrl);

    const badgeSrc = buildBadgePublicUrl(appBaseUrl, {
      format,
      style: badgeStyle,
      theme: badgeTheme,
      name: rawName,
      role: profile.role || DEFAULT_PROFILE.role,
      company: profile.company || DEFAULT_PROFILE.company,
      lang: badgeLang,
    });
    const safeBadgeSrc = escapeHtml(badgeSrc);
    const bookText = badgeLang === 'en' ? '📅 Book a meeting directly' : '📅 Prendre rendez-vous directement';
    const liveStatusText = badgeLang === 'en' ? 'Live availability' : 'Disponibilité en temps réel';
    const clickCalendarText = badgeLang === 'en' ? '(click to view calendar)' : "(cliquez pour voir l'agenda)";

    // Style 1: Signature Complète (All-in-one banner 480x114 or 480x132 with RDV line)
    if (badgeStyle === 'signature') {
      return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: ${fontFamily}; font-size: 14px; line-height: 1.4; color: #1e293b; max-width: 480px; width: 100%;">
  <tr>
    <td style="padding-top: 4px; padding-bottom: 8px;">
      <!-- DISPOLIVE BANNIÈRE SIGNATURE COMPLÈTE -->
      <a href="${safePublicUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
        <img src="${safeBadgeSrc}" alt="${badgeLang === 'en' ? `Live availability signature for ${safeName}` : `Signature et disponibilité en direct de ${safeName}`}" width="480" style="display: block; border: 0; outline: none; border-radius: 14px; max-width: 100%; height: auto;" />
      </a>
    </td>
  </tr>
  ${
    safeBookingUrl
      ? `<tr>
    <td style="font-size: 12px; color: #4f46e5; padding-top: 4px;">
      <a href="${safeBookingUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline; font-weight: 500;">
        ${bookText}
      </a>
    </td>
  </tr>`
      : ''
  }
</table>`;
    }

    // Style 2: Point Minimaliste (36x36 ou avec pastille compteur RDV du jour)
    if (badgeStyle === 'dot') {
      return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: ${fontFamily}; font-size: 14px; line-height: 1.4; color: #1e293b;">
  <tr>
    <td style="padding-bottom: 6px;">
      <span style="font-size: 16px; font-weight: 700; color: #0f172a;">${safeName}</span>
      ${safeRole ? `<br /><span style="font-size: 13px; color: #64748b;">${safeRole}${safeCompany ? ` • ${safeCompany}` : ''}</span>` : ''}
    </td>
  </tr>
  <tr>
    <td style="padding-top: 4px; padding-bottom: 8px;">
      <!-- DISPOLIVE POINT MINIMALISTE INLINE -->
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="vertical-align: middle; padding-right: 8px;">
            <a href="${safePublicUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
              <img src="${safeBadgeSrc}" alt="${liveStatusText}" height="36" style="display: block; border: 0; outline: none; height: 36px; width: auto;" />
            </a>
          </td>
          <td valign="middle" style="vertical-align: middle; font-size: 12px; color: #475569;">
            <a href="${safePublicUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
              <strong style="color: #0f172a;">${liveStatusText}</strong> ${clickCalendarText}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${
    safeBookingUrl
      ? `<tr>
    <td style="font-size: 12px; color: #4f46e5; padding-top: 2px;">
      <a href="${safeBookingUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline; font-weight: 500;">
        ${bookText}
      </a>
    </td>
  </tr>`
      : ''
  }
</table>`;
    }

    // Style 3 & 4: Carte Compacte (380px) ou Pill Moderne (400px)
    const isCard = badgeStyle === 'card';
    const imgWidth = isCard ? 380 : 400;
    return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: ${fontFamily}; font-size: 14px; line-height: 1.4; color: #1e293b; max-width: ${imgWidth}px; width: 100%;">
  <tr>
    <td style="padding-bottom: 8px;">
      <span style="font-size: 16px; font-weight: 700; color: #0f172a;">${safeName}</span>
      ${safeRole ? `<br /><span style="font-size: 13px; color: #64748b;">${safeRole}${safeCompany ? ` • ${safeCompany}` : ''}</span>` : ''}
    </td>
  </tr>
  <tr>
    <td style="padding-top: 4px; padding-bottom: 10px;">
      <!-- DISPOLIVE BADGE ${isCard ? 'CARTE COMPACTE' : 'PILL MODERNE'} -->
      <a href="${safePublicUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
        <img src="${safeBadgeSrc}" alt="${badgeLang === 'en' ? `Live availability for ${safeName}` : `Disponibilité en direct de ${safeName}`}" width="${imgWidth}" style="display: block; border: 0; outline: none; max-width: 100%; height: auto;" />
      </a>
    </td>
  </tr>
  ${
    safeBookingUrl
      ? `<tr>
    <td style="font-size: 12px; color: #4f46e5;">
      <a href="${safeBookingUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline; font-weight: 500;">
        ${bookText}
      </a>
    </td>
  </tr>`
      : ''
  }
</table>`;
  };

  const generateMarkdownSnippet = () => {
    const cleanName = (profile.name || DEFAULT_PROFILE.name).replace(/[\[\]]/g, '');
    const altPrefix = badgeLang === 'en' ? 'Availability of' : 'Disponibilité de';
    return `[![${altPrefix} ${cleanName}](${badgeUrl})](${publicPageUrl})`;
  };

  const handleCopyCode = async (content: string, type: string) => {
    await copyTextToClipboard(content);
    setCopiedFormat(type);
    setTimeout(() => setCopiedFormat(null), 2500);
  };

  // Copy rendered HTML directly to clipboard so the user can just hit Ctrl+V in Gmail/Apple Mail!
  const handleCopyRichText = async () => {
    try {
      const htmlContent = generateHtmlSignature();
      const textContent = `${profile.name}\n${profile.role} - ${profile.company}\n${badgeUrl}`;

      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([textContent], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          }),
        ]);
        setCopiedFormat('rich');
        setTimeout(() => setCopiedFormat(null), 2500);
      } else {
        handleCopyCode(htmlContent, 'html');
      }
    } catch {
      handleCopyCode(generateHtmlSignature(), 'html');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Customization Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Badge Options */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Style & Format du Badge
                </h2>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="studio-autorefresh-select">
                    Fréquence d&apos;actualisation automatique
                  </label>
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
                    <Clock className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
                    <select
                      id="studio-autorefresh-select"
                      aria-label="Fréquence d'actualisation automatique"
                      value={autoRefreshMs}
                      onChange={e => setAutoRefreshMs(normalizeAutoRefreshMs(e.target.value))}
                      className="bg-transparent text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                    >
                      {AUTO_REFRESH_OPTIONS.map(opt => (
                        <option key={opt.ms} value={opt.ms} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                          {opt.ms === 0 ? 'Auto : Off' : `Auto : ${opt.label}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerBadgeRefresh(true)}
                    disabled={isRefreshing}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1 font-medium cursor-pointer px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                    title="Forcer la synchronisation du calendrier et rafraîchir le rendu"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Actualiser
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  Aperçu synchronisé à <strong className="font-mono text-slate-700 dark:text-slate-200">{formatLastRefreshedTime(lastRefreshedAt, timezone)}</strong>
                </span>
                <span>
                  {autoRefreshMs > 0
                    ? `Prochaine vérif. auto dans ${formatRemainingRefreshTime(lastRefreshedAt, clockNow, autoRefreshMs)}`
                    : 'Actualisation périodique désactivée'}
                </span>
              </div>
            </div>

            {/* Badge Style Selector */}
            <div>
              <div className="flex items-center justify-between mb-2.5 gap-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Style de la pastille
                </label>
                <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/70">
                  {badgeStyle === 'pill' && `${pillDimLabel} • Capsule ${hasTodayRdvs ? '3 Lignes' : '2 Lignes'}`}
                  {badgeStyle === 'signature' && `${sigDimLabel} • Tout-en-un`}
                  {badgeStyle === 'card' && `${cardDimLabel} • Widget ${hasTodayRdvs ? '3 Lignes' : '2 Lignes'}`}
                  {badgeStyle === 'dot' && `${dotDimLabel} • ${hasTodayRdvs ? 'Avec pastille RDV' : 'Discret'}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    id: 'pill',
                    label: 'Pill Moderne',
                    size: pillDimLabel,
                    desc: 'Statut + horaire (+ RDV du jour si > 0)',
                    badge: hasTodayRdvs ? '💊 3 Lignes' : '💊 2 Lignes',
                    bgPreview: 'rounded-full h-4 bg-emerald-100 border border-emerald-400 flex items-center px-1.5 gap-1',
                  },
                  {
                    id: 'signature',
                    label: 'Signature Complète',
                    size: sigDimLabel,
                    desc: 'Avatar + Nom + Statut (+ RDV du jour si > 0)',
                    badge: '👤 Tout-en-un',
                    bgPreview: 'rounded-md h-7 bg-slate-100 border border-slate-300 p-1 flex items-center gap-1.5',
                  },
                  {
                    id: 'card',
                    label: 'Carte Compacte',
                    size: cardDimLabel,
                    desc: 'Widget encadré avec statut & RDV du jour',
                    badge: '🗂️ Widget',
                    bgPreview: 'rounded-md h-6 bg-slate-100 border border-slate-300 p-1 flex flex-col justify-between',
                  },
                  {
                    id: 'dot',
                    label: 'Point Minimaliste',
                    size: dotDimLabel,
                    desc: 'Rond discret + pastille RDV du jour si > 0',
                    badge: hasTodayRdvs ? `🟢 + ${todayCount}` : '🟢 36px',
                    bgPreview: 'w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-emerald-300 mx-auto my-1',
                  },
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => setBadgeStyle(s.id as BadgeStyle)}
                    className={`p-3 text-left rounded-xl border text-xs transition-all cursor-pointer relative overflow-hidden ${
                      badgeStyle === s.id
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 font-semibold ring-2 ring-indigo-500/30 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{s.label}</span>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                        {s.badge}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal leading-tight">{s.desc}</div>
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                      <span>Dimensions :</span>
                      <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{s.size}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Format: PNG vs SVG */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Format d'image recommandé
                </label>
                {emailClientTab === 'outlook' && (
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/70">
                    PNG requis pour Outlook
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormat('png')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    format === 'png'
                      ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                    PNG
                  </div>
                  <div>
                    <div className="text-xs font-bold">Format PNG</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Recommandé pour Outlook, Gmail & tous clients
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setFormat('svg')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    format === 'svg'
                      ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 flex items-center justify-center font-bold text-xs shrink-0">
                    SVG
                  </div>
                  <div>
                    <div className="text-xs font-bold">Format SVG</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Vectoriel Retina avec halo lumineux animé
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Theme Picker */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
                  Thème de fond
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'light', label: 'Clair' },
                    { id: 'dark', label: 'Sombre' },
                    { id: 'transparent', label: 'Transparent' },
                    { id: 'transparent-dark', label: 'Transp. nuit' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setBadgeTheme(t.id as BadgeTheme)}
                      className={`py-2 px-2 text-xs rounded-lg border font-medium cursor-pointer transition-all whitespace-nowrap ${
                        badgeTheme === t.id
                          ? 'border-slate-900 dark:border-indigo-500 bg-slate-900 dark:bg-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Picker */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>Langue des badges</span>
                </span>
                <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  {[
                    { id: 'fr', label: 'Français' },
                    { id: 'en', label: 'English' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBadgeLang(opt.id as AppLang)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        badgeLang === opt.id
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Profile Details for the Signature (Read-only from config/personal.json) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Vos Informations Personnelles
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Identité affichée dans la signature et sur votre page publique de disponibilité.
                </p>
              </div>

              {/* JSON / Env Badge */}
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-mono font-medium border border-slate-200 dark:border-slate-700 shrink-0"
                title="Configurable via .env (PERSONAL_JSON / PROFILE_*) ou config/personal.json"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                PERSONAL_JSON
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>
                Ces informations sont <strong>protégées côté serveur</strong> via la variable unique <code className="text-slate-800 dark:text-slate-100 font-mono font-semibold">PERSONAL_JSON</code> (ou <code className="font-mono">config/personal.json</code>).
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Nom complet</label>
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 select-all flex items-center justify-between">
                  <span>{profile.name}</span>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Poste / Métier</label>
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-800 dark:text-slate-200 select-all flex items-center justify-between">
                    <span className="truncate">{profile.role || '—'}</span>
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Entreprise</label>
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-800 dark:text-slate-200 select-all flex items-center justify-between">
                    <span className="truncate">{profile.company || '—'}</span>
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Adresse e-mail</label>
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm font-mono text-slate-700 dark:text-slate-200 select-all flex items-center justify-between">
                  <span className="truncate">{safeProfileEmail || '—'}</span>
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Lien de prise de rendez-vous
                </label>
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-700 dark:text-slate-200 select-all flex items-center justify-between">
                  {safeProfileBookingUrl ? (
                    <a
                      href={safeProfileBookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 truncate underline flex items-center gap-1.5"
                    >
                      <span className="truncate">{safeProfileBookingUrl}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 italic">Non configuré</span>
                  )}
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2" />
                </div>
              </div>
            </div>

            <EnvJsonConverter
              envVarName="PERSONAL_JSON"
              title="Convertir un personal.json → PERSONAL_JSON"
              description="Collez le contenu complet de votre fichier personal.json pour le transformer en une seule variable d’environnement prête à copier."
              currentObject={profile}
              placeholder={`{\n  "name": "Prénom Nom",\n  "role": "Votre Poste",\n  "company": "Votre Entreprise",\n  "email": "",\n  "bookingUrl": "",\n  "mode": "person"\n}`}
            />
          </div>
        </div>

        {/* Right: Live Email Simulator & Embed Code */}
        <div className="lg:col-span-7 space-y-6">
          {/* Client-Specific Simulated Email Window */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-md overflow-hidden transition-all">
            {/* 1. Header Bar adapts according to active client */}
            {emailClientTab === 'gmail' && (
              <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-red-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    M
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Nouveau message (Google Workspace / Gmail)
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <Minus className="w-3.5 h-3.5 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer" />
                  <Maximize2 className="w-3 h-3 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer" />
                  <X className="w-3.5 h-3.5 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer" />
                </div>
              </div>
            )}

            {emailClientTab === 'outlook' && (
              <div className="bg-[#0078d4] text-white px-4 py-2 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-sm bg-white text-[#0078d4] flex items-center justify-center font-black text-xs">
                    O
                  </div>
                  <span className="text-xs font-semibold tracking-wide">
                    Microsoft Outlook 365
                  </span>
                  <div className="hidden sm:flex items-center gap-3 ml-4 text-[11px] text-white/80">
                    <span className="hover:text-white cursor-pointer font-medium">Fichier</span>
                    <span className="text-white font-bold border-b-2 border-white pb-0.5">Message</span>
                    <span className="hover:text-white cursor-pointer">Insertion</span>
                    <span className="hover:text-white cursor-pointer">Options</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-white/80 text-xs">
                  <button className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[11px] font-medium flex items-center gap-1">
                    <Send className="w-3 h-3" />
                    Envoyer
                  </button>
                </div>
              </div>
            )}

            {emailClientTab === 'apple' && (
              <div className="bg-slate-200/90 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                  <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                  <span className="ml-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Nouveau message — Apple Mail (Mac & iOS)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-1 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-xs border border-slate-200 dark:border-slate-600">
                    <Send className="w-3.5 h-3.5 text-blue-500" />
                  </button>
                  <button className="p-1 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-xs border border-slate-200 dark:border-slate-600">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
                  </button>
                </div>
              </div>
            )}

            {/* Email client switcher bar */}
            <div className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 px-4 py-2 flex items-center justify-between text-xs gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Changer de logiciel de messagerie :
              </span>
              <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-900 p-0.5 rounded-lg text-xs">
                {[
                  { id: 'gmail', label: 'Gmail', icon: '🔴' },
                  { id: 'outlook', label: 'Outlook', icon: '🔵' },
                  { id: 'apple', label: 'Apple Mail', icon: '🍏' },
                ].map(client => (
                  <button
                    key={client.id}
                    onClick={() => handleSelectClient(client.id as any)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      emailClientTab === client.id
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span>{client.icon}</span>
                    <span>{client.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Email Header Fields */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center">
                <span className="w-16 font-semibold text-slate-400 dark:text-slate-500">À :</span>
                <span className="text-slate-700 dark:text-slate-200 font-medium">contact.client@example.com</span>
              </div>
              <div className="flex items-center">
                <span className="w-16 font-semibold text-slate-400 dark:text-slate-500">Objet :</span>
                <span className="text-slate-900 dark:text-slate-100 font-semibold">
                  {emailClientTab === 'outlook'
                    ? 'RE: Disponibilités pour le projet [Outlook 365]'
                    : emailClientTab === 'apple'
                    ? 'Re: Créneaux de réunion & suivi'
                    : "Re: Proposition d'accompagnement & créneaux disponibles"}
                </span>
              </div>
            </div>

            {/* Email Body Content with client-specific typography */}
            <div
              className={`p-6 sm:p-8 space-y-6 bg-white dark:bg-slate-900 min-h-[290px] ${
                emailClientTab === 'outlook'
                  ? "font-['Calibri','Segoe_UI',sans-serif]"
                  : emailClientTab === 'apple'
                  ? "font-['-apple-system','SF_Pro_Text',sans-serif]"
                  : 'font-sans'
              }`}
            >
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <p>Bonjour,</p>
                <p>
                  Merci pour votre message ! Je serais ravi de vous accompagner sur ce projet.
                  Vous pouvez consulter ma disponibilité en temps réel ci-dessous dans ma signature
                  avant de me proposer un échange ou de réserver un créneau :
                </p>
                <p>Bien cordialement,</p>
              </div>

              {/* Live Rendered Signature in Email */}
              <div
                className={`pt-5 ${
                  emailClientTab === 'outlook'
                    ? 'border-t border-slate-400/60 dark:border-slate-700'
                    : 'border-t border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div
                  className={`p-4 rounded-xl transition-all ${
                    badgeTheme === 'dark'
                      ? 'bg-slate-950 border border-slate-800'
                      : badgeTheme === 'transparent-dark'
                      ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:12px_12px] bg-slate-900 border border-dashed border-slate-700'
                      : badgeTheme === 'transparent'
                      ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-slate-100/80 dark:bg-slate-200 border border-dashed border-slate-300 dark:border-slate-600'
                      : emailClientTab === 'outlook'
                      ? 'bg-blue-50/30 dark:bg-slate-800/70 border border-blue-200/80 dark:border-slate-700'
                      : emailClientTab === 'apple'
                      ? 'bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700'
                      : 'bg-slate-50/80 dark:bg-slate-800/70 border border-dashed border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {/* STYLE 1: SIGNATURE COMPLÈTE */}
                  {badgeStyle === 'signature' && (
                    <div>
                      <div className="mb-2.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800/70 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        Format Tout-en-un ({sigDimLabel}) : Avatar, nom, poste et statut multiligne
                      </div>
                      <div className="my-1 block">
                        <img
                          key={`signature-${format}-${badgeLang}-${refreshKey}`}
                          src={previewBadgeUrl}
                          alt="Signature complète et statut en direct"
                          className="max-w-full rounded-xl shadow-xs transition-transform hover:scale-[1.01]"
                        />
                      </div>
                    </div>
                  )}

                  {/* STYLE 2: POINT MINIMALISTE */}
                  {badgeStyle === 'dot' && (
                    <div>
                      <div className={`text-sm font-bold ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-100' : 'text-slate-900 dark:text-slate-100'}`}>{profile.name}</div>
                      <div className={`text-xs mb-2.5 ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {profile.role} {profile.company && `• ${profile.company}`}
                      </div>
                      <div className={`my-1.5 flex items-center gap-3 p-2.5 rounded-lg border w-fit shadow-xs ${
                        badgeTheme === 'dark' || badgeTheme === 'transparent-dark'
                          ? 'bg-slate-900 border-slate-700'
                          : badgeTheme === 'transparent'
                          ? 'bg-white/70 border-slate-300 dark:border-slate-600'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      }`}>
                        <img
                          key={`dot-${format}-${badgeLang}-${refreshKey}`}
                          src={previewBadgeUrl}
                          alt={badgeLang === 'en' ? 'Live availability' : 'Point de disponibilité'}
                          className="h-9 w-auto shrink-0"
                        />
                        <div className="text-xs leading-snug">
                          <span className={`font-semibold block ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-100' : 'text-slate-800 dark:text-slate-100'}`}>
                            {badgeLang === 'en' ? 'Live availability' : 'Disponibilité en direct'}
                          </span>
                          <span className={`text-[11px] ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {badgeLang === 'en' ? 'Calculated in real time' : 'Statut calculé en temps réel'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STYLE 3: CARTE COMPACTE */}
                  {badgeStyle === 'card' && (
                    <div>
                      <div className={`text-sm font-bold ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-100' : 'text-slate-900 dark:text-slate-100'}`}>{profile.name}</div>
                      <div className={`text-xs mb-2 ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {profile.role} {profile.company && `• ${profile.company}`}
                      </div>
                      <div className={`mb-2 text-[11px] font-medium ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {badgeLang === 'en'
                          ? `Framed widget ${cardDimLabel}: status, schedule${hasTodayRdvs ? ' and daily meetings' : ''}:`
                          : `Widget encadré ${cardDimLabel} : statut, horaire${hasTodayRdvs ? ' et RDV du jour' : ''} sans coupure :`}
                      </div>
                      <div className="my-1 inline-block">
                        <img
                          key={`card-${format}-${badgeLang}-${refreshKey}`}
                          src={previewBadgeUrl}
                          alt={badgeLang === 'en' ? 'Compact availability card' : 'Carte compacte de disponibilité'}
                          className="max-w-full rounded-xl shadow-xs transition-transform hover:scale-[1.01]"
                        />
                      </div>
                    </div>
                  )}

                  {/* STYLE 4: PILL MODERNE */}
                  {badgeStyle === 'pill' && (
                    <div>
                      <div className={`text-sm font-bold ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-100' : 'text-slate-900 dark:text-slate-100'}`}>{profile.name}</div>
                      <div className={`text-xs mb-2 ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {profile.role} {profile.company && `• ${profile.company}`}
                      </div>
                      <div className={`mb-2 text-[11px] font-medium ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {badgeLang === 'en'
                          ? `Pill ${pillDimLabel}: status, schedule${hasTodayRdvs ? ' and daily meetings' : ''}:`
                          : `Capsule ${pillDimLabel} : statut, horaire${hasTodayRdvs ? ' et RDV du jour' : ''} sans coupure :`}
                      </div>
                      <div className="my-1 inline-block">
                        <img
                          key={`pill-${format}-${badgeLang}-${refreshKey}`}
                          src={previewBadgeUrl}
                          alt={badgeLang === 'en' ? 'Availability pill badge' : 'Capsule pill de disponibilité'}
                          className="max-w-full rounded-full shadow-xs transition-transform hover:scale-[1.01]"
                        />
                      </div>
                    </div>
                  )}

                  {safeProfileBookingUrl && (
                    <div className={`mt-3 text-xs font-medium ${badgeTheme === 'dark' || badgeTheme === 'transparent-dark' ? 'text-indigo-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                      {badgeLang === 'en' ? '📅 Book a meeting directly' : '📅 Prendre rendez-vous directement'}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                    Rendu fidèle pour <strong>{emailClientTab.toUpperCase()}</strong>
                  </span>
                  <div className="flex items-center gap-3">
                    <a
                      href={badgeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Tester le lien image direct
                    </a>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <a
                      href={badgeJsonUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <FileCode className="w-3 h-3" />
                      JSON texte
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Gmail-like compose footer toolbar */}
            {emailClientTab === 'gmail' && (
              <div className="bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center justify-between">
                <button className="px-4 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-xs">
                  Envoyer
                </button>
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                  <Paperclip className="w-4 h-4 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer" />
                  <Link2 className="w-4 h-4 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer" />
                  <Smile className="w-4 h-4 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer" />
                  <ImageIcon className="w-4 h-4 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer" />
                  <Trash2 className="w-4 h-4 hover:text-red-600 dark:hover:text-red-400 cursor-pointer ml-2" />
                </div>
              </div>
            )}
          </div>

          {/* Copyable Snippets Box with 1-Click Rich Copy */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Copy className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Exporter pour {emailClientTab === 'gmail' ? 'Gmail' : emailClientTab === 'outlook' ? 'Outlook' : 'Apple Mail'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Copiez directement la signature visuelle ou collez le code adapté ci-dessous.
                </p>
              </div>

              {/* 1-Click Rich Visual Copy Button */}
              <button
                onClick={handleCopyRichText}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-md shadow-indigo-100 dark:shadow-none transition-all shrink-0"
              >
                {copiedFormat === 'rich' ? (
                  <>
                    <CheckCheck className="w-4 h-4 text-emerald-300" />
                    Signature copiée (Prête à coller) !
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copier la signature visuelle (Ctrl+V)
                  </>
                )}
              </button>
            </div>

            {/* Client-specific guide notice */}
            <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800/70 text-xs text-indigo-950 dark:text-indigo-100 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                {emailClientTab === 'gmail' && (
                  <span>
                    <strong>Astuce Gmail</strong> : Cliquez sur <em>"Copier la signature visuelle"</em>, ouvrez vos paramètres Gmail &gt; Signature, et faites simplement <strong>Ctrl+V</strong> (ou <strong>Cmd+V</strong> sur Mac). Gmail collera directement votre nom, votre badge dynamique et votre lien !
                  </span>
                )}
                {emailClientTab === 'outlook' && (
                  <span>
                    <strong>Recommandation Outlook</strong> : Les versions de bureau d'Outlook n'affichent pas les SVG. Le format <strong>PNG</strong> a été automatiquement appliqué dans le code pour garantir un affichage parfait dans Outlook 365, 2019 et 2016.
                  </span>
                )}
                {emailClientTab === 'apple' && (
                  <span>
                    <strong>Astuce Apple Mail</strong> : Rendez-vous dans <em>Mail &gt; Réglages &gt; Signatures</em>. Vous pouvez coller directement la signature visuelle avec <strong>Cmd+V</strong>. Apple Mail prend en charge les formats haute résolution Retina.
                  </span>
                )}
              </div>
            </div>

            {/* Export Tabs */}
            <div className="space-y-4 pt-2">
              {/* Option A: HTML Signature */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                    Option 1 : Code HTML optimisé ({emailClientTab.toUpperCase()})
                  </div>
                  <button
                    onClick={() => handleCopyCode(generateHtmlSignature(), 'html')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer shadow-xs transition-all shrink-0"
                  >
                    {copiedFormat === 'html' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Code copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copier le code HTML
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-900 dark:bg-slate-950 text-slate-200 font-mono text-[11px] p-3 rounded-lg overflow-x-auto max-h-28 scrollbar-thin border border-transparent dark:border-slate-800">
                  <code>{generateHtmlSignature()}</code>
                </div>
              </div>

              {/* Option B: Direct Image URL */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-violet-600 dark:bg-violet-400" />
                    Option 2 : Lien direct vers l'image ({format.toUpperCase()})
                  </div>
                  <button
                    onClick={() => handleCopyCode(badgeUrl, 'url')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer shadow-xs transition-all shrink-0"
                  >
                    {copiedFormat === 'url' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        URL copiée !
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copier l'URL
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-mono text-[11px] p-2.5 rounded-lg truncate border border-slate-200 dark:border-slate-800">
                  {badgeUrl}
                </div>
              </div>

              {/* Option C: Markdown */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-600 dark:bg-slate-400" />
                    Option 3 : Code Markdown (GitHub, Notion, etc.)
                  </div>
                  <button
                    onClick={() => handleCopyCode(generateMarkdownSnippet(), 'md')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer shadow-xs transition-all shrink-0"
                  >
                    {copiedFormat === 'md' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Markdown copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copier Markdown
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-mono text-[11px] p-2.5 rounded-lg truncate border border-slate-200 dark:border-slate-800">
                  {generateMarkdownSnippet()}
                </div>
              </div>

              {/* Option D: JSON Text API */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    Option 4 : API JSON (Informations en version texte)
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={badgeJsonUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-xs transition-all shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ouvrir
                    </a>
                    <button
                      onClick={() => handleCopyCode(badgeJsonUrl, 'json')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer shadow-xs transition-all shrink-0"
                    >
                      {copiedFormat === 'json' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          URL JSON copiée !
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copier l'URL JSON
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-mono text-[11px] p-2.5 rounded-lg truncate border border-slate-200 dark:border-slate-800">
                  {badgeJsonUrl}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Renvoie en temps réel le statut anonymisé et les lignes de texte des badges (<code className="font-mono text-slate-700 dark:text-slate-300">title</code>, <code className="font-mono text-slate-700 dark:text-slate-300">subtitle</code>, <code className="font-mono text-slate-700 dark:text-slate-300">appointmentsLabel</code>, <code className="font-mono text-slate-700 dark:text-slate-300">lines</code>, <code className="font-mono text-slate-700 dark:text-slate-300">text</code>, <code className="font-mono text-slate-700 dark:text-slate-300">todayAppointmentsCount</code>) pour scripts, raccourcis ou widgets.
                </p>
              </div>

              {/* Option E: Public Status Page Link */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                    Option 5 : Lien de votre page publique
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-xs transition-all shrink-0 whitespace-nowrap"
                    >
                      <QrCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      QR Code
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(publicPageUrl, 'publicUrl')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer shadow-xs transition-all shrink-0 whitespace-nowrap"
                    >
                      {copiedFormat === 'publicUrl' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          Lien public copié !
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copier le lien public
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-mono text-[11px] p-2.5 rounded-lg truncate border border-slate-200 dark:border-slate-800">
                  {publicPageUrl}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4-Style Visual Comparison Showcase */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Comparatif direct des 4 styles (Aperçu en temps réel)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Observez les différences de structure, de dimensions et d'intégration entre les 4 formats d'images générés :
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg w-fit">
              Format actuel : <strong className="text-indigo-600 dark:text-indigo-400">{format.toUpperCase()}</strong> ({emailClientTab.toUpperCase()})
            </div>
            {onGoToSimulator && (
              <button
                type="button"
                onClick={onGoToSimulator}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/70 rounded-lg transition-colors cursor-pointer"
                title="Simuler une date et heure spécifique pour voir les badges prévus"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Ouvrir le simulateur de date & heure</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Format 1: Pill Moderne */}
          <div
            onClick={() => setBadgeStyle('pill')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
              badgeStyle === 'pill'
                ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">1. Pill Moderne</span>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md shadow-2xs">
                {pillDimLabel}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Capsule aérée sur 2 lignes (3 lignes dès qu&apos;un RDV est prévu le jour-même). Idéal sous vos coordonnées textuelles.
            </p>
            <div className={`pt-2 flex items-center justify-center p-3 rounded-xl border min-h-[70px] ${
              badgeTheme === 'dark'
                ? 'bg-slate-950 border-slate-800'
                : badgeTheme === 'transparent-dark'
                ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:12px_12px] bg-slate-900 border-slate-700'
                : badgeTheme === 'transparent'
                ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-slate-100/80 dark:bg-slate-200 border-slate-300 dark:border-slate-700'
                : 'bg-white dark:bg-slate-100 border-slate-200 dark:border-slate-700'
            }`}>
              <img
                src={buildBadgePreviewUrl(
                  appBaseUrl,
                  {
                    format,
                    style: 'pill',
                    theme: badgeTheme,
                    name: profile.name,
                    role: profile.role,
                    company: profile.company,
                    lang: badgeLang,
                  },
                  refreshKey
                )}
                alt="Aperçu Pill Moderne"
                className="max-w-full rounded-full shadow-2xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-400 dark:text-slate-500 text-[11px]">Type : Capsule {hasTodayRdvs ? '3 lignes' : '2 lignes'}</span>
              <span className={`font-semibold ${badgeStyle === 'pill' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {badgeStyle === 'pill' ? '✓ Actuellement sélectionné' : 'Cliquer pour sélectionner'}
              </span>
            </div>
          </div>

          {/* Format 2: Signature Complète */}
          <div
            onClick={() => setBadgeStyle('signature')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
              badgeStyle === 'signature'
                ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">2. Signature Complète (Tout-en-un)</span>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md shadow-2xs">
                {sigDimLabel}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Bannière complète intégrant avatar avec initiales, nom, poste/entreprise et boîte de statut (2 ou 3 lignes avec le nombre de RDV du jour).
            </p>
            <div className={`pt-2 flex items-center justify-center p-3 rounded-xl border min-h-[120px] ${
              badgeTheme === 'dark'
                ? 'bg-slate-950 border-slate-800'
                : badgeTheme === 'transparent-dark'
                ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:12px_12px] bg-slate-900 border-slate-700'
                : badgeTheme === 'transparent'
                ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-slate-100/80 dark:bg-slate-200 border-slate-300 dark:border-slate-700'
                : 'bg-white dark:bg-slate-100 border-slate-200 dark:border-slate-700'
            }`}>
              <img
                src={buildBadgePreviewUrl(
                  appBaseUrl,
                  {
                    format,
                    style: 'signature',
                    theme: badgeTheme,
                    name: profile.name,
                    role: profile.role,
                    company: profile.company,
                    lang: badgeLang,
                  },
                  refreshKey
                )}
                alt="Aperçu Signature Complète"
                className="max-w-full rounded-xl shadow-2xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-400 dark:text-slate-500 text-[11px]">Type : Bannière de visite complète</span>
              <span className={`font-semibold ${badgeStyle === 'signature' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {badgeStyle === 'signature' ? '✓ Actuellement sélectionné' : 'Cliquer pour sélectionner'}
              </span>
            </div>
          </div>

          {/* Format 3: Carte Compacte */}
          <div
            onClick={() => setBadgeStyle('card')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
              badgeStyle === 'card'
                ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">3. Carte Compacte</span>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md shadow-2xs">
                {cardDimLabel}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Widget encadré élégant avec votre nom en haut et encart de statut sur 2 lignes (3 lignes avec les RDV du jour).
            </p>
            <div className={`pt-2 flex items-center justify-center p-3 rounded-xl border min-h-[110px] ${
              badgeTheme === 'dark'
                ? 'bg-slate-950 border-slate-800'
                : badgeTheme === 'transparent-dark'
                ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:12px_12px] bg-slate-900 border-slate-700'
                : badgeTheme === 'transparent'
                ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-slate-100/80 dark:bg-slate-200 border-slate-300 dark:border-slate-700'
                : 'bg-white dark:bg-slate-100 border-slate-200 dark:border-slate-700'
            }`}>
              <img
                src={buildBadgePreviewUrl(
                  appBaseUrl,
                  {
                    format,
                    style: 'card',
                    theme: badgeTheme,
                    name: profile.name,
                    role: profile.role,
                    company: profile.company,
                    lang: badgeLang,
                  },
                  refreshKey
                )}
                alt="Aperçu Carte Compacte"
                className="max-w-full rounded-xl shadow-2xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-400 dark:text-slate-500 text-[11px]">Type : Widget encadré {hasTodayRdvs ? '3 lignes' : '2 lignes'}</span>
              <span className={`font-semibold ${badgeStyle === 'card' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {badgeStyle === 'card' ? '✓ Actuellement sélectionné' : 'Cliquer pour sélectionner'}
              </span>
            </div>
          </div>

          {/* Format 4: Point Minimaliste */}
          <div
            onClick={() => setBadgeStyle('dot')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
              badgeStyle === 'dot'
                ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">4. Point Minimaliste</span>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md shadow-2xs">
                {dotDimLabel}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Rond discret avec halo lumineux pulsant et petite pastille affichant le nombre de RDV prévus le jour-même (dès qu&apos;il y en a au moins 1).
            </p>
            <div className={`pt-2 flex items-center justify-center p-3 rounded-xl border min-h-[60px] ${
              badgeTheme === 'dark'
                ? 'bg-slate-950 border-slate-800'
                : badgeTheme === 'transparent-dark'
                ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:12px_12px] bg-slate-900 border-slate-700'
                : badgeTheme === 'transparent'
                ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-slate-100/80 dark:bg-slate-200 border-slate-300 dark:border-slate-700'
                : 'bg-white dark:bg-slate-100 border-slate-200 dark:border-slate-700'
            }`}>
              <img
                src={buildBadgePreviewUrl(
                  appBaseUrl,
                  {
                    format,
                    style: 'dot',
                    theme: badgeTheme,
                    name: profile.name,
                    role: profile.role,
                    company: profile.company,
                    lang: badgeLang,
                  },
                  refreshKey
                )}
                alt="Aperçu Point Minimaliste"
                className="h-9 w-auto shadow-2xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-400 dark:text-slate-500 text-[11px]">Type : Rond indicateur{hasTodayRdvs ? ' + pastille RDV' : ' seul'}</span>
              <span className={`font-semibold ${badgeStyle === 'dot' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {badgeStyle === 'dot' ? '✓ Actuellement sélectionné' : 'Cliquer pour sélectionner'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        url={publicPageUrl}
        profileName={profile.name}
        lang={badgeLang}
      />
    </div>
  );
};
