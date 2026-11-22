# DispoLive 🟢🔴

> Affichez votre disponibilité en temps réel (vert/rouge) dans votre signature d'e-mail et sur le web en fonction de votre calendrier et de vos horaires de travail.

## 🚀 Déploiement sur Vercel (Recommandé)

Ce dépôt est **100% prêt pour Vercel** avec :
- Configuration Vite automatique (`vercel.json`)
- Fonctions Serverless Vercel (`/api/badge.ts`, `/api/status.ts`, `/api/health.ts`, `/api/calendar-refresh.ts`, `/api/fetch-ics.ts`)
- En-têtes HTTP anti-cache automatiques pour que l'image s'actualise à chaque ouverture d'e-mail

### Déploiement en 1 clic :
1. Poussez ce dépôt sur votre compte GitHub.
2. Rendez-vous sur [vercel.com/new](https://vercel.com/new) et sélectionnez votre dépôt.
3. Cliquez sur **Deploy** (aucune variable d'environnement obligatoire n'est requise).
4. Votre image dynamique et son flux texte JSON sont en ligne :
   - `https://votre-projet.vercel.app/api/badge.png`
   - `https://votre-projet.vercel.app/api/badge.svg`
   - `https://votre-projet.vercel.app/api/badge.json` (version texte structurée : `status`, `title`, `subtitle`, `appointmentsLabel`, `lines`, `text`, `todayAppointmentsCount`, …)

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
  "bookingUrl": "https://calendly.com",
  "mode": "person"
}
```

- **`email`** / **`bookingUrl`** : Optionnels. Définissez à `null` ou `""` pour masquer automatiquement les boutons *Prendre rendez-vous* / *Envoyer un e-mail*.
- **`mode`** *(optionnel, défaut `"person"`)* : Adapte automatiquement les libellés entre `"person"` (**Disponible** / **Repos** / *Hors horaires de travail* / *Horaires habituels de travail*) et `"shop"` (**Ouvert** / **Fermé** / *Horaires d'ouverture*). Peut être surchargé via `PROFILE_MODE` ou `?mode=shop|person`.

> 💡 **Alternative 100 % `.env` (multi-dépôts / Vercel)** : Vous pouvez tout regrouper dans **une seule variable** `PERSONAL_JSON='{"name":...}'` et `SCHEDULE_JSON='{"timezone":...}'` dans `.env` ou sur Vercel — le Studio intègre un **convertisseur JSON → `.env`** dans les onglets *Signature* et *Agenda & Horaires* pour compresser vos JSON et les copier en 1 clic. Les variables unitaires **`PROFILE_*`** et **`SCHEDULE_*`** *(horaires globaux, jours travaillés, surcharges par jour `_MON`/`_LUN`/`_1`, pauses, fermetures)* restent aussi supportées et sont prioritaires sur les JSON.

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
- **`closures`** *(optionnel)* : Liste de jours fériés ou congés planifiés (`{ "startDate": "2026-12-25", "endDate": "2026-12-25", "label": "Noël", "type": "holiday", "annual": true }`). Passe automatiquement le statut en `HOLIDAY` (sans exposer d'informations sensibles) et saute la période dans le calcul de `Reprise …`.

#### Règles de priorité & synchronisation `.ics` :
1. **Événements du calendrier `.ics` (priorité absolue)** : Les réunions et rendez-vous issus de `CALENDAR_ICS_URL` (y compris les séries récurrentes `RRULE`, `RDATE`, `EXDATE`, `RECURRENCE-ID`) priment toujours sur tout le reste :
   - Une réunion qui chevauche la pause déjeuner affiche le statut **En réunion** (et non *Pause déjeuner*).
   - Une réunion planifiée en dehors des horaires/jours de travail affiche également **En réunion**.
   - Les événements « toute la journée » sont automatiquement alignés sur les horaires configurés dans `days` pour chaque jour concerné (**y compris si ce jour a `enabled: false`** : la réunion reste alors affichée dans les créneaux occupés et prioritaire sur « Hors horaires »).
2. **Horaires de travail** : Si le jour est désactivé ou en dehors de `start`–`end`, le statut passe en **Hors horaires**.
3. **Pause déjeuner** : Si l'heure courante entre dans la pause déjeuner effective du jour (surcharge `lunchBreak.days[jour]` ou horaire global), le statut passe en **Pause déjeuner**.
4. **Disponible & Reprise intelligente** : Sinon, le badge passe au vert (**Disponible**). Lorsqu'un événement toute la journée ou une plage hors horaires bloque la reprise, l'indication **Reprise …** saute automatiquement les jours fériés/off et les journées entièrement occupées pour afficher le vrai moment de disponibilité suivante.

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
- **Support API `?time=ISO_DATE`** : permet de générer des badges PNG, SVG ou JSON pour un instant T spécifique.

---

## 🌐 Routes API Badges (SVG, PNG & JSON)

Toutes les routes publiques de badges sont accessibles sans authentification, avec CORS activé (`Access-Control-Allow-Origin: *`) et des en-têtes anti-cache stricts (`Cache-Control: no-cache, no-store, must-revalidate, max-age=0`) pour garantir une donnée fraîche à chaque appel. Tous les endpoints (`/api/badge.svg`, `/api/badge.png`, `/api/badge.json`, `/api/status`) exposent en plus un **`ETag`** sémantique compatible `If-None-Match` (`304 Not Modified`).

### 1. Routes disponibles & formats de sortie

| Route (et alias court) | Content-Type | Sortie produite | Usage conseillé |
| :--- | :--- | :--- | :--- |
| `GET /api/badge.svg` (`/badge.svg`) | `image/svg+xml; charset=utf-8` | Badge vectoriel SVG animé (halo pulsant + `<title>` accessible) | Web, Notion, GitHub, Gmail web, Apple Mail |
| `GET /api/badge.png` (`/badge.png`) | `image/png` | Image PNG anti-aliasée **1,5× (Retina)** avec police `Plus Jakarta Sans` | Signatures e-mail universelles (**Outlook Desktop** inclus) |
| `GET /api/badge.json` (`/badge.json`) | `application/json; charset=utf-8` | Objet JSON structuré (statut, lignes de texte, compteurs, couleurs) | Scripts, widgets, Raccourcis Apple, Home Assistant, Raycast |

> Vous pouvez également appeler `GET /api/badge?format=png|svg|json`. La route `GET /api/status` renvoie en complément la liste anonymisée des prochains créneaux occupés (`upcomingSlots`). Pour la supervision, `GET /api/health` retourne un état de santé anonymisé (`ok`, `calendarsCount`, `allCalendarsHealthy`, `timezone`) — le détail `calendars` et `POST /api/calendar-refresh` nécessitent une session Studio authentifiée lorsque `STUDIO_PASSWORD` est configuré. L'application embarque aussi un **favicon dynamique** reflétant la couleur du statut et le support **PWA** installable (manifeste Web & mode hors ligne).

### 2. Options (paramètres d'URL)

| Paramètre | Routes concernées | Valeurs possibles | Défaut | Description |
| :--- | :--- | :--- | :--- | :--- |
| `style` | SVG, PNG | `pill`, `card`, `signature`, `dot` | `pill` | Choisit la variante visuelle (voir dimensions ci-dessous) |
| `theme` | SVG, PNG | `light`, `dark`, `transparent`, `transparent-dark` | `light` | Palette claire (fond blanc), sombre (`#0f172a`), transparente texte foncé (`transparent`) ou transparente texte clair (`transparent-dark` pour signatures/sites en mode sombre) |
| `lang` | SVG, PNG, JSON, `/api/status` | `fr`, `en` | `fr` | Langue des libellés et du format horaire (`09h00` en `fr`, `09:00` en `en`) |
| `mode` | SVG, PNG, JSON, `/api/status` | `person`, `shop` | `config/personal.json` | Bascule la sémantique *Personne* (*Disponible*, *Hors horaires*, *Repos*) vs *Boutique* (*Ouvert*, *Fermé*, *Horaires d'ouverture*) |
| `time` | SVG, PNG, JSON, `/api/status` | Date ISO 8601 (ex. `2026-11-23T10:00:00%2B04:00`) | *Maintenant* | Évalue et rend le statut à une date/heure précise (simulation) |
| `name` | SVG, PNG, JSON | Texte libre *(max 120 car.)* | `config/personal.json` | Surcharge le nom affiché sur le badge / dans le JSON |
| `role` | SVG, PNG, JSON | Texte libre *(max 120 car.)* | `config/personal.json` | Surcharge le poste / spécialité |
| `company` | SVG, PNG, JSON | Texte libre *(max 120 car.)* | `config/personal.json` | Surcharge l'entreprise / établissement |
| `format` | `/api/badge` | `png`, `svg`, `json` | `png` | Force le format de sortie lorsque l'extension n'est pas dans l'URL |
| `v` | SVG, PNG | Chaîne libre (ex. `v=17321000`) | — | Cache-buster optionnel côté client / e-mail |

#### Dimensions & comportement adaptatif des styles (SVG / PNG) :
- **`pill`** : `400 × 54 px` sur 2 lignes, passe automatiquement à `400 × 70 px` sur 3 lignes dès qu'au moins 1 RDV est prévu aujourd'hui.
- **`card`** : `380 × 100 px` sur 2 lignes, ou `380 × 118 px` sur 3 lignes avec les RDV du jour.
- **`signature`** : `480 × 114 px` (avatar initiales + nom + poste + encart 2 lignes), ou `480 × 132 px` sur 3 lignes.
- **`dot`** : `36 × 36 px` seul si aucun RDV ce jour, ou `42–46 × 38 px` avec pastille compteur (`1` à `99+`) dès qu'un RDV est prévu aujourd'hui.

#### Exemples d'appels :
```text
/api/badge.png?style=signature&theme=dark
/api/badge.svg?style=card&theme=transparent-dark&lang=en
/api/badge.json?lang=en
/api/badge.json?time=2026-11-23T10:00:00%2B04:00
```

### 3. Sortie de la route JSON (`/api/badge.json`)

La route JSON fournit exactement les mêmes informations textuelles et compteurs que les badges graphiques, **sans jamais exposer les titres privés des rendez-vous ni les URL `.ics`** :

```json
{
  "status": "BUSY",
  "state": "busy",
  "isWorkTime": true,
  "title": "En réunion / Occupé (Pro)",
  "subtitle": "Reprise mercredi à 08h30",
  "appointmentsLabel": "1 RDV (journée entière) aujourd'hui",
  "activeCalendarLabel": "Pro",
  "lines": [
    "En réunion / Occupé (Pro)",
    "Reprise mercredi à 08h30",
    "1 RDV (journée entière) aujourd'hui"
  ],
  "text": "En réunion / Occupé (Pro) — Reprise mercredi à 08h30 • 1 RDV (journée entière) aujourd'hui",
  "todayAppointmentsCount": 1,
  "todayAllDayAppointmentsCount": 1,
  "calendars": [
    {
      "id": "pro",
      "label": "Pro",
      "todayAppointmentsCount": 1,
      "todayAllDayAppointmentsCount": 1,
      "isBusyNow": true
    }
  ],
  "nextFreeTime": "mercredi à 08h30",
  "nextChangeAt": "2026-11-25T04:30:00.000Z",
  "colors": {
    "badge": "#EF4444",
    "dot": "#DC2626"
  },
  "profile": {
    "name": "Prénom Nom",
    "role": "Votre Poste / Spécialité",
    "company": "Votre Entreprise / Établissement"
  },
  "timezone": "Indian/Reunion",
  "localTime": "10h00",
  "localDate": "2026-11-23",
  "updatedAt": "2026-11-23T06:00:00.000Z"
}
```

Détail des principaux champs JSON :
- **`status`** : état détaillé (`AVAILABLE`, `BUSY`, `LUNCH`, `OFF_HOURS`, `HOLIDAY`, `OVERRIDE_*`).
- **`state`** : état simplifié (`available`, `busy`, `away`, `off`).
- **`isWorkTime`** : `true` si l'heure courante est dans les horaires travaillés ou occupée par une réunion.
- **`title`** / **`subtitle`** : lignes 1 et 2 du badge.
- **`appointmentsLabel`** : libellé de la 3e ligne (`1 RDV prévu aujourd'hui`, `X RDV prévus aujourd'hui`, `X RDV (journée entière) aujourd'hui`, `X RDV (dont journée entière) aujourd'hui`) ou `null` s'il y a `0` RDV aujourd'hui.
- **`activeCalendarLabel`** : label du/des agendas qui rendent actuellement indisponible (`null` si disponible ou hors horaires).
- **`lines`** : tableau de 2 chaînes (si `0` RDV ce jour) ou 3 chaînes (sinon), prêt à afficher ligne par ligne.
- **`text`** : version texte concaténée sur une seule ligne.
- **`todayAppointmentsCount`** / **`todayAllDayAppointmentsCount`** : total des RDV bloquants sur la journée locale (`00h00` → `24h00`) et nombre de RDV couvrant toute la journée / journée de travail.
- **`calendars`** *(si au moins un agenda est configuré)* : synthèse anonymisée par calendrier (`id`, `label`, `todayAppointmentsCount`, `todayAllDayAppointmentsCount`, `isBusyNow`).
- **`nextFreeTime`** / **`nextChangeAt`** : libellé lisible et horodatage ISO UTC du prochain changement d'état.
- **`colors`** : codes hexadécimaux `badge` et `dot` correspondant à l'état courant.
- **`profile`**, **`timezone`**, **`localTime`**, **`localDate`**, **`updatedAt`** : identité publique et repères temporels calculés dans le fuseau actif.

---

## 🔒 Affichage sécurisé des prochains rendez-vous

Sur la page publique, la section **Prochains créneaux occupés** présente les plages horaires réservées de manière strictement anonymisée :
- **Confidentialité totale** : aucun titre, aucun participant, aucun lieu ni aucune description ne sont transmis au navigateur.
- **Fusion intelligente** des créneaux contigus ou qui se chevauchent.
- **Groupement par jour** avec indication de la durée du créneau.

---

## 🔐 Variables d'environnement (`.env`) & Accès au Studio (`STUDIO_PASSWORD`)

Définissez vos variables dans `.env` en local (ou dans les **Environment Variables** de Vercel) :
- **`CALENDAR_ICS_URL`** : URL secrète iCal (`.ics`) de votre agenda principal (jamais exposée côté client).
- **Multi-agendas avec label (`CALENDAR_ICS_URL_<LABEL>`)** : ajoutez autant de calendriers que souhaité directement via le nom des variables d'environnement, par exemple :
  - `CALENDAR_ICS_URL_PRO="https://..."` → label **`Pro`**
  - `CALENDAR_ICS_URL_PERSO="https://..."` → label **`Perso`**
  - `CALENDAR_ICS_URL_CABINET_SUD="https://..."` → label **`Cabinet Sud`**
  - *(Optionnel)* Surchargez le libellé exact (accents, sigles) via `CALENDAR_ICS_LABEL_<LABEL>` (ex. `CALENDAR_ICS_LABEL_PRO="Cabinet Médical"`) ou `CALENDAR_ICS_LABEL` pour `CALENDAR_ICS_URL`.
  - Les labels apparaissent sur les créneaux occupés, le statut en réunion et le flux `/api/badge.json` sans jamais révéler les titres privés ni les URL `.ics`.
- **`TIMEZONE`** : Fuseau horaire IANA utilisé pour calculer votre heure locale (ex. `Europe/Paris`, `Indian/Reunion`).
- **`STUDIO_PASSWORD`** : Mot de passe pour masquer et protéger l'accès au Studio (générateur de signature, simulateur, horaires & guide) :
  - Les visiteurs de la page publique et les images de signature (`/api/badge.png`, `/api/badge.svg`) restent accessibles sans mot de passe.
  - L'accès au Studio via `/studio`, `?view=studio` ou le lien discret en pied de page demande le mot de passe configuré avant d'afficher l'interface d'administration.
- **`PERSONAL_JSON`** *(ou **`PERSONAL_JSON_BASE64`**, optionnel)* : Remplace `config/personal.json` en une seule variable (générable en 1 clic via le convertisseur intégré au Studio). Les champs unitaires optionnels **`PROFILE_NAME`**, **`PROFILE_ROLE`**, **`PROFILE_COMPANY`**, **`PROFILE_EMAIL`**, **`PROFILE_BOOKING_URL`**, **`PROFILE_MODE`** restent utilisables en complément et priment sur `PERSONAL_JSON`.
- **`SCHEDULE_JSON`** *(ou **`SCHEDULE_JSON_BASE64`**, optionnel)* : Surcharge `config/schedule.json` via une chaîne JSON compacte sur 1 ligne (convertisseur JSON → `.env` intégré dans l'onglet **Agenda & Horaires** du Studio). Toute propriété omise hérite automatiquement de `config/schedule.json`.
- **Variables granulaires `SCHEDULE_*`** *(optionnelles, prioritaires sur `SCHEDULE_JSON` et `config/schedule.json`)* : Permettent de gérer tout l'agenda directement dans `.env` sans JSON :
  - **Fuseau & marge** : `SCHEDULE_TIMEZONE` *(prioritaire sur `TIMEZONE`)*, `SCHEDULE_BUFFER_MINUTES`.
  - **Horaires & jours de travail** : `SCHEDULE_WORK_DAYS` *(ex. `"mon-fri"`, `"tue-fri"`, `"mar,mer,jeu,ven"`, `"1,2,3,4,5"`, `"none"`)*, `SCHEDULE_HOURS` *(ex. `"09:00-18:00"` ou `"08h30-17h30"`)*, ou `SCHEDULE_START` / `SCHEDULE_END`.
  - **Surcharges par jour** *(suffixes `_MON`/`_LUN`/`_1`, `_TUE`/`_MAR`/`_2`, `_WED`/`_MER`/`_3`, `_THU`/`_JEU`/`_4`, `_FRI`/`_VEN`/`_5`, `_SAT`/`_SAM`/`_6`, `_SUN`/`_DIM`/`_0`)* : `SCHEDULE_HOURS_FRI="09:00-13:00"` *(ou `"off"` / `"repos"` pour fermer)*, `SCHEDULE_START_MON`, `SCHEDULE_END_MON`, `SCHEDULE_DAY_SAT="true"`.
  - **Pause déjeuner globale & par jour** : `SCHEDULE_LUNCH_HOURS` *(ou `"off"`)*, `SCHEDULE_LUNCH_START`, `SCHEDULE_LUNCH_END`, `SCHEDULE_LUNCH_LABEL`, `SCHEDULE_LUNCH_ENABLED`, et leurs équivalents suffixés (`SCHEDULE_LUNCH_HOURS_THU="12:00-12:30"`, `SCHEDULE_LUNCH_ENABLED_WED="false"`, `SCHEDULE_LUNCH_START_FRI`, `SCHEDULE_LUNCH_END_FRI`, `SCHEDULE_LUNCH_LABEL_FRI`).
  - **Fermetures & jours fériés (`SCHEDULE_CLOSURES`)** : accepte soit un tableau JSON `[...]`, soit la syntaxe compacte séparée par `;` : `"12-25|Noël|annual; 2026-08-01..2026-08-15|Congés d'été|vacation"` *(ou `"none"`/`"[]"` pour effacer)*.