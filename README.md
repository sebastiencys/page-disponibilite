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

## ⚙️ Configuration Initiale & Fichiers Modèles (`.example`)

Les informations personnelles, horaires et secrets diffèrent selon chaque utilisateur. C'est pourquoi `config/personal.json`, `config/schedule.json` et `.env` sont **listés dans `.gitignore`** et ne sont jamais versionnés dans Git.

Avant de lancer l'application ou de personnaliser votre instance, copiez les fichiers modèles fournis :

```bash
cp config/personal.json.example config/personal.json
cp config/schedule.json.example config/schedule.json
cp .env.example .env
```

> 💡 **Initialisation automatique** : Si `config/personal.json` ou `config/schedule.json` est absent lors d'un `npm run dev`, `npm run build` ou d'un déploiement fraîchement cloné, le script `scripts/ensure-config.mjs` crée automatiquement une copie à partir des `.example` sans jamais écraser vos fichiers existants.

### 1. Identité publique (`config/personal.json`)

Vos informations affichées sur la page publique et dans la signature e-mail (en lecture seule côté navigateur) :

```json
{
  "name": "Prénom Nom",
  "role": "Votre Poste / Spécialité",
  "company": "Votre Entreprise / Établissement",
  "email": "prenom.nom@example.com",
  "bookingUrl": "https://calendly.com"
}
```

### 2. Horaires & Pauses Déjeuner (`config/schedule.json`)

Définissez vos plages de travail, votre fuseau de repli et votre pause déjeuner globale ou personnalisée par jour de la semaine :

```json
{
  "timezone": "Europe/Paris",
  "days": {
    "1": { "enabled": true,  "start": "09:00", "end": "18:00" },
    "2": { "enabled": true,  "start": "09:00", "end": "18:00" },
    "3": { "enabled": true,  "start": "09:00", "end": "18:00" },
    "4": { "enabled": true,  "start": "09:00", "end": "18:00" },
    "5": { "enabled": true,  "start": "09:00", "end": "17:30" },
    "6": { "enabled": false, "start": "09:00", "end": "18:00" },
    "0": { "enabled": false, "start": "09:00", "end": "18:00" }
  },
  "lunchBreak": {
    "enabled": true,
    "start": "12:30",
    "end": "13:30",
    "label": "Pause déjeuner",
    "days": {
      "4": { "enabled": true, "start": "12:00", "end": "13:00" }
    }
  },
  "bufferMinutes": 0
}
```

#### Détail des options de `config/schedule.json` :
- **`timezone`** : Fuseau horaire IANA de repli (ex. `"Europe/Paris"`, `"Indian/Reunion"`). Si la variable d'environnement `TIMEZONE` est définie dans `.env`, celle-ci est prioritaire.
- **`days`** : Horaires d'ouverture par jour de la semaine (`"0"` = Dimanche, `"1"` = Lundi, ..., `"6"` = Samedi).
  - `enabled` (`true`/`false`) : Active ou désactive la journée travaillée.
  - `start` / `end` (`"HH:MM"`) : Heures de début et de fin de la journée.
- **`lunchBreak`** : Configuration de la pause déjeuner.
  - **Horaire global** (`enabled`, `start`, `end`, `label`) : Appliqué par défaut à tous les jours travaillés.
  - **Surcharges par jour (`lunchBreak.days`)** *(optionnel)* : Permet de définir un horaire de pause spécifique pour certains jours (`"0"` à `"6"`).
    - Si un jour possède un horaire spécifique (ex. `"4"` pour le jeudi de `12:00` à `13:00`), **il a la priorité sur l'horaire global**.
    - Vous pouvez aussi définir `"enabled": false` pour un jour donné afin de désactiver la pause déjeuner uniquement ce jour-là, ou personnaliser `"label"`.
    - Si rien n'est renseigné pour un jour (absent de `days`, ou champs vides), l'application utilise automatiquement l'horaire global.
- **`bufferMinutes`** : Marge optionnelle (en minutes) ajoutée avant/après chaque créneau occupé de votre calendrier.

