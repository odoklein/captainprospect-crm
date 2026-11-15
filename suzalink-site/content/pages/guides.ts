/**
 * Guides /guides/<slug> : contenus piliers, écrits pour Google ET pour les moteurs IA
 * (ChatGPT, Perplexity, AI Overviews). Règles :
 * - chaque section : un titre en question, une réponse directe de 40 à 60 mots, puis le détail ;
 * - des chiffres datés tirés de nos missions (clients anonymisés), jamais inventés ;
 * - des liens internes vers les pages d'offre ([texte](/url)).
 * Mots-clés : Search Console suzaliconseil.com (28 jours au 13/10/2026).
 */
import type { LandingPage } from "./types";

export type Guide = LandingPage & { slug: string; name: string; summary: string };

const sprintCta = {
  kind: "cta" as const,
  id: "commencer",
  eyebrow: "Passer à l'action",
  title: "Testez sur votre cible, pas sur un guide",
  intro: "Deux semaines, 990 € HT déduits si vous continuez. À la fin, vous connaissez le coût réel d'un RDV sur votre marché.",
  primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
  secondary: { label: "Voir la prospection externalisée", href: "/prospection-externalisee" },
};

export const guides: Guide[] = [
  {
    slug: "externaliser-prospection-commerciale",
    name: "Externaliser sa prospection commerciale",
    summary: "Quand le faire, comment choisir, combien ça coûte, et les erreurs qui font échouer une mission.",
    path: "/guides/externaliser-prospection-commerciale",
    parent: { label: "Guides", href: "/guides" },
    breadcrumb: "Externaliser sa prospection",
    updated: "2026-11-12",
    article: { published: "2026-11-12", readingMinutes: 9 },
    meta: {
      title: "Externaliser sa prospection commerciale : le guide",
      description:
        "Quand externaliser sa prospection commerciale, comment choisir une agence, combien ça coûte et quels résultats attendre. Avec les chiffres de nos missions.",
    },
    hero: {
      eyebrow: "Guide · Prospection",
      title: "Externaliser sa prospection commerciale : le guide complet",
      lead: "Ce qu'on aurait aimé lire avant de lancer nos premières missions. Écrit par l'équipe qui appelle tous les jours pour ses clients, avec nos propres chiffres.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Voir l'offre", href: "/prospection-externalisee" },
    },
    blocks: [
      {
        kind: "answer",
        question: "Faut-il externaliser sa prospection commerciale ?",
        answer:
          "Oui, si vous savez déjà vendre votre offre en rendez-vous mais que personne n'a le temps d'en obtenir. Externaliser donne des RDV plus vite qu'un recrutement et sans contrat de travail. Non, si votre offre n'est pas encore claire : un SDR amplifie un message qui marche, il ne le crée pas.",
        facts: ["Commencez par un test court", "Exigez d'écouter les appels", "Définissez le RDV qualifié par écrit", "Gardez la propriété de votre fichier"],
      },
      {
        kind: "article",
        sections: [
          {
            id: "definition",
            title: "Qu'est-ce que l'externalisation de la prospection commerciale ?",
            answer:
              "Externaliser sa prospection commerciale, c'est confier à un prestataire la recherche de nouveaux clients : l'identification des cibles, les appels ou emails, la qualification et la prise de rendez-vous. Votre équipe ne garde que la partie qui rapporte : le rendez-vous et la signature.",
            paragraphs: [
              "On parle aussi d'**agence outbound**, de **télé-prospection B2B** ou de **SDR externalisé**. Le principe est le même : une personne formée à votre offre appelle vos cibles en votre nom. La différence entre les prestataires se joue sur trois points : qui appelle, ce que vous voyez de leur travail, et comment vous payez.",
              "Chez nous, l'appel se fait depuis notre propre CRM, et vous suivez tout depuis un portail : chaque appel est enregistré, chaque RDV arrive avec sa fiche. C'est ce que nous appelons la [prospection externalisée](/prospection-externalisee).",
            ],
          },
          {
            id: "quand",
            title: "Quand faut-il externaliser sa prospection ?",
            answer:
              "Externalisez quand votre offre se vend bien en rendez-vous mais que vos commerciaux n'ont pas le temps d'en obtenir, quand vous voulez tester un nouveau marché sans recruter, ou quand un recrutement de SDR prendrait trop de temps. Évitez-le tant que vous ne savez pas expliquer votre offre en deux phrases.",
            list: {
              items: [
                "Vos commerciaux passent plus de temps à chercher des RDV qu'à en tenir.",
                "Vous lancez une nouvelle cible, une nouvelle région ou un nouveau produit.",
                "Votre dernier SDR est parti et le pipeline s'est vidé.",
                "Vous avez un fichier de prospects que personne n'a jamais vraiment appelé.",
                "Vous voulez mesurer le potentiel d'un marché avant d'y embaucher.",
              ],
            },
          },
          {
            id: "recruter-ou-externaliser",
            title: "Externaliser ou recruter un SDR : que choisir ?",
            answer:
              "Recruter un SDR est rentable à long terme si vous avez le volume et quelqu'un pour le former et le manager. Externaliser est plus rapide, sans risque de recrutement raté, et réversible. Beaucoup d'entreprises commencent par externaliser, mesurent le coût d'un RDV, puis décident d'internaliser ou non.",
            table: {
              caption: "Recruter ou externaliser : les critères qui comptent",
              columns: ["Critère", "Recruter un SDR", "Externaliser"],
              rows: [
                ["Délai avant les premiers appels", "Recrutement, puis formation", "Quelques jours de cadrage"],
                ["Coût fixe", "Salaire chargé, outils, management", "Forfait ou paiement au RDV"],
                ["Si la personne part", "Tout est à refaire", "Le prestataire remplace, avec l'historique"],
                ["Connaissance de votre offre", "Profonde, avec le temps", "Bonne, si le cadrage est sérieux"],
                ["Réversibilité", "Faible", "Forte, si le contrat est sans engagement"],
              ],
            },
          },
          {
            id: "cout",
            title: "Combien coûte une prospection externalisée ?",
            answer:
              "Il existe trois modèles : un forfait mensuel pour un SDR dédié, un paiement au rendez-vous honoré, ou un mélange des deux. Chez Suzalink, la mission mensuelle coûte 1 290 € HT par mois plus 100 € HT par RDV honoré, et le paiement au résultat va de 180 à 300 € HT par RDV.",
            paragraphs: [
              "Le bon indicateur n'est pas le prix du forfait, mais le **coût d'un RDV honoré** : tout ce que vous payez, divisé par le nombre de rendez-vous qui ont vraiment eu lieu. Nous détaillons le calcul, avec des exemples, dans [combien coûte un rendez-vous qualifié](/guides/prix-rdv-qualifie). Nos prix complets sont sur la [page tarifs](/tarifs).",
            ],
          },
          {
            id: "choisir",
            title: "Comment choisir une agence de prospection ?",
            answer:
              "Posez sept questions avant de signer : qui appelle, puis-je écouter les appels, comment est défini un RDV qualifié, que se passe-t-il si un RDV n'est pas honoré, à qui appartient le fichier, quel est l'engagement, et à quoi ressemble le reporting. Des réponses floues annoncent une mission floue.",
            list: {
              ordered: true,
              items: [
                "**Qui appelle ?** Un SDR dédié à votre mission, ou un plateau qui tourne sur dix clients ?",
                "**Puis-je écouter les appels ?** Le jour même, pas sur demande en fin de mois.",
                "**Qu'est-ce qu'un RDV qualifié ?** Fonction, taille d'entreprise, besoin : écrit noir sur blanc.",
                "**Que se passe-t-il si un RDV n'a pas lieu ?** Remplacé, non facturé, ou perdu ?",
                "**À qui appartient le fichier ?** Contacts, notes et enregistrements doivent vous revenir.",
                "**Quel engagement ?** Un test court avant tout contrat long.",
                "**Quel reporting ?** Des appels, des objections et des enregistrements, pas seulement des totaux.",
              ],
            },
          },
          {
            id: "deroulement",
            title: "Comment se déroule une mission de prospection ?",
            answer:
              "Une mission sérieuse suit cinq étapes : le cadrage de la cible et du RDV qualifié, le nettoyage du fichier, les appels avec rappels planifiés, la prise de RDV avec une fiche préparée, puis un bilan chaque semaine. Le cadrage et le nettoyage du fichier conditionnent tout le reste.",
            list: {
              ordered: true,
              items: [
                "Cadrage : cible, interlocuteur, définition du RDV qualifié, script écrit ensemble.",
                "Fichier : doublons, numéros faux et clients actuels retirés avant le premier appel.",
                "Appels : un SDR dédié, des rappels à des heures différentes, chaque objection notée.",
                "RDV : posé dans votre agenda avec une fiche (besoin, budget, décideur, objections).",
                "Bilan hebdomadaire : enregistrements, joignabilité, objections, ajustements.",
              ],
            },
            field:
              "Sur notre mission vers les cabinets dentaires fin 2025, la moitié des 5 174 appels n'a jamais abouti et 9 % des numéros étaient faux. Le nettoyage du fichier et les rappels planifiés ont permis de tenir deux mois et d'obtenir 147 RDV terrain. [Voir la mission](/secteurs/cabinets-dentaires).",
          },
          {
            id: "resultats",
            title: "Quels résultats attendre d'une prospection externalisée ?",
            answer:
              "Les résultats dépendent surtout de la cible. Certaines cibles décrochent et acceptent vite, d'autres filtrent beaucoup. Méfiez-vous des promesses chiffrées faites avant le premier appel : seul un test sur votre cible donne un coût par RDV fiable.",
            paragraphs: [
              "Deux exemples tirés de nos missions montrent l'écart. Vers les cabinets dentaires, l'assistante décide souvent seule du passage d'un commercial : 183 cabinets ont dit oui en deux mois, entre RDV et boîtes de collecte. Vers les directions financières, en 2026, 45 % des contacts n'avaient toujours pas répondu après plusieurs tentatives : ces cibles demandent plus de temps et un message plus précis.",
            ],
            field:
              "Une cible difficile n'est pas une mauvaise cible : un DAF qui accepte un RDV vaut souvent plus qu'une dizaine de RDV faciles. C'est pour ça que le prix d'un RDV doit dépendre de la cible.",
          },
          {
            id: "erreurs",
            title: "Quelles erreurs font échouer une externalisation ?",
            answer:
              "Les échecs viennent rarement des appels eux-mêmes. Ils viennent d'une cible mal définie, d'un fichier sale, d'un RDV qualifié jamais écrit, d'un client qui ne rappelle pas les prospects, ou d'un prestataire qu'on ne peut pas contrôler.",
            list: {
              items: [
                "Viser « toutes les PME » au lieu d'une fonction précise dans un secteur précis.",
                "Appeler un fichier acheté sans le nettoyer.",
                "Ne jamais écrire ce qu'est un RDV qualifié, puis contester chaque RDV.",
                "Laisser passer trois jours avant de confirmer un RDV : le prospect oublie.",
                "Signer six mois sans test ni accès aux enregistrements.",
              ],
            },
          },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Externalisation de la prospection",
        items: [
          { q: "Quelle différence entre agence outbound et agence inbound ?", a: "Une agence outbound va chercher les prospects (appels, emails, LinkedIn). Une agence inbound attire des prospects qui viennent à vous (contenu, SEO, publicité). Les deux se complètent : l'outbound donne des RDV vite, l'inbound construit un flux sur la durée." },
          { q: "Combien de temps avant les premiers RDV ?", a: "Après le cadrage, les appels commencent. Le délai avant les premiers RDV dépend de la cible : le [sprint test](/tarifs#sprint) de deux semaines sert justement à le mesurer." },
          { q: "Est-ce légal d'appeler des professionnels ?", a: "Oui, la prospection téléphonique B2B est possible sur des coordonnées professionnelles, au sujet de l'activité de la personne. Chacun peut refuser d'être rappelé, et ce refus doit être respecté." },
          { q: "Puis-je garder la main sur le discours ?", a: "Oui, et vous devez le faire : le script s'écrit avec vous, et l'écoute des appels vous permet de corriger le discours chaque semaine." },
        ],
      },
      sprintCta,
    ],
  },
  {
    slug: "prix-rdv-qualifie",
    name: "Prix d'un RDV qualifié",
    summary: "Forfait, paiement au RDV ou SDR interne : comment calculer ce que vous coûte vraiment un rendez-vous.",
    path: "/guides/prix-rdv-qualifie",
    parent: { label: "Guides", href: "/guides" },
    breadcrumb: "Prix d'un RDV qualifié",
    updated: "2026-11-12",
    article: { published: "2026-11-12", readingMinutes: 6 },
    meta: {
      title: "Combien coûte un rendez-vous qualifié en B2B ?",
      description:
        "Prix d'un RDV qualifié en B2B : forfait, paiement au résultat ou SDR interne. La méthode de calcul, des exemples chiffrés et les pièges à éviter.",
    },
    hero: {
      eyebrow: "Guide · Prix",
      title: "Combien coûte un rendez-vous qualifié en B2B ?",
      lead: "Le prix affiché ne dit presque rien. Ce qui compte, c'est ce que vous coûte un RDV qui a vraiment eu lieu. Voici comment le calculer, avec nos propres prix.",
      primary: { label: "Voir nos tarifs", href: "/tarifs" },
      secondary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
    },
    blocks: [
      {
        kind: "answer",
        question: "Combien coûte un rendez-vous qualifié ?",
        answer:
          "Le coût d'un RDV qualifié se calcule ainsi : tout ce que vous payez, divisé par les RDV honorés. Chez Suzalink, il va de 180 à 300 € HT en paiement au résultat, selon la cible. En mission mensuelle, 1 290 € HT plus 100 € par RDV : avec 8 RDV, chaque RDV revient à environ 261 € HT.",
        facts: ["Comptez les RDV **honorés**, pas les RDV pris", "Le prix dépend d'abord de la cible", "Un test de 2 semaines donne le vrai chiffre"],
      },
      {
        kind: "article",
        sections: [
          {
            id: "modeles",
            title: "Quelles sont les façons de payer des rendez-vous ?",
            answer:
              "Il y a trois modèles : le forfait mensuel (un SDR dédié, quel que soit le nombre de RDV), le paiement au résultat (vous ne payez que les RDV honorés) et le modèle hybride (un forfait réduit plus un montant par RDV). Le paiement au résultat transfère le risque au prestataire, qui choisit donc ses cibles.",
            table: {
              caption: "Les trois modèles de prix, avec les prix Suzalink",
              columns: ["Modèle", "Ce que vous payez", "Pour qui", "Chez Suzalink"],
              rows: [
                ["Forfait", "Un SDR dédié, chaque mois", "Flux régulier, cible large", "Inclus dans la mission mensuelle"],
                ["Au résultat", "Chaque RDV honoré", "Cibles déjà connues du prestataire", "180 à 300 € HT par RDV"],
                ["Hybride", "Forfait + montant par RDV", "La plupart des missions", "1 290 € HT / mois + 100 € HT par RDV"],
              ],
              note: "Prix Suzalink HT, novembre 2026. Voir la [page tarifs](/tarifs) pour le détail.",
            },
          },
          {
            id: "calcul",
            title: "Comment calculer le coût réel d'un RDV ?",
            answer:
              "Additionnez tout ce que la prospection vous coûte sur une période (forfait, montants par RDV, mise en service), puis divisez par le nombre de RDV qui ont réellement eu lieu avec une personne de votre cible. Les RDV annulés, reportés sans date ou hors cible ne comptent pas.",
            list: {
              ordered: true,
              items: [
                "Mission mensuelle, 8 RDV honorés : 1 290 + 8 × 100 = 2 090 € HT, soit **261 € HT par RDV**.",
                "Même mission, 12 RDV honorés : 1 290 + 12 × 100 = 2 490 € HT, soit **207,50 € HT par RDV**.",
                "Sprint test, 7 RDV en deux semaines : 990 € HT, soit **141 € HT par RDV**, et le sprint est déduit si vous continuez.",
              ],
            },
            paragraphs: ["Plus la mission donne de RDV, plus le coût unitaire baisse : c'est l'intérêt du modèle hybride pour vous comme pour nous."],
          },
          {
            id: "interne",
            title: "Combien coûte un RDV obtenu par un SDR interne ?",
            answer:
              "Le calcul est le même : coût complet du SDR sur un mois (salaire chargé, outils, téléphonie, temps de management) divisé par les RDV honorés du mois. On oublie souvent le temps de recrutement, de formation et les mois de montée en charge, pendant lesquels le coût par RDV est très élevé.",
            paragraphs: [
              "Exemple, avec des chiffres à remplacer par les vôtres : si un SDR vous coûte 4 000 € par mois tout compris et obtient 10 RDV honorés, chaque RDV coûte 400 €. S'il en obtient 20, 200 €. Faites le calcul sur vos trois derniers mois, pas sur le meilleur.",
            ],
          },
          {
            id: "variables",
            title: "Qu'est-ce qui fait varier le prix d'un RDV ?",
            answer:
              "Cinq facteurs : la difficulté à joindre la cible, la précision de la définition du RDV, la qualité du fichier, la zone géographique et l'attractivité de votre offre. Un RDV avec un directeur financier coûte plus cher qu'un passage en cabinet, mais vaut souvent beaucoup plus.",
            list: {
              items: [
                "**La cible** : un standard qui filtre multiplie les appels nécessaires.",
                "**La définition du RDV** : plus elle est stricte, moins il y a de RDV, mais meilleurs.",
                "**Le fichier** : sur une de nos campagnes, 9 % des numéros étaient faux avant nettoyage.",
                "**La zone** : un commercial terrain impose des RDV groupés par tournée.",
                "**L'offre** : une demande simple et concrète obtient plus de oui.",
              ],
            },
            field:
              "Vers des directions financières, 45 % des contacts n'avaient pas répondu après plusieurs tentatives. Vers des cabinets dentaires, 183 accords en deux mois. Même méthode, cibles différentes : c'est pour ça que notre offre au résultat n'existe que sur les cibles déjà prouvées.",
          },
          {
            id: "pris-ou-honore",
            title: "RDV pris ou RDV honoré : quelle différence ?",
            answer:
              "Un RDV pris est un créneau accepté au téléphone. Un RDV honoré est un rendez-vous qui a eu lieu, avec la bonne personne. Entre les deux, il y a les annulations, les oublis et les mauvais interlocuteurs. Payez les RDV honorés, ou exigez que les autres soient remplacés.",
            paragraphs: [
              "Chez Suzalink, un RDV non honoré ou pris avec quelqu'un hors de la cible est remplacé sous 14 jours, sans frais. C'est écrit dans nos [garanties](/tarifs#prospection).",
            ],
          },
          {
            id: "pieges",
            title: "Comment éviter de payer de mauvais rendez-vous ?",
            answer:
              "Écrivez la définition du RDV qualifié avant le premier appel, exigez une fiche pour chaque RDV, écoutez un échantillon d'appels chaque semaine, confirmez chaque RDV par email dans la journée, et faites remplacer les RDV non honorés au lieu de les payer.",
            list: {
              items: [
                "Une définition écrite : fonction, taille, besoin, horizon.",
                "Une fiche par RDV : besoin, budget, décideur, objections levées.",
                "Dix minutes d'écoute par semaine suffisent pour repérer un problème.",
                "Une confirmation envoyée le jour même, puis un rappel la veille.",
              ],
            },
          },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Le prix d'un RDV",
        items: [
          { q: "Le paiement au RDV est-il toujours plus avantageux ?", a: "Pas forcément. Sur une cible qui donne beaucoup de RDV, le modèle hybride revient souvent moins cher par RDV. Le paiement au résultat est surtout utile pour limiter le risque au départ." },
          { q: "Qu'est-ce qui est inclus dans le prix Suzalink ?", a: "Le SDR, le fichier nettoyé, le script, les enregistrements, le portail client et la fiche de RDV rédigée par l'IA. Voir le détail des [offres](/tarifs)." },
          { q: "Comment connaître le prix d'un RDV sur ma cible ?", a: "En appelant votre cible. Le sprint test de deux semaines vous donne le coût réel d'un RDV avant tout engagement." },
        ],
      },
      sprintCta,
    ],
  },
  {
    slug: "barrage-secretaire",
    name: "Passer le barrage secrétaire",
    summary: "Les heures, les phrases et les réponses aux objections qui font passer le standard, tirées de nos appels.",
    path: "/guides/barrage-secretaire",
    parent: { label: "Guides", href: "/guides" },
    breadcrumb: "Barrage secrétaire",
    updated: "2026-11-12",
    article: { published: "2026-11-12", readingMinutes: 7 },
    meta: {
      title: "Passer le barrage secrétaire : méthode et phrases",
      description:
        "Comment passer le barrage secrétaire en prospection téléphonique B2B : quand appeler, quoi dire, quoi éviter, et comment répondre aux objections.",
    },
    hero: {
      eyebrow: "Guide · Téléprospection",
      title: "Passer le barrage secrétaire, sans forcer",
      lead: "La personne qui décroche n'est pas un obstacle. C'est souvent elle qui décide si votre appel mérite d'aller plus loin. Voici ce que nous avons appris en appelant des milliers de standards.",
      primary: { label: "Confier les appels à nos SDR", href: "/prospection-externalisee" },
      secondary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      visual: {
        src: "/visuals/appel-objection.webp",
        alt: "Illustration d'un appel enregistré : l'objection « On a déjà un prestataire » et la réponse du SDR, avec un rappel planifié jeudi à 9 h 30.",
        width: 1672,
        height: 941,
      },
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment passer le barrage secrétaire ?",
        answer:
          "Appelez aux heures où le décideur est joignable, présentez-vous clairement, dites en une phrase pourquoi vous appelez, et demandez de l'aide plutôt que de contourner la personne. Si elle peut décider seule, faites-lui une demande simple. Notez ses conseils, rappelez au moment qu'elle indique.",
        facts: ["Ne mentez jamais sur l'objet de l'appel", "Demandez le prénom et utilisez-le", "Une demande simple vaut mieux qu'un RDV de 30 minutes"],
      },
      {
        kind: "article",
        sections: [
          {
            id: "definition",
            title: "Qu'est-ce que le barrage secrétaire ?",
            answer:
              "Le barrage secrétaire désigne le filtrage des appels par la personne qui décroche : standard, assistante, accueil. Son rôle est de protéger le temps du décideur. En prospection, c'est le premier interlocuteur, et souvent le plus important.",
            paragraphs: [
              "Le mot « barrage » trompe : on imagine un mur à franchir. En réalité, c'est un filtre qui laisse passer ce qui semble utile, clair et respectueux. Les techniques de contournement (se faire passer pour un client, prétendre être attendu) marchent parfois une fois, puis ferment la porte pour de bon.",
            ],
          },
          {
            id: "assistante",
            title: "Pourquoi l'assistante est votre meilleure alliée ?",
            answer:
              "Parce qu'elle connaît l'agenda, les priorités et les fournisseurs du décideur, et qu'elle décide souvent seule des demandes simples. La convaincre, c'est souvent obtenir le RDV ; la contourner, c'est souvent le perdre.",
            field:
              "Sur notre mission dentaire de fin 2025, c'est presque toujours l'assistante qui a accepté le passage du commercial, sans consulter le praticien. 147 RDV et 36 boîtes de collecte ont été obtenus ainsi. [Voir la mission](/secteurs/cabinets-dentaires).",
          },
          {
            id: "quand",
            title: "Quand appeler pour passer le standard ?",
            answer:
              "Appelez quand le décideur est là mais pas encore pris : en début de matinée et en début d'après-midi. Évitez les heures de rush propres à chaque métier. Notez les horaires et jours de fermeture de chaque entreprise dès le premier appel, et rappelez à un autre moment de la journée si personne ne répond.",
            list: {
              items: [
                "Début de matinée : le décideur est souvent là avant ses réunions.",
                "Début d'après-midi : la pause est finie, l'agenda n'est pas encore plein.",
                "Évitez les veilles de week-end et les heures de soins, de service ou de livraison.",
                "Un appel sans réponse se rappelle à un autre moment, pas à la même heure le lendemain.",
              ],
            },
          },
          {
            id: "phrases",
            title: "Que dire pour passer le barrage secrétaire ?",
            answer:
              "Dites qui vous êtes, pourquoi vous appelez en une phrase, et demandez de l'aide. « Bonjour, Thomas de Suzalink. J'appelle au sujet de vos rendez-vous commerciaux. Qui s'en occupe chez vous, et quel est le meilleur moment pour le joindre ? » Simple, vrai, et facile à accepter.",
            list: {
              items: [
                "« Vous pouvez peut-être m'aider : qui s'occupe de [sujet] chez vous ? »",
                "« Je ne veux pas le déranger : quel est le meilleur moment pour l'avoir deux minutes ? »",
                "« Est-ce que c'est vous qui gérez [les fournisseurs, l'agenda] ? »",
                "« Je peux vous laisser mon nom, et je rappelle jeudi matin, ça vous va ? »",
              ],
            },
          },
          {
            id: "a-eviter",
            title: "Quelles phrases faut-il éviter ?",
            answer:
              "Évitez tout ce qui ressemble à une ruse ou à un script lu : prétendre être attendu, taire le nom de votre société, enchaîner un argumentaire sans respirer, ou insister après un refus clair. Ces phrases marchent rarement, et grillent le contact pour les appels suivants.",
            list: {
              items: [
                "« Il m'attend. » (il ne vous attend pas, et elle le sait)",
                "« C'est personnel. »",
                "« C'est au sujet d'un dossier. » (sans dire lequel)",
                "Trente secondes d'argumentaire avant même de demander à qui vous parlez.",
              ],
            },
          },
          {
            id: "objections",
            title: "Comment répondre aux objections du standard ?",
            answer:
              "Chaque objection du standard a un sens précis : « il est en réunion » veut dire « pas maintenant », « envoyez un mail » veut souvent dire « je ne sais pas si c'est utile ». Répondez à ce sens, proposez un rappel précis, et notez la réponse dans votre CRM pour ne pas reposer la même question.",
            table: {
              caption: "Objections fréquentes au standard et réponses qui marchent",
              columns: ["Objection", "Ce qu'elle veut souvent dire", "Réponse possible"],
              rows: [
                ["« Il est en réunion. »", "Pas maintenant", "« Quel est le meilleur moment pour le rappeler ? Jeudi matin ? »"],
                ["« Envoyez un mail. »", "Je ne sais pas si c'est utile", "« Avec plaisir. Pour qu'il soit utile, c'est vous qui gérez [sujet] ? »"],
                ["« On a déjà un prestataire. »", "Le sujet est couvert", "« Très bien. Ça vous ennuie si on compare en dix minutes, une fois ? »"],
                ["« C'est géré par le siège. »", "Le décideur est ailleurs", "« Merci. Vous auriez le nom de la personne au siège ? »"],
                ["« Il ne prend pas d'appels. »", "Filtrage strict", "« Je comprends. Quelle est la bonne façon de lui proposer quelque chose ? »"],
              ],
            },
            field:
              "Dans nos résultats d'appel, « Barrage secrétaire », « Géré par le siège » et « Mail uniquement » sont des statuts à part entière. Les distinguer permet de rappeler la bonne personne, au bon moment, par le bon canal.",
          },
          {
            id: "relances",
            title: "Combien de fois faut-il rappeler ?",
            answer:
              "Plusieurs fois, à des moments différents de la journée, avant de classer un contact comme injoignable. Un seul essai ne mesure rien : sur notre campagne dentaire, la moitié des appels n'a pas abouti. Planifiez les rappels dans votre CRM plutôt que de compter sur votre mémoire.",
            paragraphs: [
              "Le bon rythme dépend de la cible, mais la règle est la même partout : changer d'heure, noter ce qu'on vous a dit, et arrêter net si la personne demande à ne plus être appelée. Dans [le CRM Suzalink](/crm-agence-prospection), les rappels planifiés et les refus sont gardés sur toutes les missions.",
            ],
          },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Le barrage secrétaire",
        items: [
          { q: "Faut-il demander directement le décideur par son nom ?", a: "Oui, si vous le connaissez : c'est plus clair. Mais présentez-vous d'abord et dites pourquoi vous appelez. Un nom seul, sans contexte, déclenche le filtre." },
          { q: "Que faire si l'assistante refuse de transmettre ?", a: "Demandez la bonne façon de proposer votre sujet : un email à une adresse précise, un autre interlocuteur, un meilleur moment. Si le refus est clair, notez-le et respectez-le." },
          { q: "Le barrage est-il plus fort dans certains secteurs ?", a: "Oui. Les directions financières filtrent beaucoup, les cabinets dentaires laissent souvent l'assistante décider. Le guide [prix d'un RDV qualifié](/guides/prix-rdv-qualifie) explique pourquoi le coût d'un RDV varie autant selon la cible." },
        ],
      },
      sprintCta,
    ],
  },

  // ------------------------------------------------------------------ script d'appel
  {
    slug: "script-appel-prospection",
    name: "Script d'appel de prospection",
    summary: "La structure en cinq temps, des exemples par situation, et les erreurs qui font raccrocher.",
    path: "/guides/script-appel-prospection",
    parent: { label: "Guides", href: "/guides" },
    breadcrumb: "Script d'appel",
    updated: "2026-11-15",
    article: { published: "2026-11-15", readingMinutes: 8 },
    meta: {
      title: "Script de prospection téléphonique : structure et exemples",
      description:
        "Comment écrire un script d'appel de prospection B2B : structure en cinq temps, accroches, réponses aux objections, message vocal. Avec des exemples réels.",
    },
    hero: {
      eyebrow: "Guide · Script d'appel",
      title: "Script d'appel de prospection : la structure qui obtient des RDV",
      lead: "Un script n'est pas un texte à réciter. C'est une trame : les phrases qui comptent, les questions à poser et les réponses aux objections. Voici celle que nos SDR utilisent, mission après mission.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Confier les appels à nos SDR", href: "/prospection-externalisee" },
      bullets: ["Cinq temps, moins de trente secondes avant la première question", "Une seule demande par appel", "Les objections préparées à l'avance", "Un script revu chaque semaine, à l'écoute des appels"],
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment faire un script de prospection téléphonique ?",
        answer:
          "Un bon script de prospection tient en cinq temps : se présenter, donner la raison de l'appel en une phrase, poser une question, proposer un créneau précis, puis confirmer. Il guide le SDR sans être lu mot à mot : on écrit les phrases clés et les réponses aux objections, pas un monologue.",
        facts: ["Se présenter dès la première phrase", "Une raison liée à l'entreprise appelée", "Une question avant tout argument", "Un créneau précis, pas « quand vous voulez »"],
      },
      {
        kind: "article",
        sections: [
          {
            id: "definition",
            title: "Qu'est-ce qu'un script de prospection téléphonique ?",
            answer:
              "C'est la trame d'un appel de prospection : ce que le SDR dit pour se présenter, la raison de l'appel, les questions qui qualifient le besoin, la demande de rendez-vous et les réponses aux objections fréquentes. Il sert à rester clair et constant d'un appel à l'autre, pas à réciter.",
            paragraphs: [
              "Un script lu s'entend au bout de trois mots, et l'interlocuteur raccroche. Un script bien construit, lui, ne s'entend pas : il donne au SDR les bonnes phrases au bon moment, et lui laisse la liberté d'écouter. C'est la différence entre un texte et une trame.",
            ],
          },
          {
            id: "structure",
            title: "Quelle structure pour un script d'appel ?",
            answer:
              "Cinq temps, dans cet ordre : la présentation, la raison de l'appel, une question qui fait parler, une proposition de rendez-vous à une date précise, et la confirmation. Les trois premiers tiennent en moins de trente secondes : au-delà, l'interlocuteur décroche mentalement.",
            table: {
              caption: "La trame en cinq temps",
              columns: ["Temps", "Objectif", "Exemple"],
              rows: [
                ["1. Présentation", "Dire qui l'on est, sans détour", "« Bonjour, Camille, de la part de [société]. »"],
                ["2. Raison", "Pourquoi lui, pourquoi maintenant", "« Je vous appelle parce que vous ouvrez un deuxième site cette année. »"],
                ["3. Question", "Faire parler, vérifier le besoin", "« Comment gérez-vous le recrutement des techniciens aujourd'hui ? »"],
                ["4. Proposition", "Une seule demande, à une date", "« Vingt minutes avec notre consultant, jeudi 10 h ou vendredi 14 h ? »"],
                ["5. Confirmation", "Verrouiller le rendez-vous", "« Je vous envoie l'invitation à cette adresse, c'est bien la bonne ? »"],
              ],
              note: "Exemples écrits pour illustrer la structure. Le script d'une mission est écrit avec le client pendant le cadrage.",
            },
          },
          {
            id: "accroche",
            title: "Comment rédiger une bonne accroche ?",
            answer:
              "Une bonne accroche donne une raison précise d'appeler cette entreprise-là : son activité, un projet visible, une situation qu'elle vit. Elle évite les formules creuses comme « je ne vous dérange pas ? » et ne présente pas l'offre : elle ouvre une conversation.",
            list: {
              items: [
                "Une activité : « Vous vendez aux cabinets dentaires de la région. »",
                "Un projet visible : « Vous recrutez trois commerciaux ce trimestre. »",
                "Une situation : « Vos équipes terrain font beaucoup de notes de frais. »",
                "À éviter : « Je ne vous dérange pas ? », « Je me permets de vous appeler… », « Nous sommes leader de… »",
              ],
            },
            field:
              "Sur notre mission dentaire de fin 2025, la demande était minuscule : « Notre commercial peut-il passer déposer une boîte de collecte ? ». 36 cabinets ont accepté la boîte, et 147 RDV terrain ont été pris. [Voir la mission](/secteurs/cabinets-dentaires).",
          },
          {
            id: "standard",
            title: "Que dire quand le standard décroche ?",
            answer:
              "La même chose, en plus court : qui vous êtes, la raison de l'appel en une phrase, et une demande d'aide. La personne au standard décide souvent si votre appel va plus loin. La traiter comme un obstacle à contourner est le moyen le plus sûr d'être filtré.",
            paragraphs: [
              "Les phrases qui marchent, les créneaux et les objections propres au standard sont détaillés dans notre guide [passer le barrage secrétaire](/guides/barrage-secretaire).",
            ],
          },
          {
            id: "objections",
            title: "Comment préparer les réponses aux objections ?",
            answer:
              "Listez les cinq ou six objections que vous entendez le plus, et écrivez pour chacune une réponse courte qui reconnaît l'objection puis propose une suite concrète : un rappel daté, un échange plus court, une autre personne. Ne répondez jamais par un nouvel argumentaire.",
            table: {
              caption: "Objections fréquentes de l'interlocuteur et réponses possibles",
              columns: ["Objection", "Ce qu'elle veut souvent dire", "Réponse possible"],
              rows: [
                ["« Je n'ai pas le temps. »", "Pas maintenant", "« Je comprends. Vingt minutes jeudi tôt, ou plutôt en fin de journée ? »"],
                ["« Envoyez-moi une documentation. »", "Je ne vois pas encore l'intérêt", "« Je vous l'envoie. Qu'est-ce qui vous serait le plus utile d'y trouver ? »"],
                ["« Ce n'est pas le moment. »", "Il y a une échéance", "« Quand est-ce que ce sera le bon moment ? Je vous rappelle à cette date. »"],
                ["« On a déjà un prestataire. »", "Le sujet est couvert", "« Très bien. Il vous apporte tout ce que vous voulez ? Sinon, on compare en vingt minutes. »"],
                ["« Ça ne m'intéresse pas. »", "Non, ou pas comme ça", "« Merci de me le dire, je le note. C'est le sujet, ou le moment ? »"],
              ],
            },
            field:
              "Dans le CRM Suzalink, chaque objection a son statut de résultat (« Barrage », « Mail uniquement », « Géré par le siège »…). En fin de semaine, on sait lesquelles reviennent, et le script s'ajuste.",
          },
          {
            id: "messagerie",
            title: "Faut-il laisser un message vocal ?",
            answer:
              "Oui, court : votre nom, votre société, la raison de l'appel en une phrase et le moment où vous rappellerez. Ne comptez pas sur un rappel de sa part. Le message prépare surtout l'appel suivant : quand vous rappelez, votre nom n'est plus inconnu.",
            list: {
              items: [
                "« Bonjour Madame Roche, Inès de [société]. Je vous appelle au sujet des notes de frais de vos équipes. Je vous rappelle jeudi en fin de matinée. Bonne journée. »",
                "Moins de vingt secondes, sans argumentaire.",
                "Le rappel est planifié dans le CRM à l'heure annoncée, et tenu.",
              ],
            },
            field:
              "Sur notre campagne dentaire, la moitié des 5 174 appels n'a pas abouti au premier essai. Le rappel planifié, à une autre heure, fait une bonne partie du résultat.",
          },
          {
            id: "erreurs",
            title: "Quelles erreurs font raccrocher ?",
            answer:
              "Taire le nom de sa société, lire son texte, présenter l'offre avant d'avoir posé une question, demander trop (une heure de réunion au premier appel), et insister après un refus clair. Chacune fait perdre l'appel, et souvent le contact pour la suite.",
            list: {
              items: [
                "Parler trente secondes sans laisser l'interlocuteur répondre.",
                "Demander « vous avez deux minutes ? » : la réponse est presque toujours non.",
                "Proposer « quand vous voulez » au lieu de deux créneaux précis.",
                "Ne pas confirmer par écrit : un RDV non confirmé est souvent un RDV non honoré.",
              ],
            },
          },
          {
            id: "ameliorer",
            title: "Comment améliorer son script ?",
            answer:
              "En écoutant les appels. Une fois par semaine, réécoutez quelques appels réussis et quelques appels perdus, notez où la conversation bascule, et changez une seule phrase à la fois. Un script figé depuis trois mois est un script qui ne progresse plus.",
            paragraphs: [
              "Dans [le CRM Suzalink](/crm-agence-prospection), chaque appel est enregistré et rangé avec son résultat : le manager retrouve en quelques clics les appels « RDV pris » et les appels « Barrage » de la semaine. C'est aussi ce que voient nos clients de [prospection externalisée](/prospection-externalisee) dans leur portail.",
            ],
          },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Le script d'appel",
        items: [
          { q: "Faut-il lire son script mot à mot ?", a: "Non. Apprenez la trame et les phrases clés, puis parlez avec vos mots. Un texte lu s'entend tout de suite, et l'interlocuteur raccroche avant la question." },
          { q: "Faut-il un script différent par cible ?", a: "Oui. La raison de l'appel, le vocabulaire et les objections changent d'un secteur à l'autre. Nos pages [secteurs](/secteurs) et [interlocuteurs](/interlocuteurs) montrent ce qui change pour chaque cible." },
          { q: "Combien de temps doit durer le début de l'appel ?", a: "La présentation, la raison et la première question tiennent en moins de trente secondes. Ensuite, c'est l'interlocuteur qui doit parler le plus." },
        ],
      },
      sprintCta,
    ],
  },

  // ------------------------------------------------------------------ RGPD
  {
    slug: "prospection-telephonique-b2b-rgpd",
    name: "Prospection téléphonique B2B et RGPD",
    summary: "Ce qui est permis entre professionnels, ce qui a changé le 11 août 2026, et les règles à respecter à chaque appel.",
    path: "/guides/prospection-telephonique-b2b-rgpd",
    parent: { label: "Guides", href: "/guides" },
    breadcrumb: "Prospection B2B et RGPD",
    updated: "2026-11-15",
    article: { published: "2026-11-15", readingMinutes: 7 },
    meta: {
      title: "Prospection téléphonique B2B et RGPD : les règles 2026",
      description:
        "Peut-on appeler un professionnel sans son accord ? Ce que dit le RGPD, ce qui a changé le 11 août 2026 pour les particuliers, et la checklist d'appel.",
    },
    hero: {
      eyebrow: "Guide · Réglementation",
      title: "Prospection téléphonique B2B et RGPD : ce qui est permis en 2026",
      lead: "Depuis le 11 août 2026, on ne peut plus appeler un particulier sans son accord. Entre professionnels, la règle est différente. Voici ce que nous appliquons à chaque mission, sources à l'appui.",
      primary: { label: "Confier les appels à nos SDR", href: "/prospection-externalisee" },
      secondary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      bullets: ["B2B : pas d'accord préalable, mais une information claire", "Un droit d'opposition simple, et respecté", "Particuliers : consentement obligatoire depuis le 11 août 2026", "Résumé pratique, pas un avis juridique"],
    },
    blocks: [
      {
        kind: "answer",
        question: "A-t-on le droit de prospecter un professionnel par téléphone ?",
        answer:
          "Oui. Vous pouvez appeler un professionnel pour lui proposer un produit ou un service lié à son activité, sans son accord préalable. Le RGPD s'applique : il doit savoir qui l'appelle, d'où viennent ses coordonnées et pouvoir s'opposer simplement. L'accord préalable obligatoire depuis le 11 août 2026 vise les particuliers.",
        facts: [
          "Base légale en B2B : en principe l'**intérêt légitime**",
          "L'offre doit être **liée à son métier**",
          "Un refus s'**enregistre** et se **respecte**",
          "Vérifié le **15 novembre 2026**, sources en bas de page",
        ],
      },
      {
        kind: "article",
        sections: [
          {
            id: "b2b",
            title: "Peut-on démarcher un professionnel sans son accord ?",
            answer:
              "Oui, à deux conditions : l'appel concerne son activité professionnelle, et il est informé de l'usage de ses données avec la possibilité de s'y opposer simplement. C'est ce que la CNIL rappelle pour la prospection téléphonique entre professionnels, encadrée par le RGPD et non par le régime des consommateurs.",
            paragraphs: [
              "Le lien avec le métier est la clé. Appeler un chirurgien-dentiste à son cabinet pour lui proposer du matériel dentaire, c'est de la prospection entre professionnels. Appeler la même personne sur son numéro personnel pour lui vendre une assurance habitation, ce n'est plus du B2B.",
              "Ce guide résume les règles telles que nous les appliquons. Ce n'est pas un avis juridique : pour un cas particulier, demandez à votre juriste ou à votre délégué à la protection des données.",
            ],
          },
          {
            id: "11-aout-2026",
            title: "Qu'est-ce qui a changé le 11 août 2026 ?",
            answer:
              "La loi du 30 juin 2025 a réécrit l'article L223-1 du Code de la consommation : depuis le 11 août 2026, un particulier ne peut plus être démarché par téléphone sans son consentement préalable, sauf contrat en cours. La liste Bloctel a cessé de servir. Ces règles visent les consommateurs, pas les appels entre professionnels.",
            paragraphs: [
              "Conséquence pratique : si votre fichier mélange des particuliers et des professionnels, séparez-les avant d'appeler. Les entrepreneurs individuels et les professions libérales joints sur un numéro personnel sont les cas les plus délicats : en cas de doute, traitez la personne comme un particulier.",
            ],
          },
          {
            id: "pendant-appel",
            title: "Quelles informations donner pendant l'appel ?",
            answer:
              "Dès le début : qui vous êtes, pour quelle entreprise vous appelez et pourquoi. Si la personne le demande : d'où viennent ses coordonnées et comment s'opposer à d'autres appels. Si l'appel est enregistré, elle doit le savoir avant que la conversation commence.",
            list: {
              items: [
                "Votre nom et celui de l'entreprise pour laquelle vous appelez, y compris quand vous appelez pour un client.",
                "L'objet de l'appel, en une phrase.",
                "La source des coordonnées, si on vous la demande : le RGPD oblige à pouvoir la dire.",
                "Le droit de s'opposer, et la façon simple de l'exercer.",
                "L'enregistrement de l'appel, s'il y en a un, annoncé au début.",
              ],
            },
          },
          {
            id: "refus",
            title: "Comment gérer un refus ?",
            answer:
              "Un refus de prospection n'a pas à être justifié et doit être respecté. Notez-le immédiatement, dans un outil partagé par toute l'équipe et toutes les campagnes, pour que personne ne rappelle ce contact pour la même entreprise. Un refus oublié est à la fois une faute et une mauvaise image.",
            field:
              "Chez Suzalink, un refus est enregistré comme un résultat d'appel à part entière, et le contact sort des files d'appels. C'est l'un de nos principes : on se présente, on dit pourquoi on appelle, et un refus est respecté.",
          },
          {
            id: "enregistrement",
            title: "Peut-on enregistrer les appels de prospection ?",
            answer:
              "Oui, avec une finalité définie (formation des équipes, contrôle qualité, preuve d'un engagement) et en informant la personne avant l'enregistrement. Les enregistrements ne se gardent que le temps nécessaire à cette finalité, et leur accès doit être limité aux personnes qui en ont besoin.",
            paragraphs: [
              "Dans le CRM Suzalink, les enregistrements sont rangés dans un stockage privé propre à chaque client (Call Vault), et seules les personnes autorisées y accèdent. Le détail technique est sur la page [CRM pour agences](/crm-agence-prospection).",
            ],
          },
          {
            id: "conservation",
            title: "Combien de temps garder les données d'un prospect ?",
            answer:
              "Dans son référentiel sur la gestion commerciale, la CNIL retient trois ans à compter du dernier contact venant du prospect. Au-delà, sans nouvelle interaction de sa part, supprimez ou anonymisez ses données. Une durée plus longue doit pouvoir se justifier.",
          },
          {
            id: "fichier",
            title: "D'où peuvent venir les numéros appelés ?",
            answer:
              "De sources professionnelles : le site de l'entreprise, des annuaires et registres d'entreprises, ou un fichier acheté à un fournisseur qui a informé les personnes. Dans tous les cas, vous devez pouvoir dire d'où vient un numéro. Un fichier dont personne ne connaît l'origine est un risque.",
            list: {
              items: [
                "Préférez les numéros de standard et les lignes professionnelles aux numéros personnels.",
                "Pour un fichier acheté, demandez au vendeur comment les personnes ont été informées.",
                "Nettoyez le fichier avant d'appeler : doublons, entreprises fermées, contacts ayant refusé.",
              ],
            },
          },
          {
            id: "checklist",
            title: "Quelle checklist avant de lancer une campagne ?",
            answer:
              "Cinq vérifications suffisent dans la plupart des cas : la cible est bien professionnelle, l'offre est liée à son métier, la source du fichier est connue, la mention d'information est prête, et la liste des refus est partagée par toute l'équipe.",
            list: {
              ordered: true,
              items: [
                "Cible professionnelle, appelée sur des coordonnées professionnelles.",
                "Offre en rapport avec l'activité de la personne appelée.",
                "Source du fichier documentée.",
                "Phrase d'information prête : qui appelle, pourquoi, enregistrement éventuel, droit d'opposition.",
                "Liste des refus à jour et partagée entre les campagnes.",
              ],
            },
          },
        ],
        sources: [
          { label: "CNIL : prospection commerciale par téléphone, quelles sont les règles ?", href: "https://cnil.fr/fr/prospection-commerciale-par-telephone-hors-automate-dappel-quelles-sont-les-regles", note: "règles en B2B et en B2C" },
          { label: "economie.gouv.fr : démarchage téléphonique, réglementation pour les professionnels", href: "https://www.economie.gouv.fr/entreprises/bloctel-professionnels-reglementation", note: "réforme du 11 août 2026" },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Prospection B2B et RGPD",
        items: [
          { q: "Faut-il le consentement d'un professionnel pour l'appeler ?", a: "Non, si l'appel concerne son activité professionnelle. Il doit en revanche être informé de l'usage de ses données et pouvoir s'opposer simplement à d'autres appels." },
          { q: "Bloctel concerne-t-il les appels entre professionnels ?", a: "Non. Bloctel concernait les consommateurs. Depuis le 11 août 2026, les particuliers sont protégés par une règle plus stricte : pas d'appel de prospection sans leur consentement préalable." },
          { q: "Un auto-entrepreneur est-il un professionnel ?", a: "Quand vous l'appelez au sujet de son activité, sur des coordonnées professionnelles, oui en principe. Sur un numéro personnel ou pour une offre sans lien avec son métier, traitez-le comme un particulier." },
          { q: "Que risque-t-on en cas de manquement ?", a: "Des sanctions de la CNIL au titre du RGPD, et pour le démarchage des consommateurs, des amendes prévues par le Code de la consommation. Le risque le plus fréquent reste plus simple : une plainte, et une image abîmée auprès de votre cible." },
        ],
      },
      sprintCta,
    ],
  },

  // ------------------------------------------------------------------ SDR
  {
    slug: "sdr-business-developer",
    name: "SDR : rôle, missions et coût",
    summary: "Ce que fait un SDR, ce qui le distingue d'un business developer, comment mesurer son travail et quand l'externaliser.",
    path: "/guides/sdr-business-developer",
    parent: { label: "Guides", href: "/guides" },
    breadcrumb: "Le métier de SDR",
    updated: "2026-11-15",
    article: { published: "2026-11-15", readingMinutes: 7 },
    meta: {
      title: "SDR : définition, missions et coût d'un SDR",
      description:
        "Qu'est-ce qu'un SDR, en quoi il diffère d'un business developer, comment mesurer son travail, ce qu'il coûte vraiment et quand l'externaliser.",
    },
    hero: {
      eyebrow: "Guide · Le métier de SDR",
      title: "SDR : le commercial qui crée les rendez-vous",
      lead: "Le SDR ne vend pas : il ouvre la porte. Ce guide explique son rôle, ses journées, les indicateurs qui comptent et ce qu'il coûte vraiment. Écrit par une équipe d'une vingtaine de SDR.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Équiper mes SDR", href: "/crm-agence-prospection" },
      photo: "caseAgency",
    },
    blocks: [
      {
        kind: "answer",
        question: "Qu'est-ce qu'un SDR ?",
        answer:
          "Un SDR (Sales Development Representative) est le commercial chargé de créer des rendez-vous : il identifie les prospects, les contacte par téléphone ou par email, qualifie leur besoin et réserve un échange avec un commercial qui, lui, vend. Il ne signe pas de contrat : son résultat, c'est un rendez-vous qualifié et honoré.",
        facts: ["Résultat : un **RDV qualifié et honoré**", "Outils : fichier, CRM, téléphonie", "Indicateur clé : le **coût par RDV honoré**"],
      },
      {
        kind: "article",
        sections: [
          {
            id: "definition",
            title: "Que veut dire SDR ?",
            answer:
              "SDR signifie Sales Development Representative, que l'on traduit souvent par « chargé de développement commercial ». C'est le premier maillon de la vente : il transforme une liste d'entreprises en rendez-vous, pour que les commerciaux passent leur temps à vendre plutôt qu'à chercher.",
          },
          {
            id: "differences",
            title: "SDR, BDR, business developer : quelle différence ?",
            answer:
              "Les usages varient selon les entreprises. Aux États-Unis, le SDR traite souvent les demandes entrantes et le BDR prospecte. En France, SDR désigne le plus souvent celui qui prospecte, au téléphone et par email. Le business developer, lui, mène fréquemment tout le cycle, de la prospection à la signature.",
            table: {
              caption: "Les rôles de la vente, du premier appel à la signature",
              columns: ["Rôle", "Ce qu'il fait", "Son résultat"],
              rows: [
                ["SDR", "Prospecte, qualifie, réserve des rendez-vous", "RDV qualifiés et honorés"],
                ["BDR", "Prospection sortante, souvent sur des comptes ciblés", "RDV sur des comptes choisis"],
                ["Business developer", "Prospecte et vend, souvent seul", "Contrats signés"],
                ["Account executive", "Mène les rendez-vous, négocie, signe", "Chiffre d'affaires"],
              ],
              note: "Les intitulés varient d'une entreprise à l'autre : regardez le résultat attendu plutôt que le titre.",
            },
          },
          {
            id: "journee",
            title: "Que fait un SDR au quotidien ?",
            answer:
              "Il prépare et nettoie son fichier, enchaîne les appels en planifiant des rappels à d'autres heures, qualifie le besoin pendant la conversation, réserve le rendez-vous dans l'agenda du commercial, et note tout dans le CRM pour que rien ne se perde.",
            list: {
              items: [
                "Préparer le fichier : cibles, numéros, doublons, contacts ayant refusé.",
                "Appeler, et rappeler à des heures différentes ceux qui n'ont pas répondu.",
                "Qualifier : besoin, échéance, décideur, outil actuel.",
                "Réserver le rendez-vous et rédiger la fiche qui le prépare.",
                "Mettre à jour le CRM : résultat de chaque appel, rappels, refus.",
              ],
            },
            field:
              "Nos SDR passent souvent d'une mission à l'autre dans la même journée. C'est pour ça que le CRM Suzalink donne à chaque mission sa propre file d'appels, son script et ses statuts.",
          },
          {
            id: "competences",
            title: "Quelles qualités pour être un bon SDR ?",
            answer:
              "L'écoute avant l'aisance : un bon SDR pose une question et se tait. Il faut aussi de la constance, parce que la plupart des appels n'aboutissent pas, de la rigueur dans le CRM, et assez de curiosité pour comprendre en une minute le métier de la personne appelée.",
            list: {
              items: ["Écouter plus que parler.", "Encaisser les refus sans les prendre pour soi.", "Noter tout, tout de suite.", "Apprendre le vocabulaire de chaque cible."],
            },
          },
          {
            id: "indicateurs",
            title: "Comment mesurer le travail d'un SDR ?",
            answer:
              "Par une chaîne d'indicateurs, du volume au résultat : appels passés, interlocuteurs joints, conversations, rendez-vous pris, rendez-vous honorés. Le chiffre qui résume tout est le coût par rendez-vous honoré : tout ce que coûte la prospection, divisé par les rendez-vous qui ont vraiment eu lieu.",
            paragraphs: [
              "Un SDR qui passe beaucoup d'appels sans conversation a un problème de fichier ou de créneau. Un SDR qui a des conversations sans rendez-vous a un problème de script. Notre guide [prix d'un RDV qualifié](/guides/prix-rdv-qualifie) détaille le calcul du coût par rendez-vous.",
            ],
            field: "Sur notre mission vers les cabinets dentaires de fin 2025 : 5 174 appels, 147 RDV terrain et 36 boîtes de collecte acceptées, en deux mois.",
          },
          {
            id: "cout",
            title: "Combien coûte un SDR ?",
            answer:
              "Le salaire n'est qu'une partie du coût. Ajoutez les charges, le recrutement, les outils (CRM, téléphonie, fichier), le temps du manager et les semaines de montée en compétence, pendant lesquelles il prend peu de rendez-vous. Comparez toujours avec le coût par rendez-vous honoré d'une solution externalisée.",
            table: {
              caption: "Ce que vous payez, selon le modèle",
              columns: ["Poste", "SDR recruté", "Prospection externalisée Suzalink"],
              rows: [
                ["Salaire et charges", "À votre charge", "Inclus"],
                ["Recrutement et formation", "À votre charge, plusieurs semaines", "Inclus, cadrage en quelques jours"],
                ["Outils (CRM, téléphonie, enregistrements)", "À votre charge", "Inclus, portail client compris"],
                ["Prix", "Selon votre grille salariale", "Mission : 1 290 € HT / mois + 100 € HT par RDV honoré"],
                ["Pour tester", "Une période d'essai", "Sprint test : 990 € HT, deux semaines"],
              ],
              note: "Prix Suzalink publics, hors taxes : voir [tarifs](/tarifs).",
            },
          },
          {
            id: "externaliser",
            title: "Recruter ou externaliser un SDR ?",
            answer:
              "Externalisez pour aller vite, tester une cible ou ne pas porter un recrutement. Recrutez quand le volume est stable et que quelqu'un peut former et manager le SDR. Beaucoup d'entreprises commencent par externaliser, mesurent le coût d'un rendez-vous, puis décident.",
            paragraphs: ["Le guide [externaliser sa prospection commerciale](/guides/externaliser-prospection-commerciale) compare les deux options critère par critère."],
          },
          {
            id: "outils",
            title: "De quels outils un SDR a-t-il besoin ?",
            answer:
              "Un fichier propre, une file d'appels qui enchaîne les contacts, une téléphonie intégrée, l'enregistrement des appels pour progresser, et un CRM où chaque résultat se note en un clic. Quand ces outils sont séparés, le SDR passe une partie de sa journée à recopier.",
            paragraphs: [
              "C'est ce que réunit [le CRM Suzalink](/crm-agence-prospection) : file d'appels, résultat en une touche, téléphonie Allo et OnOff, enregistrements et fiche de RDV rédigée par l'IA, dès 59 € HT par utilisateur et par mois.",
            ],
          },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Le métier de SDR",
        items: [
          { q: "Un SDR prospecte-t-il seulement par téléphone ?", a: "Non. Le téléphone reste le canal qui obtient une réponse claire, mais un SDR combine souvent appels, emails et messages, chacun préparant l'autre." },
          { q: "Combien de temps pour qu'un SDR soit efficace ?", a: "Le temps de connaître l'offre, la cible et ses objections : plusieurs semaines pour un recrutement. C'est l'une des raisons pour lesquelles un sprint externalisé de deux semaines donne une première mesure plus vite." },
          { q: "Qui manage les SDR ?", a: "Un manager commercial ou un responsable des SDR. Il suit les indicateurs, réécoute des appels et ajuste le script chaque semaine. Dans le CRM Suzalink, il voit le rythme de l'équipe en direct." },
        ],
      },
      sprintCta,
    ],
  },
];

export const findGuide = (slug: string) => guides.find((g) => g.slug === slug);
