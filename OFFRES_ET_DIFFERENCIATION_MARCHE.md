# Stratégie Commerciale, Différenciation Marché & Grille Tarifaire

Ce document présente l'analyse concurrentielle détaillée, le positionnement de rupture, les 3 packs commerciaux (Indépendant, Small Business, Medium Business) et les arguments de vente clés pour **Captain Prospect / Suzalink**.

---

## Sommaire
1. [Le Problème du Marché & Notre Différenciation](#1-le-problème-du-marché--notre-différenciation)
2. [Comparatif Direct : Le Choc des Modèles](#2-comparatif-direct--le-choc-des-modèles)
3. [Tableau Comparatif Détaillé vs Concurrents](#3-tableau-comparatif-détaillé-vs-concurrents)
4. [Grille Tarifaire & Packs Commerciaux Organisés](#4-grille-tarifaire--packs-commerciaux-organisés)
5. [Upsells & Options à Forte Marge](#5-upsells--options-à-forte-marge)
6. [Fiche Argumentaire de Vente (Pitch & Objections)](#6-fiche-argumentaire-de-vente-pitch--objections)

---

## 1. Le Problème du Marché & Notre Différenciation

### A. Le Piège du "Stack Morcelé"
Aujourd'hui, pour équiper une équipe de prospection B2B (SDRs / Closers), les entreprises sont obligées d'empiler 4 à 5 logiciels distincts :
1. **Un CRM classique (HubSpot / Salesforce / Pipedrive)** : 80 € à 150 € / mois / utilisateur.
2. **Un logiciel de téléphonie VoIP (Aircall / Ringover)** : 40 € à 50 € / mois / utilisateur.
3. **Un outil d'analyse et de transcription conversationnelle (Modjo / Gong)** : 80 € à 120 € / mois / utilisateur.
4. **Un outil d'emailing / séquençage (Lemlist / Instantly)** : 50 € à 80 € / mois.
5. **Stockage & connecteurs (Zapier / Make)** : 30 € à 60 € / mois.

👉 **Coût total par commercial : entre 280 € et 450 € HT / mois**.
👉 **Conséquence :** Perte de temps colossale à naviguer entre les onglets, synchronisations Zapier qui cassent, et fatigue mentale des commerciaux.

---

### B. Les 4 Piliers de Notre Différenciation

| Pilier | Chez les Concurrents (HubSpot, Salesforce, Pipedrive) | Chez Captain Prospect / Suzalink |
| :--- | :--- | :--- |
| **1. L'Objectif (The Goal)** | Conçu pour le **reporting administratif** et les directeurs financiers. 10 clics et formulaires à remplir après chaque appel. Les commerciaux détestent l'utiliser. | Conçu pour l'**exécution pure outbound**. L'écran est optimisé pour enchaîner les appels en 1 clic. Zéro saisie inutile. |
| **2. Le Prix (Lower Price)** | Facturation agressive par siège + add-ons payants pour l'enregistrement, l'IA et la téléphonie. Facture qui explose. | **Tout-en-un à partir de 59 € à 76 € / mois / utilisateur**. Divise la facture logicielle par 4. |
| **3. L'Automatisation IA (Mistral AI)** | Transcription payante en option (Modjo/Gong à 100€/mois) ou résumés génériques inutilisables. | **Génération automatique de la "Fiche de RDV"** en 10 secondes dès qu'un prospect est booké (BANT, verbatims, budget, objections pour le closer). |
| **4. Architecture & Souveraineté** | Multi-tenant partagé public. Vos données et audio côtoient des millions d'entreprises étrangères. | **Single-Tenant Dédié** : Chaque client possède son instance, sa base de données PostgreSQL isolée et son coffre-fort audio S3. |

---

## 2. Comparatif Direct : Le Choc des Modèles

### 1. Objectif : Exécution Terrain vs Bureaucratie
* **Les CRM traditionnels** sont des bases de données passives : vous attendez que le prospect arrive (inbound) ou vous devez renseigner 20 champs obligatoires pour satisfaire le reporting de la direction.
* **Notre CRM** est une machine de guerre d'appels et d'outbound : le SDR ouvre sa file, clique sur le numéro, échange avec le prospect via **Allo ou OnOff**, raccroche, sélectionne l'issue en 1 clic (`Rendez-vous pris`, `Barrage standard`, `Rappel demandé`), et l'appel suivant démarre.

### 2. Téléphonie & Call Vault Intégrés
* Plus besoin de payer un abonnement Aircall ou Kixie à 40 €/mois en plus du CRM.
* Le système ingère directement les webhooks et flux audio de **vos lignes Allo & OnOff Business**.
* Chaque appel est enregistré, horodaté et rattaché au prospect dans le **Call Vault** (hébergé sur stockage S3 privé).

### 3. La "Fiche de RDV" Instantanée par Mistral AI
* Le plus grand point de friction en agence ou en équipe commerciale est le passage de relais (Handover) entre le SDR (qui prend le rendez-vous) et le Closer (qui doit signer la vente).
* Habituellement, le SDR écrit 3 lignes incomplètes dans un champ texte.
* Avec notre moteur `lib/ai/mistral-fiche.ts`, **l'IA Mistral écoute l'enregistrement ou analyse les notes et produit instantanément une fiche structurée** :
  * Contexte & Taille de l'entreprise
  * Douleur principale & Besoins exprimés
  * Budget & Échéance
  * Décideurs présents au RDV
  * Points de vigilance et objections anticipées

---

## 3. Tableau Comparatif Détaillé vs Concurrents

| Critères d'Évaluation | Captain Prospect / Suzalink | Stack Morcelé (HubSpot + Aircall + Modjo) | Close.com / NoCRM | Outils Cold Email (Lemlist, Instantly) |
| :--- | :---: | :---: | :---: | :---: |
| **Cible & Métier** | **Prospection Outbound B2B, SDRs, Téléphonie** | Gestion générale, Inbound & Grands Comptes | PME Outbound généraliste | Prospection email de masse |
| **Téléphonie Allo & OnOff** |  **Natif via webhooks** | ❌ Tiers payant (Aircall/Ringover) | ❌ Téléphonie US uniquement | ❌ Aucune téléphonie |
| **Call Vault (Enregistrement Audio S3)** |  **Inclus nativement** | ⚠️ Option payante selon outil | ⚠️ Inclus à partir du plan $139/mois | ❌ Non |
| **Génération auto "Fiche de RDV" (Mistral AI)** |  **Inclus (10 secondes)** | ❌ Requiert Modjo/Gong (+100€) | ❌ Notes manuelles | ❌ Non |
| **Détection & Rythme SDR (Pace / Cadence)** |  **Inclus (Algorithme en direct)** | ⚠️ Tableaux complexes à créer | ⚠️ Partiel | ❌ Non |
| **Moteur d'Exclusions & Anti-Doublons** |  **Inclus nativement** | ⚠️ Règles complexes | ⚠️ Basique | ❌ Non |
| **Isolation des données (Single-Tenant)** |  **Instance & DB dédiées** | ❌ Serveurs publics partagés | ❌ Serveurs publics partagés | ❌ Serveurs publics partagés |
| **Marque Blanche (White-Label)** |  **Disponible (Pack Medium)** | ❌ Impossible ou > 20k€/an | ❌ Non | ❌ Non |
| **Coût pour 1 utilisateur** | **59 € à 69 € / mois** | ~320 € / mois | ~99 € à 139 € / mois | ~59 € à 99 € / mois |
| **Coût pour 3 utilisateurs** | **189 € à 229 € / mois** | ~950 € à 1 200 € / mois | ~400 € à 450 € / mois | ~240 € (sans appels) |
| **Coût pour 8 utilisateurs** | **419 € à 499 € / mois** | ~2 600 € à 3 200 € / mois | ~1 100 € à 1 400 € / mois | ~600 € (sans appels) |

---

## 4. Grille Tarifaire & Packs Commerciaux Organisés

Grille tarifaire calibrée sur les ressources réelles de votre infrastructure (Contabo 8 vCPU / 24 Go RAM / 300 Go SSD, Coolify, Traefik, Supabase, MinIO S3 et Mistral AI).

---

### 📦 PACK 1 : "INDÉPENDANT" (Solo / Freelance / Closer / Agent)
> **Cible :** SDR indépendant, consultant B2B, closer freelance ou solopreneur qui gère lui-même sa prospection téléphonique et email.

* **Tarifs :**
  * **Mensuel :** **69 € HT / mois** *(sans engagement)*
  * **Annuel :** **59 € HT / mois** *(708 € HT facturé à l'année — 2 mois offerts)*
  * **Frais d'onboarding (optionnels) :** 150 € HT (configuration domaine + 1 ligne Allo/OnOff + import base)

* **Capacité & Quotas Inclus :**
  * **1 Siège utilisateur** (accès complet SDR / Closer)
  * **1 Workspace** dédié
  * **15 000 Contacts** dans le CRM
  * **1 Ligne Allo ou OnOff** synchronisée
  * **Call Vault : 20 heures d'appels audio enregistrés** par mois
  * **150 Fiches de RDV générées par Mistral AI** par mois
  * **5 Go de stockage S3** pour les fichiers et audios

* **Fonctionnalités Incluses :**
  * File d'appels intelligente & qualification en 1 clic
  * Envoi et suivi d'emails avec modèles
  * Call Vault avec lecteur audio intégré
  * Génération automatique de la synthèse de RDV qualifié
  * Export CSV / Excel des prospects qualifiés
  * Support par ticket & email (SLA 48h)

* **Marge & Coût d'infrastructure :**
  * Coût d'hébergement estimé (RAM + S3 + Mistral) : **~3,50 € / mois**
  * **Marge brute : 94%**

---

### 📦 PACK 2 : "SMALL BUSINESS" (TPE / PME / Équipes 3 à 7 personnes)
> **Cible :** Startups B2B, TPE en croissance, équipes commerciales de 3 à 7 commerciaux ayant besoin d'un manager pour piloter le rythme, éviter les collisions et qualifier vite.
> ⭐ **Mention commerciale : "LE PLUS POPULAIRE"**

* **Tarifs :**
  * **Mensuel :** **229 € HT / mois** *(3 utilisateurs inclus)*
  * **Annuel :** **189 € HT / mois** *(2 268 € HT facturé à l'année — 3 utilisateurs inclus)*
  * **Utilisateur supplémentaire :** **+49 € HT / mois / siège** (jusqu'à 7 max)
  * **Setup & Formation d'équipe :** 350 € HT (mapping des 3 numéros, DNS, session live de prise en main de 45 min)

* **Capacité & Quotas Inclus :**
  * **3 Sièges utilisateurs inclus** (SDR, Manager, Closer)
  * **3 Workspaces distincts** (parfait pour scinder deux offres ou deux cibles)
  * **60 000 Contacts** dans le CRM
  * **Jusqu'à 3 lignes Allo / OnOff** connectées
  * **Call Vault : 80 heures d'appels audio enregistrés** par mois
  * **600 Fiches de RDV générées par Mistral AI** par mois
  * **25 Go de stockage S3** pour audios et documents

* **Fonctionnalités Avancées Incluses :**
  * **Tout le Pack Indépendant, plus :**
  * **Cockpit Manager en temps réel :** Rythme d'appels (Pace), taux de conversion, suivi d'activité horaire
  * **Moteur d'Exclusions & Anti-Collision :** Empêche deux commerciaux d'appeler la même entreprise
  * **Calcul RH & Activité :** Suivi automatisé des jours travaillés et des objectifs
  * **Recyclage automatique des leads :** Relance programmée des "Barrages standards" et "Rappels"
  * Support prioritaire via canal Slack ou WhatsApp dédié (SLA 12h)

* **Marge & Coût d'infrastructure :**
  * Coût d'hébergement estimé (RAM + S3 + Mistral) : **~8,00 € / mois**
  * **Marge brute : 96%**

---

### 📦 PACK 3 : "MEDIUM BUSINESS" (Agences de Prospection / PME en Forte Croissance)
> **Cible :** Agences de prospection (Done-For-You), plateformes d'appels B2B, entreprises avec 8 à 30 commerciaux requérant la marque blanche et l'accès client transparent.
> ⭐ **Mention commerciale : "PUISSANCE & MARQUE BLANCHE"**

* **Tarifs :**
  * **Mensuel :** **499 € HT / mois** *(8 utilisateurs inclus)*
  * **Annuel :** **419 € HT / mois** *(5 028 € HT facturé à l'année — 8 utilisateurs inclus)*
  * **Utilisateur supplémentaire :** **+39 € HT / mois / siège** (sans limite)
  * **Setup White-Glove :** 750 € HT (déploiement domaine personnalisé, intégration complète, formation équipe)

* **Capacité & Quotas Inclus :**
  * **8 Sièges utilisateurs inclus** (SDRs, Closers, Managers, Admins)
  * **Workspaces Illimités** (1 workspace par client d'agence)
  * **250 000 Contacts** dans le CRM
  * **Lignes Allo / OnOff illimitées**
  * **Call Vault : 250 heures d'appels audio enregistrés** par mois
  * **2 500 Fiches de RDV générées par Mistral AI** par mois
  * **100 Go de stockage S3** dédié

* **Fonctionnalités Entreprise Incluses :**
  * **Tout le Pack Small Business, plus :**
  * **Marque Blanche Complète (White-Label) :** Votre propre nom de domaine (`crm.votreagence.com`), votre logo et vos couleurs
  * **Rôle "Client Spectateur" :** Vos clients peuvent écouter les rendez-vous pris et consulter leurs rapports sans voir vos coulisses
  * **Webhooks & API d'ingestion sur mesure :** Connexion directe avec Typeform, Ads, bots LinkedIn
  * **File de traitement haute priorité (BullMQ) :** Synchronisation accélérée des enrichissements
  * Account Manager dédié avec ligne directe (SLA 4h)

* **Marge & Coût d'infrastructure :**
  * Coût d'hébergement estimé (RAM + S3 + Mistral) : **~22,00 € / mois**
  * **Marge brute : 95%**

---

## 5. Upsells & Options à Forte Marge

Ces options permettent d'augmenter le panier moyen (ARPU) sans effort technique supplémentaire :

| Option Additionnelle | Tarif Public (HT) | Coût Réel Requis | Bénéfice Client |
| :--- | :--- | :--- | :--- |
| **Pack Stockage Audio (+50 Go S3)** | +29 € / mois | < 1 € / mois | Idéal pour conserver 100% des appels enregistrés pendant plusieurs années. |
| **Recharge Mistral AI (+1 000 Fiches RDV)** | +49 € / mois | ~3 € / mois (API Mistral) | Pour les équipes à très forte volumétrie de closing. |
| **Option Marque Blanche (pour Pack 1 ou 2)** | +99 € / mois | 0 € (déjà supporté par Traefik/Coolify) | Affiche le logo et l'URL personnalisée du client. |
| **Workspace Client Supplémentaire** | +39 € / mois | Négligeable | Permet à une TPE d'isoler une 2ème marque sans changer de pack. |
| **Sourcing & Injection de Fichiers Leads B2B** | 0,35 € à 0,55 € / lead | Variable selon data provider | Fichier qualifié et injecté directement dans les listes du CRM. |

---

## 6. Fiche Argumentaire de Vente (Pitch & Objections)

### Le "Pitch Éclair" (30 secondes)
> *"Si vous faites de la prospection téléphonique B2B aujourd'hui, vous payez probablement 300 € par commercial entre votre CRM, Aircall et Modjo pour réécouter les appels. Notre CRM fusionne tout en un seul écran : vos commerciaux appellent avec leurs numéros Allo ou OnOff, les appels sont stockés automatiquement dans le Call Vault, et dès qu'un prospect dit oui, l'IA Mistral génère en 10 secondes la fiche complète pour le closer. Vous gagnez 1h par jour par commercial et divisez votre facture logicielle par 4."*

### Réponses aux Objections Clientes

#### 1. « On utilise déjà HubSpot / Salesforce, pourquoi changer ? »
> **Réponse :** *"Gardez HubSpot pour le marketing inbound si vous le souhaitez. Mais donnez Captain Prospect à vos SDRs en première ligne. HubSpot est une usine à gaz pour faire 80 appels par jour : chaque commercial perd 30 secondes par appel à cliquer sur des menus. Sur notre outil, ils doublent leur vitesse d'exécution, et vous pouvez synchroniser les RDV qualifiés vers votre CRM central."*

#### 2. « Pourquoi êtes-vous 4 fois moins chers ? Est-ce moins fiable ? »
> **Réponse :** *"Les géants américains comme Salesforce ou Aircall dépensent 50% de leur chiffre d'affaires en marketing et en commissions commerciales. Nous avons une architecture moderne, optimisée et sans intermédiaires. De plus, vous bénéficiez d'une instance privée dédiée (Single-Tenant), là où leurs clients sont entassés sur des serveurs partagés."*

#### 3. « Que se passe-t-il si j'utilise déjà mes numéros OnOff ou Allo ? »
> **Réponse :** *"Vous n'avez pas besoin de changer d'opérateur ni de perdre vos numéros existants ! Nous connectons vos comptes existants via webhooks. Vos commerciaux continuent d'utiliser leurs applications habituelles, et tout remonte automatiquement dans le CRM en temps réel."*

#### 4. « Est-ce que mes données sont protégées ? »
> **Réponse :** *"Absolument. Contrairement à 99% des SaaS qui sont multi-tenant (vos données sont dans la même base que vos concurrents), chaque client chez nous dispose de sa propre base de données PostgreSQL isolée et de son propre conteneur applicatif, hébergé sur des infrastructures européennes sécurisées."*
