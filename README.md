# DispoLive 🟢🔴

> Affichez votre disponibilité en temps réel (vert/rouge) dans votre signature d'e-mail et sur le web en fonction de votre calendrier et de vos horaires de travail.

## 🚀 Déploiement sur Vercel (Recommandé)

Ce dépôt est **100% prêt pour Vercel** avec :
- Configuration Vite automatique (`vercel.json`)
- Fonctions Serverless Vercel (`/api/badge.ts`, `/api/status.ts`, `/api/fetch-ics.ts`)
- En-têtes HTTP anti-cache automatiques pour que l'image s'actualise à chaque ouverture d'e-mail

### Déploiement en 1 clic :
1. Poussez ce dépôt sur votre compte GitHub.
2. Rendez-vous sur [vercel.com/new](https://vercel.com/new) et sélectionnez votre dépôt.
3. Cliquez sur **Deploy** (aucune variable d'environnement obligatoire n'est requise).
4. Votre image dynamique est en ligne :
   - `https://votre-projet.vercel.app/api/badge.png`
   - `https://votre-projet.vercel.app/api/badge.svg`

---

## 💻 Développement Local

```bash
# Installation des dépendances
npm install

# Démarrage du serveur de développement (port 3000)
npm run dev

# Tests unitaires
npm test

# Construction pour la production
npm run build
```

---

## 📧 Intégration dans Gmail / Outlook / Apple Mail

Consultez l'onglet **Générateur de Signature** et **Guide & Astuces** directement dans l'application pour copier en 1 clic votre signature HTML ou le lien direct vers l'image `.png`.
