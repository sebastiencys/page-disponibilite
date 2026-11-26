import React from 'react';
import {
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  Server,
  Layers,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

export const EmailGuideModal: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/70 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
          <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Comprendre & Configurer
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
          Comment fonctionne une image dynamique dans un e-mail ?
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Découvrez les coulisses techniques et suivez le tutoriel pas-à-pas pour intégrer votre badge dans Gmail, Outlook ou Apple Mail.
        </p>
      </div>

      {/* Explanatory Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 flex items-center justify-center">
            <Server className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">1. Génération à la volée</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Plutôt qu'un fichier figé sur disque, notre serveur calcule en une fraction de seconde votre disponibilité exacte (agenda + horaires) chaque fois que l'image est appelée.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">2. En-têtes Anti-Cache</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            L'image est servie avec <code className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded text-[10px]">Cache-Control: no-cache, no-store</code>. Ainsi, à chaque fois qu'un correspondant ouvre votre e-mail, son client télécharge le statut le plus récent.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">3. Formats PNG & SVG</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Le format <strong>PNG</strong> garantit une compatibilité totale avec tous les clients (y compris Outlook desktop). Le <strong>SVG</strong> offre un rendu vectoriel Retina ultra-net avec animations.
          </p>
        </div>
      </div>

      {/* Webmail Proxy Cache Notice */}
      <div className="rounded-2xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 p-5 flex items-start gap-3.5">
        <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
          <p className="font-bold">À savoir : cache proxy des webmails (Gmail &amp; Apple Mail)</p>
          <p className="text-amber-900/90 dark:text-amber-200/90">
            Gmail (<code className="font-mono bg-amber-100/80 dark:bg-amber-900/60 px-1 py-0.5 rounded text-[11px]">googleusercontent.com</code>) et{' '}
            <strong>Apple Mail Privacy Protection</strong> passent les images par leurs propres serveurs proxy et peuvent conserver en cache l'image d'un e-mail déjà ouvert pendant plusieurs minutes à quelques heures. En revanche, chaque nouvel e-mail ouvert déclenche un appel frais, et le lien cliquable vers votre <strong>page publique</strong> (ainsi que le flux <code className="font-mono">/api/badge.json</code>) reflète toujours votre statut à la seconde près.
          </p>
        </div>
      </div>

      {/* Step by Step Tutorials */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-8">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Guide d'installation pas-à-pas par messagerie
        </h2>

        {/* Gmail Guide */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
            <div className="w-6 h-6 rounded-md bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-300 flex items-center justify-center font-bold text-xs">
              G
            </div>
            Pour Gmail (Google Workspace & Personnel)
          </div>
          <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 ml-2">
            <li>Dans DispoLive, allez dans l'onglet <strong>Générateur de Signature</strong> et cliquez sur <strong>Copier la signature visuelle (Ctrl+V)</strong> (ou copiez le <strong>Lien direct vers l'image (.png)</strong>).</li>
            <li>Ouvrez Gmail sur votre navigateur et cliquez sur la <strong>Roue crantée ⚙️</strong> en haut à droite &gt; <strong>Voir tous les paramètres</strong>.</li>
            <li>Faites défiler jusqu'à la section <strong>Signature</strong>.</li>
            <li>Collez directement avec <strong>Ctrl+V</strong> / <strong>Cmd+V</strong>, ou utilisez l'icône <strong>Insérer une image 🖼️</strong> &gt; <strong>"Adresse Web (URL)"</strong> pour n'ajouter que le badge.</li>
            <li>Gmail affiche immédiatement le voyant dynamique ! Cliquez sur <strong>Enregistrer les modifications</strong> en bas de page.</li>
          </ol>
        </div>

        {/* Outlook Guide */}
        <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
            <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-xs">
              O
            </div>
            Pour Microsoft Outlook
          </div>
          <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 ml-2">
            <li>Dans DispoLive, cliquez sur <strong>Copier le code HTML</strong> dans l'onglet Signature.</li>
            <li>Dans Outlook Web : Paramètres &gt; Courrier &gt; Composer et répondre &gt; Signature électronique &gt; Collez le code.</li>
            <li>Dans Outlook Desktop : Fichier &gt; Options &gt; Courrier &gt; Signatures &gt; Collez le bloc de signature ou insérez l'image en cochant "Lier au fichier" lors de l'insertion d'image.</li>
          </ol>
        </div>

        {/* Apple Mail */}
        <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
            <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs">
              A
            </div>
            Pour Apple Mail (Mac & iOS)
          </div>
          <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 ml-2">
            <li>Ouvrez Mail &gt; Préférences &gt; <strong>Signatures</strong>.</li>
            <li>Collez la signature HTML générée directement dans l'éditeur de signature.</li>
            <li>Apple Mail affichera automatiquement le badge interactif avec son lien vers votre page publique !</li>
          </ol>
        </div>
      </div>

      {/* Vercel Deployment Card */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-6 sm:p-8 text-white shadow-xl space-y-5 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center font-black text-lg">
            ▲
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold">
              Déploiement en 1 Clic sur Vercel
            </h2>
            <p className="text-xs text-slate-300">
              Le dépôt est 100% configuré pour Vercel (avec vercel.json et Vercel Serverless Functions dans /api).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-white/10 border border-white/10 space-y-2">
            <div className="text-xs font-bold text-indigo-300">Étape 1 : GitHub</div>
            <p className="text-xs text-slate-200">
              Poussez ce projet sur votre compte GitHub (ou téléchargez les fichiers du dépôt).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/10 border border-white/10 space-y-2">
            <div className="text-xs font-bold text-indigo-300">Étape 2 : Importer sur Vercel</div>
            <p className="text-xs text-slate-200">
              Sur <a href="https://vercel.com/new" target="_blank" rel="noreferrer" className="underline hover:text-white">vercel.com/new</a>, sélectionnez votre dépôt GitHub. Vercel détecte automatiquement Vite et les Serverless Functions.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/10 border border-white/10 space-y-2">
            <div className="text-xs font-bold text-indigo-300">Étape 3 : Déployer !</div>
            <p className="text-xs text-slate-200">
              Cliquez sur <strong>Deploy</strong>. Votre image dynamique sera instantanément accessible sur <code className="bg-black/40 px-1 py-0.5 rounded text-[11px]">https://votre-projet.vercel.app/api/badge.png</code> !
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-300 font-mono space-y-1">
          <div className="text-slate-400 text-[11px] font-sans font-medium">Ou via la CLI Vercel :</div>
          <div className="text-emerald-400">npm install -g vercel</div>
          <div className="text-emerald-400">vercel --prod</div>
        </div>
      </div>
    </div>
  );
};
