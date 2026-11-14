import React, { useState } from 'react';
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
} from 'lucide-react';
import { type AvailabilityResult, DEFAULT_PROFILE } from '../lib/availability.ts';
import type { BadgeStyle, BadgeTheme } from '../lib/badgeRenderer.ts';

interface SignatureStudioProps {
  availability: AvailabilityResult;
  profile: {
    name: string;
    role: string;
    company: string;
    email: string;
    bookingUrl: string;
  };
  onUpdateProfile?: (field: string, value: string) => void;
  appBaseUrl: string;
  onGoToSimulator?: () => void;
}

export const SignatureStudio: React.FC<SignatureStudioProps> = ({
  availability,
  profile,
  onUpdateProfile,
  appBaseUrl,
  onGoToSimulator,
}) => {
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>('pill');
  const [badgeTheme, setBadgeTheme] = useState<BadgeTheme>('light');
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [emailClientTab, setEmailClientTab] = useState<'gmail' | 'outlook' | 'apple'>('gmail');
  const [refreshKey, setRefreshKey] = useState(0);

  // When user switches to Outlook, default to PNG because Outlook Desktop Word engine doesn't render SVG
  const handleSelectClient = (client: 'gmail' | 'outlook' | 'apple') => {
    setEmailClientTab(client);
    if (client === 'outlook') {
      setFormat('png');
    }
  };

  // Build the live direct badge URL with all profile parameters
  const badgeUrl = `${appBaseUrl}/api/badge.${format}?style=${badgeStyle}&theme=${badgeTheme}&name=${encodeURIComponent(profile.name || DEFAULT_PROFILE.name)}&role=${encodeURIComponent(profile.role || DEFAULT_PROFILE.role)}&company=${encodeURIComponent(profile.company || DEFAULT_PROFILE.company)}&v=${refreshKey}`;
  const publicPageUrl = `${appBaseUrl}?view=public`;

  // HTML Signature code with bulletproof email client compatibility (tables + inline CSS)
  const generateHtmlSignature = () => {
    const isOutlook = emailClientTab === 'outlook';
    const isApple = emailClientTab === 'apple';

    const fontFamily = isOutlook
      ? "Calibri, 'Segoe UI', Arial, sans-serif"
      : isApple
      ? "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Helvetica, Arial, sans-serif"
      : "Roboto, Arial, sans-serif";

    const badgeSrc = `${appBaseUrl}/api/badge.${format}?style=${badgeStyle}&theme=${badgeTheme}&name=${encodeURIComponent(profile.name || DEFAULT_PROFILE.name)}&role=${encodeURIComponent(profile.role || DEFAULT_PROFILE.role)}&company=${encodeURIComponent(profile.company || DEFAULT_PROFILE.company)}`;

    // Style 1: Signature Complète (All-in-one banner 480x114)
    if (badgeStyle === 'signature') {
      return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: ${fontFamily}; font-size: 14px; line-height: 1.4; color: #1e293b; max-width: 480px; width: 100%;">
  <tr>
    <td style="padding-top: 4px; padding-bottom: 8px;">
      <!-- DISPOLIVE BANNIÈRE SIGNATURE COMPLÈTE (480x114) -->
      <a href="${publicPageUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
        <img src="${badgeSrc}" alt="Signature et disponibilité en direct de ${profile.name}" width="480" height="114" style="display: block; border: 0; outline: none; border-radius: 14px; max-width: 100%; height: auto;" />
      </a>
    </td>
  </tr>
  ${
    profile.bookingUrl
      ? `<tr>
    <td style="font-size: 12px; color: #4f46e5; padding-top: 4px;">
      <a href="${profile.bookingUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline; font-weight: 500;">
        📅 Prendre rendez-vous directement
      </a>
    </td>
  </tr>`
      : ''
  }
</table>`;
    }

    // Style 2: Point Minimaliste (36x36 inline with status text)
    if (badgeStyle === 'dot') {
      return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: ${fontFamily}; font-size: 14px; line-height: 1.4; color: #1e293b;">
  <tr>
    <td style="padding-bottom: 6px;">
      <span style="font-size: 16px; font-weight: 700; color: #0f172a;">${profile.name || DEFAULT_PROFILE.name}</span>
      ${profile.role ? `<br /><span style="font-size: 13px; color: #64748b;">${profile.role}${profile.company ? ` • ${profile.company}` : ''}</span>` : ''}
    </td>
  </tr>
  <tr>
    <td style="padding-top: 4px; padding-bottom: 8px;">
      <!-- DISPOLIVE POINT MINIMALISTE INLINE (36x36) -->
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="vertical-align: middle; padding-right: 8px;">
            <a href="${publicPageUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
              <img src="${badgeSrc}" alt="Statut en direct" width="36" height="36" style="display: block; border: 0; outline: none;" />
            </a>
          </td>
          <td valign="middle" style="vertical-align: middle; font-size: 12px; color: #475569;">
            <a href="${publicPageUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
              <strong style="color: #0f172a;">Disponibilité en temps réel</strong> (cliquez pour voir l'agenda)
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${
    profile.bookingUrl
      ? `<tr>
    <td style="font-size: 12px; color: #4f46e5; padding-top: 2px;">
      <a href="${profile.bookingUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline; font-weight: 500;">
        📅 Prendre rendez-vous directement
      </a>
    </td>
  </tr>`
      : ''
  }
</table>`;
    }

    // Style 3 & 4: Carte Compacte (380x100) ou Pill Moderne (400x54)
    const isCard = badgeStyle === 'card';
    const imgWidth = isCard ? 380 : 400;
    const imgHeight = isCard ? 100 : 54;
    return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: ${fontFamily}; font-size: 14px; line-height: 1.4; color: #1e293b; max-width: ${imgWidth}px; width: 100%;">
  <tr>
    <td style="padding-bottom: 8px;">
      <span style="font-size: 16px; font-weight: 700; color: #0f172a;">${profile.name || DEFAULT_PROFILE.name}</span>
      ${profile.role ? `<br /><span style="font-size: 13px; color: #64748b;">${profile.role}${profile.company ? ` • ${profile.company}` : ''}</span>` : ''}
    </td>
  </tr>
  <tr>
    <td style="padding-top: 4px; padding-bottom: 10px;">
      <!-- DISPOLIVE BADGE ${isCard ? 'CARTE COMPACTE (380x100)' : 'PILL MODERNE (400x54)'} -->
      <a href="${publicPageUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
        <img src="${badgeSrc}" alt="Disponibilité en direct de ${profile.name}" width="${imgWidth}" height="${imgHeight}" style="display: block; border: 0; outline: none; max-width: 100%; height: auto;" />
      </a>
    </td>
  </tr>
  ${
    profile.bookingUrl
      ? `<tr>
    <td style="font-size: 12px; color: #4f46e5;">
      <a href="${profile.bookingUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline; font-weight: 500;">
        📅 Prendre rendez-vous directement
      </a>
    </td>
  </tr>`
      : ''
  }
</table>`;
  };

  const generateMarkdownSnippet = () => {
    return `[![Disponibilité de ${profile.name}](${badgeUrl})](${publicPageUrl})`;
  };

  const handleCopyCode = (content: string, type: string) => {
    navigator.clipboard.writeText(content);
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-600" />
                Style & Format du Badge
              </h2>
              <button
                onClick={() => setRefreshKey(k => k + 1)}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium cursor-pointer"
                title="Rafraîchir le rendu"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Actualiser
              </button>
            </div>

            {/* Badge Style Selector */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Style de la pastille
                </label>
                <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  {badgeStyle === 'pill' && '400 × 54 px • Capsule 2 Lignes'}
                  {badgeStyle === 'signature' && '480 × 114 px • Tout-en-un'}
                  {badgeStyle === 'card' && '380 × 100 px • Widget 2 Lignes'}
                  {badgeStyle === 'dot' && '36 × 36 px • Discret'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    id: 'pill',
                    label: 'Pill Moderne',
                    size: '400 × 54 px',
                    desc: 'Capsule 2 lignes : statut + horaire',
                    badge: '💊 2 Lignes',
                    bgPreview: 'rounded-full h-4 bg-emerald-100 border border-emerald-400 flex items-center px-1.5 gap-1',
                  },
                  {
                    id: 'signature',
                    label: 'Signature Complète',
                    size: '480 × 114 px',
                    desc: 'Avatar + Nom + Statut multiligne',
                    badge: '👤 Tout-en-un',
                    bgPreview: 'rounded-md h-7 bg-slate-100 border border-slate-300 p-1 flex items-center gap-1.5',
                  },
                  {
                    id: 'card',
                    label: 'Carte Compacte',
                    size: '380 × 100 px',
                    desc: 'Widget encadré avec statut 2 lignes',
                    badge: '🗂️ Widget',
                    bgPreview: 'rounded-md h-6 bg-slate-100 border border-slate-300 p-1 flex flex-col justify-between',
                  },
                  {
                    id: 'dot',
                    label: 'Point Minimaliste',
                    size: '36 × 36 px',
                    desc: 'Rond discret avec halo pulsant',
                    badge: '🟢 36px',
                    bgPreview: 'w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-emerald-300 mx-auto my-1',
                  },
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => setBadgeStyle(s.id as BadgeStyle)}
                    className={`p-3 text-left rounded-xl border text-xs transition-all cursor-pointer relative overflow-hidden ${
                      badgeStyle === s.id
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 font-semibold ring-2 ring-indigo-500/30 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">{s.label}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {s.badge}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-normal leading-tight">{s.desc}</div>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Dimensions :</span>
                      <span className="font-mono font-semibold text-slate-600">{s.size}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Format: PNG vs SVG */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Format d'image recommandé
                </label>
                {emailClientTab === 'outlook' && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    PNG requis pour Outlook
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormat('png')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    format === 'png'
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                    PNG
                  </div>
                  <div>
                    <div className="text-xs font-bold">Format PNG</div>
                    <div className="text-[11px] text-slate-500">
                      Recommandé pour Outlook, Gmail & tous clients
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setFormat('svg')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    format === 'svg'
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs shrink-0">
                    SVG
                  </div>
                  <div>
                    <div className="text-xs font-bold">Format SVG</div>
                    <div className="text-[11px] text-slate-500">
                      Vectoriel Retina avec halo lumineux animé
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Theme Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
                Thème de fond
              </label>
              <div className="flex gap-2">
                {[
                  { id: 'light', label: 'Clair (Standard e-mail)' },
                  { id: 'dark', label: 'Sombre' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setBadgeTheme(t.id as BadgeTheme)}
                    className={`flex-1 py-2 px-3 text-xs rounded-lg border font-medium cursor-pointer transition-all ${
                      badgeTheme === t.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Profile Details for the Signature (Read-only from config/personal.json) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  Vos Informations Personnelles
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Identité affichée dans la signature et sur votre page publique de disponibilité.
                </p>
              </div>

              {/* JSON Badge */}
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-mono font-medium border border-slate-200"
                title="Configuré dans config/personal.json"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                config/personal.json
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Ces informations sont <strong>sécurisées et protégées en lecture seule</strong> dans <code className="text-slate-800 font-mono font-semibold">config/personal.json</code> pour empêcher toute modification par des tiers.
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nom complet</label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 select-all flex items-center justify-between">
                  <span>{profile.name}</span>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Poste / Métier</label>
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 select-all flex items-center justify-between">
                    <span className="truncate">{profile.role || '—'}</span>
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Entreprise</label>
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 select-all flex items-center justify-between">
                    <span className="truncate">{profile.company || '—'}</span>
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Adresse e-mail</label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono text-slate-700 select-all flex items-center justify-between">
                  <span className="truncate">{profile.email || '—'}</span>
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Lien de prise de rendez-vous
                </label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-700 select-all flex items-center justify-between">
                  {profile.bookingUrl ? (
                    <a
                      href={profile.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 truncate underline flex items-center gap-1.5"
                    >
                      <span className="truncate">{profile.bookingUrl}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">Non configuré</span>
                  )}
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Email Simulator & Embed Code */}
        <div className="lg:col-span-7 space-y-6">
          {/* Client-Specific Simulated Email Window */}
          <div className="bg-white rounded-2xl border border-slate-300 shadow-md overflow-hidden transition-all">
            {/* 1. Header Bar adapts according to active client */}
            {emailClientTab === 'gmail' && (
              <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-red-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    M
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    Nouveau message (Google Workspace / Gmail)
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <Minus className="w-3.5 h-3.5 hover:text-slate-700 cursor-pointer" />
                  <Maximize2 className="w-3 h-3 hover:text-slate-700 cursor-pointer" />
                  <X className="w-3.5 h-3.5 hover:text-slate-700 cursor-pointer" />
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
              <div className="bg-slate-200/90 border-b border-slate-300 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                  <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                  <span className="ml-2 text-xs font-semibold text-slate-700">
                    Nouveau message — Apple Mail (Mac & iOS)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-1 rounded bg-white text-slate-700 shadow-xs border border-slate-200">
                    <Send className="w-3.5 h-3.5 text-blue-500" />
                  </button>
                  <button className="p-1 rounded bg-white text-slate-700 shadow-xs border border-slate-200">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              </div>
            )}

            {/* Email client switcher bar */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Changer de logiciel de messagerie :
              </span>
              <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg text-xs">
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
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>{client.icon}</span>
                    <span>{client.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Email Header Fields */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-white space-y-2 text-xs text-slate-600">
              <div className="flex items-center">
                <span className="w-16 font-semibold text-slate-400">À :</span>
                <span className="text-slate-700 font-medium">contact.client@example.com</span>
              </div>
              <div className="flex items-center">
                <span className="w-16 font-semibold text-slate-400">Objet :</span>
                <span className="text-slate-900 font-semibold">
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
              className={`p-6 sm:p-8 space-y-6 bg-white min-h-[290px] ${
                emailClientTab === 'outlook'
                  ? "font-['Calibri','Segoe_UI',sans-serif]"
                  : emailClientTab === 'apple'
                  ? "font-['-apple-system','SF_Pro_Text',sans-serif]"
                  : 'font-sans'
              }`}
            >
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
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
                    ? 'border-t border-slate-400/60'
                    : 'border-t border-slate-200/80'
                }`}
              >
                <div
                  className={`p-4 rounded-xl transition-all ${
                    emailClientTab === 'outlook'
                      ? 'bg-blue-50/30 border border-blue-200/80'
                      : emailClientTab === 'apple'
                      ? 'bg-slate-50 border border-slate-200'
                      : 'bg-slate-50/80 border border-dashed border-slate-300'
                  }`}
                >
                  {/* STYLE 1: SIGNATURE COMPLÈTE (480x114 banner) */}
                  {badgeStyle === 'signature' && (
                    <div>
                      <div className="mb-2.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        Format Tout-en-un (480 × 114 px) : Avatar, nom, poste et statut multiligne sans coupure
                      </div>
                      <div className="my-1 block">
                        <img
                          key={`signature-${format}-${refreshKey}`}
                          src={badgeUrl}
                          alt="Signature complète et statut en direct"
                          className="max-w-full rounded-xl shadow-xs transition-transform hover:scale-[1.01]"
                        />
                      </div>
                    </div>
                  )}

                  {/* STYLE 2: POINT MINIMALISTE (36x36) */}
                  {badgeStyle === 'dot' && (
                    <div>
                      <div className="text-sm font-bold text-slate-900">{profile.name}</div>
                      <div className="text-xs text-slate-500 mb-2.5">
                        {profile.role} {profile.company && `• ${profile.company}`}
                      </div>
                      <div className="my-1.5 flex items-center gap-3 p-2.5 bg-white rounded-lg border border-slate-200 w-fit shadow-xs">
                        <img
                          key={`dot-${format}-${refreshKey}`}
                          src={badgeUrl}
                          alt="Point de disponibilité"
                          className="w-9 h-9 rounded-full shrink-0"
                        />
                        <div className="text-xs leading-snug">
                          <span className="font-semibold text-slate-800 block">Disponibilité en direct</span>
                          <span className="text-[11px] text-slate-500">Statut calculé en temps réel</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STYLE 3: CARTE COMPACTE (380x100) */}
                  {badgeStyle === 'card' && (
                    <div>
                      <div className="text-sm font-bold text-slate-900">{profile.name}</div>
                      <div className="text-xs text-slate-500 mb-2">
                        {profile.role} {profile.company && `• ${profile.company}`}
                      </div>
                      <div className="mb-2 text-[11px] text-slate-500 font-medium">
                        Widget encadré 380 × 100 px : statut et horaire sur 2 lignes sans coupure :
                      </div>
                      <div className="my-1 inline-block">
                        <img
                          key={`card-${format}-${refreshKey}`}
                          src={badgeUrl}
                          alt="Carte compacte de disponibilité"
                          className="max-w-full rounded-xl shadow-xs transition-transform hover:scale-[1.01]"
                        />
                      </div>
                    </div>
                  )}

                  {/* STYLE 4: PILL MODERNE (400x54) */}
                  {badgeStyle === 'pill' && (
                    <div>
                      <div className="text-sm font-bold text-slate-900">{profile.name}</div>
                      <div className="text-xs text-slate-500 mb-2">
                        {profile.role} {profile.company && `• ${profile.company}`}
                      </div>
                      <div className="mb-2 text-[11px] text-slate-500 font-medium">
                        Capsule 400 × 54 px : statut et horaire sur 2 lignes complètes sans coupure :
                      </div>
                      <div className="my-1 inline-block">
                        <img
                          key={`pill-${format}-${refreshKey}`}
                          src={badgeUrl}
                          alt="Capsule pill de disponibilité"
                          className="max-w-full rounded-full shadow-xs transition-transform hover:scale-[1.01]"
                        />
                      </div>
                    </div>
                  )}

                  {profile.bookingUrl && (
                    <div className="mt-3 text-xs text-indigo-600 font-medium">
                      📅 Prendre rendez-vous directement
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    Rendu fidèle pour <strong>{emailClientTab.toUpperCase()}</strong>
                  </span>
                  <a
                    href={badgeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline flex items-center gap-1 font-medium"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Tester le lien image direct
                  </a>
                </div>
              </div>
            </div>

            {/* Gmail-like compose footer toolbar */}
            {emailClientTab === 'gmail' && (
              <div className="bg-slate-100 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between">
                <button className="px-4 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-xs">
                  Envoyer
                </button>
                <div className="flex items-center gap-3 text-slate-500">
                  <Paperclip className="w-4 h-4 hover:text-slate-800 cursor-pointer" />
                  <Link2 className="w-4 h-4 hover:text-slate-800 cursor-pointer" />
                  <Smile className="w-4 h-4 hover:text-slate-800 cursor-pointer" />
                  <ImageIcon className="w-4 h-4 hover:text-slate-800 cursor-pointer" />
                  <Trash2 className="w-4 h-4 hover:text-red-600 cursor-pointer ml-2" />
                </div>
              </div>
            )}
          </div>

          {/* Copyable Snippets Box with 1-Click Rich Copy */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Copy className="w-4 h-4 text-indigo-600" />
                  Exporter pour {emailClientTab === 'gmail' ? 'Gmail' : emailClientTab === 'outlook' ? 'Outlook' : 'Apple Mail'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Copiez directement la signature visuelle ou collez le code adapté ci-dessous.
                </p>
              </div>

              {/* 1-Click Rich Visual Copy Button */}
              <button
                onClick={handleCopyRichText}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-md shadow-indigo-100 transition-all shrink-0"
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
            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-950 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
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
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                    Option 1 : Code HTML optimisé ({emailClientTab.toUpperCase()})
                  </div>
                  <button
                    onClick={() => handleCopyCode(generateHtmlSignature(), 'html')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 cursor-pointer shadow-xs transition-all"
                  >
                    {copiedFormat === 'html' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
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
                <div className="bg-slate-900 text-slate-200 font-mono text-[11px] p-3 rounded-lg overflow-x-auto max-h-28 scrollbar-thin">
                  <code>{generateHtmlSignature()}</code>
                </div>
              </div>

              {/* Option B: Direct Image URL */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-violet-600" />
                    Option 2 : Lien direct vers l'image ({format.toUpperCase()})
                  </div>
                  <button
                    onClick={() => handleCopyCode(badgeUrl, 'url')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 cursor-pointer shadow-xs transition-all"
                  >
                    {copiedFormat === 'url' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
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
                <div className="bg-slate-100 text-slate-700 font-mono text-[11px] p-2.5 rounded-lg truncate border border-slate-200">
                  {badgeUrl}
                </div>
              </div>

              {/* Option C: Markdown */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-600" />
                    Option 3 : Code Markdown (GitHub, Notion, etc.)
                  </div>
                  <button
                    onClick={() => handleCopyCode(generateMarkdownSnippet(), 'md')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 cursor-pointer shadow-xs transition-all"
                  >
                    {copiedFormat === 'md' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
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
                <div className="bg-slate-100 text-slate-700 font-mono text-[11px] p-2.5 rounded-lg truncate border border-slate-200">
                  {generateMarkdownSnippet()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4-Style Visual Comparison Showcase */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Palette className="w-5 h-5 text-indigo-600" />
              Comparatif direct des 4 styles (Aperçu en temps réel)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Observez les différences de structure, de dimensions et d'intégration entre les 4 formats d'images générés :
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg w-fit">
              Format actuel : <strong className="text-indigo-600">{format.toUpperCase()}</strong> ({emailClientTab.toUpperCase()})
            </div>
            {onGoToSimulator && (
              <button
                type="button"
                onClick={onGoToSimulator}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                title="Simuler une date et heure spécifique pour voir les badges prévus"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
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
                ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20 shadow-sm'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-bold text-sm text-slate-900">1. Pill Moderne</span>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md shadow-2xs">
                400 × 54 px
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Capsule aérée sur 2 lignes sans coupure : statut en gras au-dessus et détail horaire complet en dessous. Idéal sous vos coordonnées textuelles.
            </p>
            <div className="pt-2 flex items-center justify-center p-3 bg-white rounded-xl border border-slate-200 min-h-[70px]">
              <img
                src={`${appBaseUrl}/api/badge.${format}?style=pill&theme=${badgeTheme}&name=${encodeURIComponent(profile.name || DEFAULT_PROFILE.name)}&role=${encodeURIComponent(profile.role || DEFAULT_PROFILE.role)}&company=${encodeURIComponent(profile.company || DEFAULT_PROFILE.company)}&v=${refreshKey}`}
                alt="Aperçu Pill Moderne"
                className="max-w-full rounded-full shadow-2xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-400 text-[11px]">Type : Capsule 2 lignes</span>
              <span className={`font-semibold ${badgeStyle === 'pill' ? 'text-indigo-600' : 'text-slate-500'}`}>
                {badgeStyle === 'pill' ? '✓ Actuellement sélectionné' : 'Cliquer pour sélectionner'}
              </span>
            </div>
          </div>

          {/* Format 2: Signature Complète */}
          <div
            onClick={() => setBadgeStyle('signature')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
              badgeStyle === 'signature'
                ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20 shadow-sm'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="font-bold text-sm text-slate-900">2. Signature Complète (Tout-en-un)</span>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md shadow-2xs">
                480 × 114 px
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Bannière de prestige spacieuse intégrant avatar avec initiales, nom complet, poste/entreprise et boîte de statut multiligne. Remplace toute signature textuelle !
            </p>
            <div className="pt-2 flex items-center justify-center p-3 bg-white rounded-xl border border-slate-200 min-h-[120px]">
              <img
                src={`${appBaseUrl}/api/badge.${format}?style=signature&theme=${badgeTheme}&name=${encodeURIComponent(profile.name || DEFAULT_PROFILE.name)}&role=${encodeURIComponent(profile.role || DEFAULT_PROFILE.role)}&company=${encodeURIComponent(profile.company || DEFAULT_PROFILE.company)}&v=${refreshKey}`}
                alt="Aperçu Signature Complète"
                className="max-w-full rounded-xl shadow-2xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-400 text-[11px]">Type : Bannière de visite complète</span>
              <span className={`font-semibold ${badgeStyle === 'signature' ? 'text-indigo-600' : 'text-slate-500'}`}>
                {badgeStyle === 'signature' ? '✓ Actuellement sélectionné' : 'Cliquer pour sélectionner'}
              </span>
            </div>
          </div>

          {/* Format 3: Carte Compacte */}
          <div
            onClick={() => setBadgeStyle('card')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
              badgeStyle === 'card'
                ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20 shadow-sm'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="font-bold text-sm text-slate-900">3. Carte Compacte</span>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md shadow-2xs">
                380 × 100 px
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Widget encadré élégant avec votre nom en haut et encart de statut à double ligne (statut en gras + horaire détaillé) parfaitement lisible.
            </p>
            <div className="pt-2 flex items-center justify-center p-3 bg-white rounded-xl border border-slate-200 min-h-[110px]">
              <img
                src={`${appBaseUrl}/api/badge.${format}?style=card&theme=${badgeTheme}&name=${encodeURIComponent(profile.name || DEFAULT_PROFILE.name)}&role=${encodeURIComponent(profile.role || DEFAULT_PROFILE.role)}&company=${encodeURIComponent(profile.company || DEFAULT_PROFILE.company)}&v=${refreshKey}`}
                alt="Aperçu Carte Compacte"
                className="max-w-full rounded-xl shadow-2xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-400 text-[11px]">Type : Widget encadré 2 lignes</span>
              <span className={`font-semibold ${badgeStyle === 'card' ? 'text-indigo-600' : 'text-slate-500'}`}>
                {badgeStyle === 'card' ? '✓ Actuellement sélectionné' : 'Cliquer pour sélectionner'}
              </span>
            </div>
          </div>

          {/* Format 4: Point Minimaliste */}
          <div
            onClick={() => setBadgeStyle('dot')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
              badgeStyle === 'dot'
                ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20 shadow-sm'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="font-bold text-sm text-slate-900">4. Point Minimaliste</span>
              </div>
              <span className="text-[11px] font-mono font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md shadow-2xs">
                36 × 36 px
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Rond discret 36x36 avec halo lumineux pulsant. Parfait si vous souhaitez ajouter votre propre texte à côté ou le glisser à côté d'icônes de réseaux sociaux.
            </p>
            <div className="pt-2 flex items-center justify-center p-3 bg-white rounded-xl border border-slate-200 min-h-[60px]">
              <img
                src={`${appBaseUrl}/api/badge.${format}?style=dot&theme=${badgeTheme}&name=${encodeURIComponent(profile.name || DEFAULT_PROFILE.name)}&role=${encodeURIComponent(profile.role || DEFAULT_PROFILE.role)}&company=${encodeURIComponent(profile.company || DEFAULT_PROFILE.company)}&v=${refreshKey}`}
                alt="Aperçu Point Minimaliste"
                className="w-9 h-9 rounded-full shadow-2xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-slate-400 text-[11px]">Type : Rond indicateur seul</span>
              <span className={`font-semibold ${badgeStyle === 'dot' ? 'text-indigo-600' : 'text-slate-500'}`}>
                {badgeStyle === 'dot' ? '✓ Actuellement sélectionné' : 'Cliquer pour sélectionner'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
