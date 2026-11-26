import React, { useMemo, useState } from 'react';
import {
  FileCode,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertCircle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  convertJsonToEnvOutput,
  type EnvJsonVarName,
  type GranularScheduleEnvResult,
} from '../lib/envJson.ts';

interface EnvJsonConverterProps {
  envVarName: EnvJsonVarName;
  title: string;
  description: string;
  currentObject: unknown;
  placeholder: string;
  granularEnvOutput?: GranularScheduleEnvResult;
}

export const EnvJsonConverter: React.FC<EnvJsonConverterProps> = ({
  envVarName,
  title,
  description,
  currentObject,
  placeholder,
  granularEnvOutput,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<'json' | 'granular'>('json');
  const [rawJson, setRawJson] = useState('');
  const [copiedTarget, setCopiedTarget] = useState<'env' | 'value' | 'granular' | null>(null);

  const conversion = useMemo(
    () => (rawJson.trim() ? convertJsonToEnvOutput(rawJson, envVarName) : null),
    [rawJson, envVarName]
  );

  const handlePrefillCurrent = () => {
    setRawJson(JSON.stringify(currentObject, null, 2));
  };

  const handleCopy = async (text: string, target: 'env' | 'value' | 'granular') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 2500);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
            {title}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="px-3.5 pb-3.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 space-y-3">
          {granularEnvOutput && (() => {
            const granularPrefix = envVarName === 'PERSONAL_JSON' ? 'PROFILE_*' : 'SCHEDULE_*';
            return (
              <div className="grid grid-cols-2 gap-1 bg-slate-200/70 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveMode('json')}
                  className={`px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer truncate text-center ${
                    activeMode === 'json'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  JSON ({envVarName})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('granular')}
                  className={`px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer truncate text-center ${
                    activeMode === 'granular'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Variables {granularPrefix}
                </button>
              </div>
            );
          })()}

          {activeMode === 'granular' && granularEnvOutput ? (() => {
            const granularPrefix = envVarName === 'PERSONAL_JSON' ? 'PROFILE_*' : 'SCHEDULE_*';
            const sourceSubject = envVarName === 'PERSONAL_JSON' ? 'votre profil actif' : 'vos horaires actifs';
            return (
              <div className="space-y-2.5">
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Bloc <code className="font-mono font-semibold">.env</code> généré directement depuis {sourceSubject}, lisible et modifiable ligne par ligne.
                </p>

                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-indigo-800/70 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                      Export granulaire <code className="font-mono">{granularPrefix}</code>
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                      {granularEnvOutput.lines.length} variable{granularEnvOutput.lines.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <pre className="p-2.5 rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-44 whitespace-pre select-all leading-relaxed">
                    {granularEnvOutput.envBlock}
                  </pre>

                  <button
                    type="button"
                    onClick={() => handleCopy(granularEnvOutput.envBlock, 'granular')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    {copiedTarget === 'granular' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Variables .env copiées !</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copier le bloc {granularPrefix}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })() : (
            <>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {description}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={`env-json-input-${envVarName}`}
                  className="text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                >
                  Contenu JSON source
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePrefillCurrent}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    Pré-remplir (actuel)
                  </button>
                  {rawJson && (
                    <button
                      type="button"
                      onClick={() => setRawJson('')}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3 h-3" />
                      Effacer
                    </button>
                  )}
                </div>
              </div>

              <textarea
                id={`env-json-input-${envVarName}`}
                value={rawJson}
                onChange={e => setRawJson(e.target.value)}
                placeholder={placeholder}
                rows={7}
                spellCheck={false}
                className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-y leading-relaxed"
              />

              {conversion && !conversion.ok && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/70 text-[11px] text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{conversion.error}</span>
                </div>
              )}

              {conversion && conversion.ok && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/70 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      Variable <code className="font-mono">{envVarName}</code> prête
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                      {conversion.charCount} car.
                    </span>
                  </div>

                  <pre className="p-2.5 rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-28 whitespace-pre-wrap break-all select-all">
                    {conversion.envLine}
                  </pre>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(conversion.envLine, 'env')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      {copiedTarget === 'env' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Ligne .env copiée !</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier {envVarName}=&apos;…&apos;</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(conversion.minifiedValue, 'value')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                      title="Copier uniquement la valeur JSON minifiée (pour l'interface Vercel)"
                    >
                      {copiedTarget === 'value' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Valeur copiée !</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Copier la valeur seule (Vercel)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

