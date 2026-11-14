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

## ⚙️ Configuration Sécurisée (Fichiers JSON)

Pour garantir la sécurité et la fiabilité des informations affichées, les réglages clés sont **protégés en lecture seule** dans les fichiers JSON du dossier `config/` :

- **`config/personal.json`** : Vos informations personnelles (nom complet, poste, entreprise, e-mail, lien de prise de rendez-vous Calendly/Cal.com).
  ```json
  {
    "name": "Alexandre Martin",
    "role": "Consultant & Développeur Web",
    "company": "Digital Solutions",
    "email": "alexandre@example.com",
    "bookingUrl": "https://calendly.com"
  }
  ```
- **`config/schedule.json`** : Vos horaires de travail par jour de la semaine et votre pause déjeuner.

Ces fichiers sont lus automatiquement par l'application et ne peuvent pas être modifiés depuis l'interface web par des tiers.

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

## 🧪 Simulateur de Disponibilité

Un onglet dédié **Simulateur** (ou accessible via `?view=simulator`) permet de choisir n'importe quelle date et heure de la semaine pour observer en direct le comportement des 4 variantes de badge :
- **Sélecteur de date et heure** avec curseur interactif 24h.
- **Raccourcis en 1 clic** (Matinée de travail, Pause déjeuner, Soirée/Nuit, Week-end, Lundi matin, Maintenant).
- **Prévisualisation instantanée des 4 variantes** (Pill, Signature Complète, Carte Compacte, Point Minimaliste) avec bascule thème clair / sombre.
- **Support API `?time=ISO_DATE`** : permet de générer des badges PNG ou SVG pour un instant T spécifique via `/api/badge.png?time=...` ou `/api/badge.svg?time=...`.

---

## TODO
- Cacher le studio derrière un mot de passe (inscrit dans le .env)
- Afficher la liste des prochains RDV tout en restant secret (pas de nom, pas de participants)