#### Règles de priorité & synchronisation `.ics` :
1. **Événements du calendrier `.ics` (priorité absolue)** : Les réunions et rendez-vous issus de `CALENDAR_ICS_URL` (y compris les séries récurrentes `RRULE`, `RDATE`, `EXDATE`, `RECURRENCE-ID`) priment toujours sur tout le reste :
   - Une réunion qui chevauche la pause déjeuner affiche le statut **En réunion** (et non *Pause déjeuner*).
   - Une réunion planifiée en dehors des horaires/jours de travail affiche également **En réunion**.
   - Les événements « toute la journée » sont automatiquement alignés sur les horaires des jours travaillés configurés dans `days` (et ignorés les jours où `enabled: false`).
2. **Horaires de travail** : Si le jour est désactivé ou en dehors de `start`–`end`, le statut passe en **Hors horaires**.
3. **Pause déjeuner** : Si l'heure courante entre dans la pause déjeuner effective du jour (surcharge `lunchBreak.days[jour]` ou horaire global), le statut passe en **Pause déjeuner**.
4. **Disponible** : Sinon, le badge passe au vert (**Disponible**).

---

## 💻 Développement Local

```bash
# 1. Copier et personnaliser vos configurations locales
cp config/personal.json.example config/personal.json
cp config/schedule.json.example config/schedule.json
cp .env.example .env

# 2. Installation des dépendances
npm install

# 3. Démarrage du serveur de développement (port 3000)
npm run dev

# 4. Tests unitaires
npm test

# 5. Construction pour la production
npm run build
```

---

## 📧 Intégration dans Gmail / Outlook / Apple Mail

Consultez l'onglet **Générateur de Signature** et **Guide & Astuces** directement dans le Studio pour copier en 1 clic votre signature HTML ou le lien direct vers l'image `.png`.

## 🧪 Simulateur de Disponibilité

Un onglet dédié **Simulateur** (ou accessible via `?view=simulator`) permet de choisir n'importe quelle date et heure pour observer en direct le comportement des 4 variantes de badge avec les vraies données du calendrier `.ics` et les pauses déjeuner par jour :
- **Sélecteur de date et heure** avec curseur interactif 24h.
- **Raccourcis en 1 clic** (Matinée de travail, Pause déjeuner, Soirée/Nuit, Week-end, Lundi matin, Maintenant).
- **Prévisualisation instantanée des 4 variantes** (Pill, Signature Complète, Carte Compacte, Point Minimaliste) avec bascule thème clair / sombre.
- **Support API `?time=ISO_DATE`** : permet de générer des badges PNG ou SVG pour un instant T spécifique via `/api/badge.png?time=...` ou `/api/badge.svg?time=...`.

---

## 🔒 Affichage sécurisé des prochains rendez-vous

Sur la page publique, la section **Prochains créneaux occupés** présente les plages horaires réservées de manière strictement anonymisée :
- **Confidentialité totale** : aucun titre, aucun participant, aucun lieu ni aucune description ne sont transmis au navigateur.
- **Fusion intelligente** des créneaux contigus ou qui se chevauchent.
- **Groupement par jour** avec indication de la durée du créneau.

---

## 🔐 Variables d'environnement (`.env`) & Accès au Studio (`STUDIO_PASSWORD`)

Définissez vos variables dans `.env` en local (ou dans les **Environment Variables** de Vercel) :
- **`CALENDAR_ICS_URL`** : URL secrète iCal (`.ics`) de votre agenda (jamais exposée côté client).
- **`TIMEZONE`** : Fuseau horaire IANA utilisé pour calculer votre heure locale (ex. `Europe/Paris`, `Indian/Reunion`).
- **`STUDIO_PASSWORD`** : Mot de passe pour masquer et protéger l'accès au Studio (générateur de signature, simulateur, horaires & guide) :
  - Les visiteurs de la page publique et les images de signature (`/api/badge.png`, `/api/badge.svg`) restent accessibles sans mot de passe.
  - L'accès au Studio via `/studio`, `?view=studio` ou le lien discret en pied de page demande le mot de passe configuré avant d'afficher l'interface d'administration.