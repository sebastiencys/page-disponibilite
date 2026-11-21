import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, QrCode, X } from 'lucide-react';
import { generateQrMatrix, renderQrSvg } from '../lib/qrcode.ts';
import type { AppLang } from '../lib/availability.ts';
import { copyTextToClipboard } from '../lib/clipboard.ts';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  profileName?: string;
  lang?: AppLang;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  onClose,
  url,
  profileName,
  lang = 'fr',
}) => {
  const [copied, setCopied] = useState(false);
  const isEn = lang === 'en';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const qrData = useMemo(() => {
    if (!isOpen || !url) return null;
    try {
      const matrix = generateQrMatrix(url);
      const margin = 3;
      const totalSize = matrix.size + margin * 2;
      const parts: string[] = [];
      for (let r = 0; r < matrix.size; r++) {
        for (let c = 0; c < matrix.size; c++) {
          if (matrix.modules[r][c]) {
            parts.push(`M${c + margin},${r + margin}h1v1h-1z`);
          }
        }
      }
      return { totalSize, pathData: parts.join('') };
    } catch {
      return null;
    }
  }, [isOpen, url]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await copyTextToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (typeof document === 'undefined') return;
    const svg = renderQrSvg(url, {
      title: profileName ? `${profileName} — DispoLive` : 'DispoLive QR Code',
    });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'dispolive-qr.svg';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-modal-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 id="qr-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                {isEn ? 'Share via QR Code' : 'Partager par QR Code'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEn ? 'Direct mobile access to live status' : 'Accès mobile direct au statut en direct'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close QR modal' : 'Fermer la fenêtre QR Code'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
          {qrData ? (
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox={`0 0 ${qrData.totalSize} ${qrData.totalSize}`}
                shapeRendering="crispEdges"
                className="w-48 h-48 block"
                role="img"
                aria-label={isEn ? `QR Code for ${url}` : `QR Code pour ${url}`}
              >
                <rect width={qrData.totalSize} height={qrData.totalSize} fill="#ffffff" rx="2" />
                <path d={qrData.pathData} fill="#0f172a" />
              </svg>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8">
              {isEn ? 'URL too long to generate QR code.' : 'URL trop longue pour générer le QR Code.'}
            </p>
          )}
        </div>

        <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 truncate">
          {url}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isEn ? 'Link copied!' : 'Lien copié !'}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{isEn ? 'Copy link' : 'Copier le lien'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadSvg}
            disabled={!qrData}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isEn ? 'Download SVG' : 'Télécharger SVG'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
