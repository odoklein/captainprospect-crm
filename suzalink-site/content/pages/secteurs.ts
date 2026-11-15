/**
 * Pages cibles :
 *   /secteurs/<slug>        : un secteur que nous appelons (cabinets dentaires, industrie…)
 *   /interlocuteurs/<slug>  : une fonction que nous appelons (DAF, dirigeants de PME…)
 * Une entrée = une page : la route, le sitemap, le menu, la rubrique et l'accueil suivent.
 *
 * RÈGLE « RIEN D'INVENTÉ » :
 * - `state: "documented"` : la mission est terminée et ses chiffres sont publiés (bloc `proof`).
 * - `state: "running"` : nous appelons cette cible en ce moment, AUCUN chiffre n'est publié
 *   (bloc `status`). La page décrit la méthode, pas des résultats.
 * - Les ouvertures d'appel (bloc `opener`) sont des exemples écrits, présentés comme tels.
 *
 * Sources :
 * - Cabinets dentaires : mission nov.–déc. 2025 (Drive « LES RDV » : 147 RDV, 36 boîtes, 20+ départements ;
 *   5 174 appels, 50 % sans réponse, 9 % de numéros faux) et fichier national nettoyé en 2026 (6 732 cabinets).
 * - Industrie, transport : dirigeants et directions financières de PME, appelés depuis 2025 (rubrique /secteurs).
 * - Directions financières, éditeurs de logiciels : mission 2026 pour un éditeur de logiciel de notes de frais,
 *   cible DAF (client anonymisé, mission en cours).
 */
import type { IconName } from "@/components/ui/Icon";
import type { LandingPage, Block } from "./types";

export type Sector = LandingPage & {
  slug: string;
  /** Nom court pour les listes et le menu. */
  name: string;
  group: "secteur" | "interlocuteur";
  icon: IconName;
  state: "documented" | "running";
  /** Une phrase pour les cartes (accueil, rubrique, pages voisines). */
  card: string;
};

const sprintCta = (title: string, intro: string): Block => ({
  kind: "cta",
  id: "commencer",
  eyebrow: "Sprint test",
  title,
  intro,
  primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
  secondary: { label: "Voir les offres", href: "/tarifs" },
});

const runningNote =
  "Exemple écrit pour illustrer la méthode, pas la transcription d'un appel réel. Le script de votre mission est écrit avec vous pendant le cadrage.";

export const targets: Sector[] = [
  // ------------------------------------------------------------------ cabinets dentaires (documenté)
  {
    slug: "cabinets-dentaires",
    name: "Cabinets dentaires",
    group: "secteur",
    icon: "tooth",
    state: "documented",
    card: "147 RDV terrain et 36 boîtes de collecte en deux mois, sur plus de 20 départements.",
    path: "/secteurs/cabinets-dentaires",
    parent: { label: "Secteurs", href: "/secteurs" },
    meta: {
      title: "Prospection des cabinets dentaires par téléphone",
      description:
        "Vous vendez aux cabinets dentaires ? Nos SDR obtiennent l'accord de l'assistante et remplissent vos tournées. 147 RDV terrain sur une mission de fin 2025.",
    },
    breadcrumb: "Cabinets dentaires",
    updated: "2026-11-15",
    hero: {
      eyebrow: "Secteur · Cabinets dentaires",
      badge: { label: "Mission documentée", tone: "documented" },
      title: "Joignez les cabinets dentaires, pas seulement leur répondeur",
      lead: "Dans un cabinet, la personne qui décroche est presque toujours l'assistante. C'est souvent elle qui dit oui. Nos SDR savent lui parler, au bon moment, avec une demande qu'elle peut accepter seule.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Voir la méthode", href: "#ce-qui-marche" },
      visual: {
        src: "/visuals/tournees-dentaires.webp",
        alt: "Illustration : carte de France des tournées, avec les départements où des RDV et des boîtes de collecte ont été obtenus.",
        width: 1254,
        height: 1254,
      },
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment prospecter les cabinets dentaires par téléphone ?",
        answer:
          "Appelez hors des heures de soins, parlez d'abord à l'assistante, qui gère l'agenda et les fournisseurs, et proposez une demande simple qu'elle peut accepter seule, comme le passage d'un commercial. Rappelez à d'autres heures les cabinets non joints et groupez les RDV par département pour remplir des tournées.",
        facts: [
          "**147 RDV** terrain en deux mois, fin 2025",
          "**36 boîtes de collecte** acceptées",
          "Plus de **20 départements** couverts",
          "Fichier national nettoyé : **6 732 cabinets**",
        ],
      },
      {
        kind: "proof",
        id: "mission",
        eyebrow: "Notre mission de référence",
        title: "Deux mois d'appels vers les cabinets dentaires",
        intro: "Fin 2025, un client devait faire accepter le passage de son commercial terrain dans des cabinets de toute la France.",
        stats: [
          { value: "5 174", label: "appels passés" },
          { value: "147", label: "RDV pris pour le commercial terrain" },
          { value: "36", label: "cabinets d'accord pour une boîte de collecte" },
          { value: "20+", label: "départements, du Nord aux Alpes-Maritimes" },
        ],
        story:
          "La moitié des appels n'a jamais abouti et 9 % des numéros étaient faux. C'est pour ça que chaque cabinet non joint est rappelé à un autre moment de la journée, et que le fichier est nettoyé avant de commencer.",
        note: "Client anonymisé. Chiffres issus de notre suivi de mission, novembre et décembre 2025.",
      },
      {
        kind: "people",
        id: "qui-appeler",
        eyebrow: "Qui fait quoi au cabinet",
        title: "L'assistante décroche, et décide souvent",
        intro: "Savoir qui peut dire oui évite de demander un rendez-vous avec le praticien quand l'accueil suffit.",
        items: [
          {
            role: "Décroche",
            who: "L'assistante ou la secrétaire",
            body: "Elle gère l'agenda, le courrier et les fournisseurs. C'est elle qui filtre, et c'est à elle qu'on parle en premier.",
          },
          {
            role: "Décide",
            who: "L'assistante, pour un passage",
            body: "Sur notre mission, c'est elle qui a accepté la plupart des passages de commercial et des boîtes de collecte, sans consulter le praticien.",
          },
          {
            role: "Valide",
            who: "Le praticien titulaire",
            body: "Il entre en jeu quand l'achat engage le cabinet : équipement, logiciel, contrat. Il se joint entre deux patients, rarement plus.",
          },
        ],
      },
      {
        kind: "pains",
        id: "ce-qui-marche",
        eyebrow: "Ce que nous avons appris",
        title: "Quatre choses qui changent tout avec un cabinet",
        items: [
          {
            title: "Parler à l'assistante, pas la contourner",
            body: "Elle gère l'agenda, le courrier et les fournisseurs. Dans nos notes d'appel, c'est elle qui accepte le passage du commercial, le plus souvent sans consulter le praticien.",
          },
          {
            title: "Appeler hors des soins",
            body: "En début de matinée ou de début d'après-midi. Beaucoup de cabinets ferment le mercredi ou finissent plus tôt le vendredi : nos SDR notent les horaires de chaque cabinet dans le CRM.",
          },
          {
            title: "Demander peu, et concret",
            body: "« Notre commercial peut-il passer déposer une boîte ? » est plus facile à accepter qu'« un RDV de trente minutes ». Sur notre mission, 36 cabinets ont dit oui à la boîte.",
          },
          {
            title: "Grouper les RDV par tournée",
            body: "Un commercial terrain ne traverse pas la France pour un RDV. Nous appelons département par département pour remplir des tournées entières.",
          },
        ],
      },
      {
        kind: "timing",
        id: "quand-appeler",
        eyebrow: "Quand appeler",
        title: "Le bon créneau, c'est entre deux patients",
        good: [
          { when: "Début de matinée", why: "Avant les premiers soins, l'assistante a deux minutes pour écouter." },
          { when: "Reprise de l'après-midi", why: "Juste après la pause, l'agenda n'a pas encore pris de retard." },
          { when: "Un autre jour, une autre heure", why: "Un cabinet non joint est rappelé à un autre moment : la moitié de nos appels n'aboutissait pas au premier essai." },
        ],
        avoid: [
          { when: "Le mercredi", why: "Beaucoup de cabinets ferment ou réduisent leurs horaires." },
          { when: "Le vendredi après-midi", why: "Souvent écourté. On vous dira de rappeler la semaine suivante." },
          { when: "En plein soin", why: "L'assistante est au fauteuil : la réponse sera « rappelez plus tard »." },
        ],
        note: "Les horaires de chaque cabinet sont notés dans le CRM dès le premier appel, pour que le rappel tombe au bon moment.",
      },
      {
        kind: "opener",
        id: "ouverture",
        eyebrow: "Au téléphone",
        title: "Une demande que l'accueil peut accepter",
        intro: "La structure qui a obtenu nos 36 boîtes de collecte : se présenter, une seule demande, une date.",
        points: [
          "On dit qui l'on est et pourquoi on appelle, dès la première phrase.",
          "Une seule demande, petite et concrète : un passage, pas un RDV de trente minutes.",
          "Une date proposée, plutôt qu'une question ouverte.",
        ],
        lines: [
          { who: "SDR", text: "Bonjour, Camille, de la part du laboratoire [nom]. Je vous appelle pour une question rapide." },
          { who: "Interlocuteur", text: "Oui, c'est à quel sujet ?" },
          { who: "SDR", text: "Notre commercial passe dans votre secteur la semaine prochaine. Il pourrait déposer une boîte de collecte à l'accueil, deux minutes, sans voir le docteur." },
          { who: "Interlocuteur", text: "Ça dépend du jour, on est fermés le mercredi." },
          { who: "SDR", text: "Alors mardi matin, vers 9 h 30 ? Je vous envoie la confirmation par mail." },
        ],
        note: "Exemple écrit à partir de la méthode de notre mission 2025, pas la transcription d'un appel réel.",
      },
      {
        kind: "objections",
        id: "objections",
        eyebrow: "Ce qu'on nous répond",
        title: "Les objections de l'accueil, et nos réponses",
        items: [
          {
            objection: "Le docteur ne reçoit pas les commerciaux.",
            reply: "Ce n'est pas nécessaire : le commercial dépose la boîte à l'accueil, en deux minutes. Le docteur n'est pas dérangé.",
          },
          {
            objection: "Envoyez-nous un mail.",
            reply: "Avec plaisir. À quel nom je l'adresse ? Et pour que vous n'ayez rien à faire, je propose déjà un passage mardi matin, que vous pourrez décaler.",
          },
          {
            objection: "On a déjà un fournisseur.",
            reply: "Comme la plupart des cabinets que nous appelons. Un passage ne change rien à vos habitudes : vous comparez, simplement.",
          },
          {
            objection: "Rappelez plus tard.",
            reply: "Bien sûr. Plutôt demain en début de matinée, ou jeudi à la reprise de l'après-midi ? Le rappel est noté dans le CRM à l'heure choisie.",
          },
        ],
      },
      {
        kind: "features",
        id: "pour-qui",
        eyebrow: "Pour qui",
        title: "Vous vendez aux cabinets dentaires",
        items: [
          { icon: "users", title: "Laboratoires de prothèse", body: "Faire connaître le labo, obtenir un premier envoi ou une visite." },
          { icon: "server", title: "Fournisseurs et distributeurs", body: "Matériel, consommables, équipement : décrocher la visite du commercial." },
          { icon: "sparkle", title: "Récupération de métaux précieux", body: "Couronnes et alliages usagés : faire accepter une boîte de collecte." },
          { icon: "database", title: "Logiciels de cabinet", body: "Agenda, facturation, imagerie : obtenir une démo avec le praticien." },
          { icon: "chart", title: "Services aux praticiens", body: "Expertise comptable, assurance, financement : un RDV au bon moment." },
          { icon: "mail", title: "Formation continue", body: "Remplir une session ou un webinaire avec des praticiens ciblés." },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Prospecter les cabinets dentaires",
        items: [
          {
            q: "À quelle heure appeler un cabinet dentaire ?",
            a: "En dehors des soins : en début de matinée ou en début d'après-midi. Évitez les mercredis et les fins de vendredi, souvent fermés ou écourtés. Le plus fiable reste de noter les horaires de chaque cabinet dès le premier appel.",
          },
          {
            q: "Faut-il parler au dentiste ou à l'assistante ?",
            a: "À l'assistante d'abord. Elle gère l'agenda et les fournisseurs, et sur notre mission de 2025 c'est elle qui a accepté la plupart des passages. Le praticien entre en jeu quand l'achat engage le cabinet.",
          },
          {
            q: "Où trouver un fichier de cabinets dentaires ?",
            a: "Les annuaires publics de praticiens sont un bon point de départ, mais ils contiennent des doublons et des numéros périmés. Nous nettoyons le fichier avant d'appeler : sur un fichier national, il nous est resté 6 732 cabinets à joindre.",
          },
          {
            q: "A-t-on le droit d'appeler un cabinet dentaire pour prospecter ?",
            a: "Oui, quand l'appel concerne l'activité professionnelle du cabinet : c'est de la prospection entre professionnels, encadrée par le RGPD. Il faut se présenter, dire pourquoi on appelle et respecter un refus. Le détail est dans notre guide [prospection téléphonique B2B et RGPD](/guides/prospection-telephonique-b2b-rgpd).",
          },
          {
            q: "Combien coûte une campagne vers les cabinets dentaires ?",
            a: "Le sprint test coûte 990 € HT pour deux semaines. Comme nous connaissons cette cible, l'offre 100 % résultat est aussi possible : vous ne payez que les RDV honorés.",
          },
        ],
      },
      sprintCta(
        "Testez sur vos départements",
        "Donnez-nous votre zone et votre offre. En deux semaines, vous savez combien de cabinets acceptent votre commercial, et à quel coût.",
      ),
    ],
  },

  // ------------------------------------------------------------------ industrie (en cours)
  {
    slug: "industrie",
    name: "Industrie",
    group: "secteur",
    icon: "factory",
    state: "running",
    card: "Dirigeants et directions financières de PME industrielles, appelés depuis 2025.",
    path: "/secteurs/industrie",
    parent: { label: "Secteurs", href: "/secteurs" },
    meta: {
      title: "Prospection téléphonique des PME industrielles",
      description:
        "Joindre le dirigeant d'une PME industrielle : qui décroche, quand appeler, quoi dire. La méthode de nos SDR, qui appellent l'industrie depuis 2025.",
    },
    breadcrumb: "Industrie",
    updated: "2026-11-15",
    hero: {
      eyebrow: "Secteur · Industrie",
      badge: { label: "Mission en cours", tone: "running" },
      title: "Décrocher un RDV avec une PME industrielle",
      lead: "Un dirigeant d'usine passe plus de temps en atelier qu'à son bureau. Nos SDR savent quand il décroche, qui filtre ses appels, et quelle demande tient en une minute.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Voir la méthode", href: "#qui-appeler" },
      photo: "cardsFlow",
      bullets: ["Dirigeants, DAF, directeurs de site", "Rappels à des heures différentes", "Chaque appel enregistré et visible"],
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment prospecter une PME industrielle par téléphone ?",
        answer:
          "Ciblez le bon établissement, siège ou usine, puis appelez le dirigeant tôt le matin ou en fin de journée, quand il n'est pas en atelier. Passez l'accueil avec une raison précise, demandez un échange court, et rappelez à d'autres heures : un dirigeant industriel se joint rarement au premier essai.",
        facts: [
          "Appelé depuis 2025 : **dirigeants et DAF** de PME industrielles",
          "Fichier construit par **activité et taille**, avant le premier appel",
          "Chaque appel **enregistré**, visible dans votre portail",
        ],
      },
      {
        kind: "status",
        id: "mission",
        eyebrow: "Notre mission",
        title: "Nous appelons l'industrie en ce moment",
        since: "depuis 2025",
        intro: "Nos SDR prospectent des dirigeants et des directions financières de PME industrielles pour nos clients.",
        promise:
          "Nous publierons les chiffres quand la mission sera terminée, comme pour [les cabinets dentaires](/secteurs/cabinets-dentaires). D'ici là, le sprint test vous donne vos propres chiffres en deux semaines.",
        facts: ["Dirigeants et DAF de PME", "Fichiers par activité et effectif", "Pas de chiffre publié avant la fin de la mission"],
        action: { label: "Tester sur ma cible", href: "/demo?offre=sprint" },
      },
      {
        kind: "people",
        id: "qui-appeler",
        eyebrow: "Qui fait quoi",
        title: "Dans une PME industrielle, qui dit oui ?",
        intro: "Plus l'entreprise est petite, plus tout remonte au dirigeant. Dans un groupe, la décision part souvent au siège.",
        items: [
          { role: "Décroche", who: "L'accueil ou l'assistante de direction", body: "Elle connaît l'agenda du dirigeant et sait s'il est en atelier, en réunion ou chez un client." },
          { role: "Décide", who: "Le dirigeant", body: "En PME, il signe presque tout. Il veut savoir en une phrase ce que vous apportez à son usine." },
          { role: "Influence", who: "Directeur de site, achats, maintenance", body: "Ils vivent le problème au quotidien. Les convaincre aide quand l'achat touche la production." },
          { role: "Valide", who: "Le DAF, ou le siège du groupe", body: "Dès qu'il y a un budget. Dans une filiale, vérifiez où se prend la décision avant d'appeler." },
        ],
      },
      {
        kind: "timing",
        id: "quand-appeler",
        eyebrow: "Quand appeler",
        title: "Avant l'atelier, ou après",
        good: [
          { when: "Tôt le matin", why: "Beaucoup de dirigeants industriels sont au bureau avant la prise de poste, et décrochent eux-mêmes." },
          { when: "Fin de journée", why: "Une fois l'atelier lancé ou arrêté, le dirigeant repasse par son bureau." },
          { when: "Milieu de semaine", why: "Le lundi sert à lancer la production, le vendredi à la boucler." },
        ],
        avoid: [
          { when: "Lancement de production", why: "Le premier créneau de la journée est pris par l'atelier et les urgences." },
          { when: "Août et fin décembre", why: "De nombreux sites ferment ou tournent en effectif réduit. Préparez votre fichier pendant ce temps." },
          { when: "Clôture du mois", why: "Si vous visez le DAF, les premiers jours du mois sont consacrés à la clôture." },
        ],
      },
      {
        kind: "pains",
        id: "methode",
        eyebrow: "Ce qui fait la différence",
        title: "Quatre règles pour l'industrie",
        items: [
          {
            title: "Cibler l'établissement, pas seulement l'entreprise",
            body: "Une même société peut avoir un siège et plusieurs usines. Le bon numéro est celui du site où vit votre problème, ou celui du siège quand la décision y remonte.",
          },
          {
            title: "Construire le fichier par activité et taille",
            body: "Les codes d'activité de l'industrie manufacturière (NAF 10 à 33) et les tranches d'effectif donnent une liste propre. Le fichier est nettoyé avant le premier appel.",
          },
          {
            title: "Parler production, pas fonctionnalités",
            body: "Un dirigeant d'usine écoute ce qui touche ses délais, ses arrêts ou ses coûts. Le script est écrit avec vous, dans ses mots.",
          },
          {
            title: "Rappeler, à d'autres heures",
            body: "Un dirigeant non joint le matin peut l'être le soir. Chaque rappel est planifié dans le CRM, avec l'historique des essais.",
          },
        ],
      },
      {
        kind: "opener",
        id: "ouverture",
        eyebrow: "Au téléphone",
        title: "Une raison précise, puis une demande courte",
        intro: "Le dirigeant décide en quelques secondes s'il écoute la suite.",
        points: [
          "On cite son activité, pour montrer qu'on ne l'appelle pas au hasard.",
          "Une conséquence concrète pour son usine, pas une liste de fonctionnalités.",
          "On demande vingt minutes, à une date précise.",
        ],
        lines: [
          { who: "SDR", text: "Bonjour Monsieur Martin, Léa, de la part de [société]. Je vous appelle parce que vous fabriquez des pièces en série pour l'automobile." },
          { who: "Interlocuteur", text: "Oui. C'est pour quoi ?" },
          { who: "SDR", text: "Nous aidons des ateliers comme le vôtre à réduire leurs arrêts machine. Je ne vais pas tout vous expliquer au téléphone : vingt minutes avec notre ingénieur, jeudi ou vendredi, ça vous paraît possible ?" },
          { who: "Interlocuteur", text: "Jeudi, plutôt en fin de journée." },
        ],
        note: runningNote,
      },
      {
        kind: "objections",
        id: "objections",
        eyebrow: "Ce qu'on nous répond",
        title: "Les objections d'un dirigeant industriel",
        items: [
          { objection: "On est en pleine production, rappelez-moi.", reply: "Bien sûr. Ce soir après 17 h 30, ou demain avant 8 h 30 ? Le rappel est noté à l'heure exacte." },
          { objection: "On a déjà un fournisseur.", reply: "C'est souvent le cas. L'échange sert à comparer, pas à changer demain : vous gardez la décision." },
          { objection: "Envoyez-moi une plaquette.", reply: "Je vous l'envoie. Pour qu'elle serve, je réserve aussi vingt minutes avec notre expert, que vous pourrez annuler si la plaquette suffit." },
          { objection: "Ça se décide au siège.", reply: "Merci, c'est précieux. Qui suit ce sujet au siège ? Je l'appelle en citant notre échange." },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Prospecter l'industrie",
        items: [
          {
            q: "Quel est le meilleur moment pour appeler un dirigeant industriel ?",
            a: "Tôt le matin, avant la prise de poste, ou en fin de journée, quand l'atelier tourne seul. Évitez le premier créneau de production, les fermetures d'août et de fin décembre, et rappelez à une autre heure plutôt que le même jour.",
          },
          {
            q: "Faut-il appeler le siège ou l'usine ?",
            a: "Ça dépend de qui décide. Pour un achat lié à la production, le site est souvent le bon point d'entrée. Dans une filiale de groupe, la décision peut remonter au siège : la première question du SDR sert à le savoir.",
          },
          {
            q: "Comment construire un fichier d'entreprises industrielles ?",
            a: "Partez des codes d'activité de l'industrie manufacturière (NAF 10 à 33), filtrez par effectif et par région, puis nettoyez : doublons, établissements fermés, numéros de standard génériques. Nous le faisons avant le premier appel de chaque mission.",
          },
          {
            q: "Combien de RDV peut-on obtenir dans l'industrie ?",
            a: "Nous ne publions pas de chiffre avant la fin de la mission en cours. Le [sprint test](/tarifs#sprint) vous donne le vôtre en deux semaines, sur votre cible et avec votre offre.",
          },
        ],
      },
      sprintCta("Testez sur vos usines cibles", "Deux semaines pour savoir combien de dirigeants industriels acceptent un échange avec vous, et à quel coût par RDV."),
    ],
  },

  // ------------------------------------------------------------------ transport et logistique (en cours)
  {
    slug: "transport-logistique",
    name: "Transport et logistique",
    group: "secteur",
    icon: "truck",
    state: "running",
    card: "Dirigeants de transporteurs et de prestataires logistiques, appelés depuis 2025.",
    path: "/secteurs/transport-logistique",
    parent: { label: "Secteurs", href: "/secteurs" },
    meta: {
      title: "Prospection des transporteurs et logisticiens",
      description:
        "Joindre un dirigeant de transport routier ou de logistique : éviter les heures d'exploitation, passer le dispatch, obtenir un RDV. Notre méthode terrain.",
    },
    breadcrumb: "Transport et logistique",
    updated: "2026-11-15",
    hero: {
      eyebrow: "Secteur · Transport et logistique",
      badge: { label: "Mission en cours", tone: "running" },
      title: "Joindre un transporteur entre deux départs",
      lead: "Dans une entreprise de transport, le téléphone sonne d'abord à l'exploitation, et l'exploitation n'a pas le temps. Nos SDR appellent quand les camions sont partis, et savent à qui demander le dirigeant.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Voir la méthode", href: "#quand-appeler" },
      photo: "pathGoal",
      bullets: ["Dirigeants, exploitation, gestion de parc", "Appels hors des pics d'exploitation", "Chaque appel enregistré et visible"],
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment prospecter les entreprises de transport par téléphone ?",
        answer:
          "Appelez en milieu de matinée ou en début d'après-midi, quand les départs sont faits et que l'exploitation respire. Demandez le dirigeant par son nom, expliquez en une phrase ce que vous changez pour ses tournées ou sa flotte, et proposez un échange court. Évitez les fins de mois et les pics de saison.",
        facts: [
          "Appelé depuis 2025 : **dirigeants** de transport et de logistique",
          "Créneaux choisis **hors des pics d'exploitation**",
          "Fichier construit par **code d'activité** (NAF 49.41, 52.10, 52.29)",
        ],
      },
      {
        kind: "status",
        id: "mission",
        eyebrow: "Notre mission",
        title: "Nous appelons le transport en ce moment",
        since: "depuis 2025",
        intro: "Nos SDR prospectent des dirigeants d'entreprises de transport routier et de logistique pour nos clients.",
        promise:
          "Les chiffres seront publiés à la fin de la mission, comme pour [les cabinets dentaires](/secteurs/cabinets-dentaires). Le sprint test vous donne les vôtres en deux semaines.",
        facts: ["Transport routier de marchandises", "Entreposage et logistique", "Pas de chiffre publié avant la fin de la mission"],
        action: { label: "Tester sur ma cible", href: "/demo?offre=sprint" },
      },
      {
        kind: "timing",
        id: "quand-appeler",
        eyebrow: "Quand appeler",
        title: "Quand les camions sont partis",
        intro: "Le rythme de l'exploitation dicte le bon moment, bien plus que l'agenda du dirigeant.",
        good: [
          { when: "Milieu de matinée", why: "Les départs sont faits, l'exploitation traite moins d'urgences." },
          { when: "Début d'après-midi", why: "Avant la préparation des tournées du lendemain." },
          { when: "Tôt le matin, en direct", why: "Beaucoup de dirigeants de transport arrivent avant leurs équipes, si vous avez leur ligne." },
        ],
        avoid: [
          { when: "Heures de départ", why: "Le matin tôt, l'exploitation gère chauffeurs et quais : personne ne prendra votre appel." },
          { when: "Fin d'après-midi", why: "Retours de tournée et planification du lendemain." },
          { when: "Fin de mois et pics de saison", why: "Facturation, inventaires, pointe de fin d'année en logistique : rappelez après." },
        ],
      },
      {
        kind: "people",
        id: "qui-appeler",
        eyebrow: "Qui fait quoi",
        title: "Du dispatch au dirigeant",
        items: [
          { role: "Décroche", who: "L'exploitation ou l'accueil", body: "Souvent le standard bascule sur le dispatch. Soyez bref et demandez le dirigeant par son nom." },
          { role: "Décide", who: "Le dirigeant", body: "Dans les entreprises de transport, souvent familiales, il garde la main sur les achats qui comptent." },
          { role: "Influence", who: "Responsable d'exploitation ou de parc", body: "Il vit les tournées, la flotte et les chauffeurs. Son avis pèse sur tout outil ou service qui le touche." },
          { role: "Valide", who: "Le DAF ou le RAF", body: "Pour tout engagement financier : flotte, assurance, financement, logiciel." },
        ],
      },
      {
        kind: "pains",
        id: "methode",
        eyebrow: "Ce qui fait la différence",
        title: "Ce qui marche avec un transporteur",
        items: [
          {
            title: "Construire le bon fichier",
            body: "Les codes d'activité séparent fret interurbain (49.41A), fret de proximité (49.41B), entreposage (52.10) et organisation des transports (52.29). Chacun appelle un discours différent.",
          },
          {
            title: "Respecter l'exploitation",
            body: "Si la personne au bout du fil gère un départ, on s'excuse, on demande le bon moment et on raccroche. Le rappel est noté à l'heure dite.",
          },
          {
            title: "Parler tournées, flotte, marges",
            body: "Un dirigeant de transport pense en kilomètres à vide, en taux de remplissage et en coût par tournée. Le script parle ses mots.",
          },
          {
            title: "Grouper par région",
            body: "Si votre commercial se déplace, les RDV sont pris région par région, pour remplir des journées entières.",
          },
        ],
      },
      {
        kind: "opener",
        id: "ouverture",
        eyebrow: "Au téléphone",
        title: "Bref, et au bon moment",
        intro: "Au transport, l'efficacité est une marque de respect.",
        points: [
          "On demande d'abord si c'est le bon moment.",
          "Une phrase sur ce qui change pour ses tournées.",
          "Un échange court, à une date proposée.",
        ],
        lines: [
          { who: "SDR", text: "Bonjour, Thomas, de la part de [société]. Je tombe bien, ou vous êtes en plein départ ?" },
          { who: "Interlocuteur", text: "Ça va, allez-y." },
          { who: "SDR", text: "Je cherche à joindre Monsieur Lefèvre au sujet de vos tournées régionales. Nous aidons des transporteurs à réduire les kilomètres à vide. Il est plutôt joignable le matin ou l'après-midi ?" },
          { who: "Interlocuteur", text: "Le matin, avant 8 heures. Je vous donne sa ligne." },
        ],
        note: runningNote,
      },
      {
        kind: "objections",
        id: "objections",
        eyebrow: "Ce qu'on nous répond",
        title: "Les objections du transport",
        items: [
          { objection: "On n'a pas le temps, c'est le rush.", reply: "Je comprends, je ne vous retiens pas. Demain 10 h, c'est plus calme ? Je note le rappel." },
          { objection: "On a déjà un logiciel.", reply: "La plupart des transporteurs que nous appelons en ont un. L'échange sert à voir ce qu'il ne fait pas pour vous." },
          { objection: "Nos chauffeurs n'utiliseront jamais ça.", reply: "C'est la première question de notre expert : comment ça marche sur le terrain. Vingt minutes suffisent pour le voir." },
          { objection: "Rappelez après la saison.", reply: "Volontiers. Je note un rappel début janvier, et je vous envoie d'ici là un résumé de deux lignes." },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Prospecter le transport et la logistique",
        items: [
          {
            q: "À quelle heure appeler une entreprise de transport ?",
            a: "En milieu de matinée ou en début d'après-midi, une fois les départs faits et avant la préparation du lendemain. Le dirigeant se joint aussi très tôt le matin, si vous avez sa ligne directe.",
          },
          {
            q: "Comment trouver un fichier de transporteurs ?",
            a: "Partez des codes NAF du transport routier de fret (49.41A, 49.41B) et de la logistique (52.10, 52.29), filtrez par effectif et par région, puis nettoyez les doublons et les établissements fermés avant d'appeler.",
          },
          {
            q: "Qui décide des achats dans une entreprise de transport ?",
            a: "Le dirigeant dans la plupart des PME, avec l'avis du responsable d'exploitation ou de parc pour tout ce qui touche les tournées, et du DAF dès qu'il y a un engagement financier.",
          },
          {
            q: "Combien coûte une campagne vers les transporteurs ?",
            a: "Le [sprint test](/tarifs#sprint) coûte 990 € HT pour deux semaines, déduits si vous continuez. À la fin, vous connaissez le coût réel d'un RDV sur votre cible.",
          },
        ],
      },
      sprintCta("Testez sur vos régions", "Donnez-nous vos zones et votre offre. En deux semaines, vous savez combien de transporteurs acceptent un échange, et à quel coût."),
    ],
  },

  // ------------------------------------------------------------------ éditeurs de logiciels (en cours)
  {
    slug: "editeurs-logiciels-saas",
    name: "Éditeurs de logiciels B2B",
    group: "secteur",
    icon: "code",
    state: "running",
    card: "Des démos pour vos commerciaux, auprès des décideurs qui achètent votre logiciel.",
    path: "/secteurs/editeurs-logiciels-saas",
    parent: { label: "Secteurs", href: "/secteurs" },
    meta: {
      title: "Prospection pour éditeurs SaaS : des démos qualifiées",
      description:
        "Éditeur de logiciel B2B ? Nos SDR appellent vos décideurs et réservent des démos qualifiées dans l'agenda de vos commerciaux. Chaque appel enregistré.",
    },
    breadcrumb: "Éditeurs de logiciels",
    updated: "2026-11-15",
    hero: {
      eyebrow: "Secteur · Éditeurs SaaS",
      badge: { label: "Mission en cours", tone: "running" },
      title: "Des démos qualifiées dans l'agenda de vos commerciaux",
      lead: "Vos account executives sont faits pour faire des démos, pas pour passer leurs matinées au téléphone. Nos SDR appellent vos décideurs, qualifient le besoin et réservent la démo, avec une fiche prête pour la préparer.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Comment ça marche", href: "#ouverture" },
      photo: "callSplit",
      bullets: ["Démos qualifiées, pas de simples rappels", "Fiche de RDV rédigée par l'IA", "Chaque appel enregistré et visible"],
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment générer des démos qualifiées pour un logiciel B2B ?",
        answer:
          "Ciblez une fonction précise qui vit le problème que votre logiciel règle, appelez-la avec une raison concrète, qualifiez en quelques questions (outil actuel, échéance, décideur) et réservez la démo directement dans l'agenda du commercial. Le téléphone complète l'email : il obtient une réponse là où un mail reste sans suite.",
        facts: [
          "Mission en cours pour un **éditeur de logiciel de notes de frais**",
          "Cible : **directions financières** de PME et d'ETI",
          "Chaque démo arrive avec sa **fiche de RDV**",
        ],
      },
      {
        kind: "status",
        id: "mission",
        eyebrow: "Notre mission",
        title: "Nous appelons pour un éditeur SaaS en ce moment",
        since: "en 2026",
        intro: "Un éditeur de logiciel de gestion des notes de frais nous a confié la prospection de directions financières.",
        promise:
          "Les chiffres seront publiés à la fin de la mission, client anonymisé. Pour votre logiciel, le sprint test vous donne le coût réel d'une démo en deux semaines.",
        facts: ["Logiciel B2B de gestion des dépenses", "Cible : DAF et RAF", "Pas de chiffre publié avant la fin de la mission"],
        action: { label: "Tester pour mon logiciel", href: "/demo?offre=sprint" },
      },
      {
        kind: "pains",
        id: "pourquoi",
        eyebrow: "Pourquoi externaliser",
        title: "Ce qui bloque la croissance d'un éditeur",
        items: [
          { title: "Vos commerciaux prospectent au lieu de vendre", body: "Chaque matinée passée à chercher des RDV est une matinée sans démo. Nos SDR prennent cette part, vos commerciaux closent." },
          { title: "L'email seul ne répond plus", body: "Les boîtes des décideurs débordent. Un appel bien préparé obtient une réponse claire, oui, non ou plus tard, avec une raison." },
          { title: "L'inbound ne suffit pas", body: "Attendre les demandes de démo plafonne vite. L'outbound va chercher les comptes que vous avez choisis." },
          { title: "Des démos sans préparation", body: "Une démo réussie se prépare. Chaque RDV arrive avec une [fiche rédigée par l'IA](/prospection-externalisee#fiche-rdv) : besoin, outil actuel, échéance, objections." },
        ],
      },
      {
        kind: "people",
        id: "qui-appeler",
        eyebrow: "Qui fait quoi",
        title: "Qui achète un logiciel B2B ?",
        intro: "Le décideur change selon votre logiciel. La structure, elle, se retrouve presque partout.",
        items: [
          { role: "Décroche", who: "Le standard, ou la ligne directe", body: "Une ligne directe change tout. À défaut, une raison précise fait passer l'accueil." },
          { role: "Décide", who: "Le responsable métier", body: "Celui qui vit le problème : le DAF pour la finance, le DRH pour la paie, le directeur commercial pour un CRM." },
          { role: "Influence", who: "Les futurs utilisateurs", body: "Comptables, équipes, managers : ce sont eux qui feront vivre l'outil, ou l'abandonneront." },
          { role: "Valide", who: "La DSI et la direction", body: "Sécurité, intégrations, RGPD, budget. Prévoyez les réponses avant la démo." },
        ],
      },
      {
        kind: "opener",
        id: "ouverture",
        eyebrow: "Au téléphone",
        title: "Qualifier en trois questions",
        intro: "Une démo n'a de valeur que si le besoin, l'échéance et le décideur sont clairs.",
        points: [
          "Quel outil aujourd'hui, et qu'est-ce qui coince ?",
          "Une échéance : fin de contrat, budget, projet.",
          "Qui d'autre doit voir la démo.",
        ],
        lines: [
          { who: "SDR", text: "Bonjour Madame Roche, Inès, de la part de [éditeur]. Je vous appelle au sujet des notes de frais de vos équipes terrain. Vous les gérez comment aujourd'hui ?" },
          { who: "Interlocuteur", text: "Sur un tableur, et c'est la galère chaque fin de mois." },
          { who: "SDR", text: "C'est justement ce que nous réglons. Vous auriez trente minutes pour une démo, avec la personne qui fait la saisie ? Mardi 10 h ou jeudi 14 h ?" },
          { who: "Interlocuteur", text: "Jeudi, avec ma comptable." },
        ],
        note: runningNote,
      },
      {
        kind: "objections",
        id: "objections",
        eyebrow: "Ce qu'on nous répond",
        title: "Les objections face à un logiciel",
        items: [
          { objection: "On a déjà un outil.", reply: "Très bien. Il fait tout ce que vous voulez ? Si oui, je ne vous dérange plus. Sinon, trente minutes pour comparer." },
          { objection: "On est engagés jusqu'à l'an prochain.", reply: "Parfait, c'est le bon moment pour comparer sans pression. Je note votre échéance et je vous rappelle trois mois avant." },
          { objection: "Envoyez-moi une vidéo.", reply: "Je vous l'envoie. Une démo sur vos propres cas reste plus parlante : je réserve un créneau, que vous pourrez annuler." },
          { objection: "Pas de budget cette année.", reply: "Je comprends. Les budgets de l'an prochain se préparent souvent en fin d'année : je vous rappelle à ce moment-là ?" },
        ],
      },
      {
        kind: "steps",
        id: "deroulement",
        howto: true,
        eyebrow: "Le déroulé",
        title: "De votre fichier à la démo",
        items: [
          { icon: "settings", title: "Cadrage", body: "Votre persona, votre offre, ce qui fait une démo qualifiée. Écrit ensemble.", when: "Jour 1" },
          { icon: "dashboard", title: "Fichier", body: "Construit ou nettoyé avant le premier appel.", when: "Jours 2 à 3" },
          { icon: "phoneRing", title: "Appels", body: "Rappels à des heures différentes, chaque appel enregistré.", when: "Dès la 1re semaine" },
          { icon: "calendarCheck", title: "Démo réservée", body: "Dans l'agenda du commercial, avec la fiche de RDV.", when: "Au fil de l'eau" },
          { icon: "growth", title: "Bilan", body: "Coût réel d'une démo, objections entendues, ajustements.", when: "Chaque semaine" },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Prospection pour éditeurs SaaS",
        items: [
          {
            q: "Faut-il un SDR interne ou externalisé pour un éditeur SaaS ?",
            a: "Externaliser est plus rapide et réversible : vous mesurez le coût d'une démo avant de recruter. Un SDR interne devient intéressant quand le volume est stable et que quelqu'un peut le manager. Notre [guide sur le métier de SDR](/guides/sdr-business-developer) compare les deux.",
          },
          {
            q: "Comment les démos arrivent-elles chez nos commerciaux ?",
            a: "Elles sont réservées dans l'agenda de vos commerciaux pendant l'appel, avec une fiche de RDV : besoin, outil actuel, échéance, personnes présentes, objections. Vous écoutez l'appel d'origine dans votre portail.",
          },
          {
            q: "Qu'est-ce qu'une démo qualifiée ?",
            a: "C'est une démo avec la bonne fonction, un besoin exprimé et une échéance, définie par écrit avec vous avant la mission. Une démo hors de cette définition est remplacée.",
          },
          {
            q: "Combien coûte la prospection pour un éditeur de logiciel ?",
            a: "Le [sprint test](/tarifs#sprint) coûte 990 € HT pour deux semaines, déduits si vous continuez. La mission mensuelle coûte 1 290 € HT par mois, plus 100 € HT par RDV honoré.",
          },
        ],
      },
      sprintCta("Testez sur votre persona", "Deux semaines pour savoir combien de démos qualifiées votre cible donne au téléphone, et à quel coût."),
    ],
  },

  // ------------------------------------------------------------------ interlocuteurs : DAF (en cours)
  {
    slug: "directions-financieres",
    name: "Directions financières (DAF)",
    group: "interlocuteur",
    icon: "euro",
    state: "running",
    card: "DAF, RAF et contrôleurs de gestion : une cible qui filtre, et qui exige un message précis.",
    path: "/interlocuteurs/directions-financieres",
    parent: { label: "Interlocuteurs", href: "/interlocuteurs" },
    meta: {
      title: "Prospecter les DAF : joindre une direction financière",
      description:
        "Comment joindre un DAF par téléphone : éviter les clôtures, passer l'assistante, parler chiffres. La méthode de nos SDR, qui appellent les DAF en 2026.",
    },
    breadcrumb: "Directions financières",
    updated: "2026-11-15",
    hero: {
      eyebrow: "Interlocuteur · DAF",
      badge: { label: "Mission en cours", tone: "running" },
      title: "Joindre un DAF, en dehors des clôtures",
      lead: "Un directeur financier filtre ses appels et déteste perdre son temps. Il écoute pourtant une proposition précise, chiffrée, au bon moment du mois. C'est tout le travail de nos SDR.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Quand appeler", href: "#quand-appeler" },
      photo: "caseFreelance",
      bullets: ["DAF, RAF, contrôleurs de gestion", "Calendrier de clôture respecté", "Chaque appel enregistré et visible"],
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment joindre un DAF par téléphone ?",
        answer:
          "Appelez en milieu de mois, jamais pendant les clôtures, et visez la bonne fonction : DAF en ETI, RAF ou dirigeant en PME. Ouvrez sur un chiffre ou un risque qui le concerne, demandez vingt minutes à une date précise, et confirmez par écrit. Un DAF accepte un échange court, pas une présentation.",
        facts: [
          "Mission 2026 : **DAF et RAF** de PME et d'ETI",
          "Appels calés **hors des clôtures**",
          "Une ouverture sur **un chiffre**, pas sur l'offre",
        ],
      },
      {
        kind: "timing",
        id: "quand-appeler",
        eyebrow: "Quand appeler",
        title: "Le calendrier d'un DAF dicte tout",
        good: [
          { when: "Milieu de mois", why: "La clôture mensuelle est passée, la suivante n'a pas commencé." },
          { when: "De mai à octobre", why: "Hors clôture annuelle pour la plupart des entreprises, dont l'exercice finit le 31 décembre." },
          { when: "Septembre à novembre", why: "Les budgets de l'an prochain se préparent : le bon moment pour une dépense nouvelle." },
        ],
        avoid: [
          { when: "Début de mois", why: "Clôture mensuelle, reporting, trésorerie : il ne prendra pas l'appel." },
          { when: "Janvier à avril", why: "Clôture annuelle, bilan et liasse fiscale pour les exercices calés sur l'année civile." },
          { when: "Fin de trimestre", why: "Reporting au groupe ou aux actionnaires dans les ETI." },
        ],
        note: "Le calendrier change si l'exercice de l'entreprise ne finit pas le 31 décembre : nos SDR notent la date de clôture dans le CRM quand ils l'apprennent.",
      },
      {
        kind: "people",
        id: "qui-appeler",
        eyebrow: "Qui appeler",
        title: "DAF, RAF ou dirigeant : selon la taille",
        intro: "Le titre de DAF n'existe pas partout. En petite PME, la finance est souvent ailleurs.",
        items: [
          { role: "Décroche", who: "L'accueil ou l'assistante", body: "Une raison précise et le nom de la personne font passer. « C'est au sujet de vos notes de frais » marche mieux que « c'est commercial »." },
          { role: "Décide", who: "Le DAF, ou le RAF en PME", body: "Il porte les sujets de coûts, de trésorerie, d'outils financiers. En petite PME, c'est souvent le dirigeant lui-même." },
          { role: "Influence", who: "Contrôle de gestion et comptabilité", body: "Ils utilisent l'outil au quotidien. Les associer à la démo évite un « non » plus tard." },
          { role: "Valide", who: "Le dirigeant, et parfois l'expert-comptable", body: "Pour un engagement important, ou quand la comptabilité est externalisée." },
        ],
      },
      {
        kind: "opener",
        id: "ouverture",
        eyebrow: "Au téléphone",
        title: "Un chiffre, une question, un créneau",
        intro: "Un DAF juge la qualité de l'appel à la précision de la première phrase.",
        points: [
          "On ouvre sur un coût, un délai ou un risque qu'il connaît.",
          "On pose une question, plutôt que de dérouler l'offre.",
          "On propose vingt minutes, à une date précise.",
        ],
        lines: [
          { who: "SDR", text: "Bonjour Monsieur Garnier, Hugo, de la part de [éditeur]. Une question rapide : vos notes de frais, combien de temps prennent-elles à votre équipe chaque fin de mois ?" },
          { who: "Interlocuteur", text: "Trop. Pourquoi ?" },
          { who: "SDR", text: "Nous automatisons cette saisie. Plutôt que de vous l'expliquer, je vous propose vingt minutes de démo le 18, en milieu de mois. 10 h ou 14 h ?" },
          { who: "Interlocuteur", text: "14 h. Envoyez l'invitation." },
        ],
        note: runningNote,
      },
      {
        kind: "objections",
        id: "objections",
        eyebrow: "Ce qu'on nous répond",
        title: "Les objections d'un DAF",
        items: [
          { objection: "Envoyez-moi un mail.", reply: "Je vous l'envoie, en trois lignes. Pour que vous puissiez juger, je propose aussi vingt minutes le 18 : vous annulez si le mail suffit." },
          { objection: "Ce n'est pas une priorité.", reply: "Je comprends. Quand préparez-vous les budgets de l'an prochain ? Je vous rappelle à ce moment-là." },
          { objection: "Notre expert-comptable s'en occupe.", reply: "Très bien. L'outil lui fait gagner du temps aussi : voulez-vous que la démo se fasse avec lui ?" },
          { objection: "Je veux un ROI chiffré.", reply: "C'est exactement l'objet de la démo : nous partons de vos volumes pour chiffrer le gain. Il faut juste vingt minutes." },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Prospecter les directions financières",
        items: [
          {
            q: "Quel est le meilleur moment pour appeler un DAF ?",
            a: "En milieu de mois, hors des clôtures mensuelles, trimestrielles et annuelles. Pour une dépense nouvelle, l'automne est souvent le meilleur moment : c'est la période de préparation des budgets de l'année suivante.",
          },
          {
            q: "Faut-il appeler le DAF ou le dirigeant d'une PME ?",
            a: "Ça dépend de la taille. En ETI, le DAF décide. En PME, c'est souvent un RAF, ou le dirigeant lui-même quand la comptabilité est confiée à un expert-comptable. La première question du SDR sert à le savoir.",
          },
          {
            q: "Comment passer l'assistante d'un DAF ?",
            a: "Avec le nom de la personne et une raison précise, liée à son métier. Une demande vague est filtrée, une raison concrète passe. Notre guide [passer le barrage secrétaire](/guides/barrage-secretaire) détaille la méthode.",
          },
          {
            q: "Combien de RDV avec des DAF peut-on obtenir ?",
            a: "Nous ne publions pas de chiffre avant la fin de la mission en cours. Le [sprint test](/tarifs#sprint) vous donne le vôtre en deux semaines, sur votre cible.",
          },
        ],
      },
      sprintCta("Testez sur les DAF de votre cible", "Deux semaines pour savoir combien de directions financières acceptent un échange, et à quel coût par RDV."),
    ],
  },

  // ------------------------------------------------------------------ interlocuteurs : dirigeants de PME (en cours)
  {
    slug: "dirigeants-pme",
    name: "Dirigeants de PME",
    group: "interlocuteur",
    icon: "briefcase",
    state: "running",
    card: "Le dirigeant décide de presque tout en PME. Encore faut-il le joindre.",
    path: "/interlocuteurs/dirigeants-pme",
    parent: { label: "Interlocuteurs", href: "/interlocuteurs" },
    meta: {
      title: "Prospecter les dirigeants de PME par téléphone",
      description:
        "Comment joindre un dirigeant de PME : les créneaux où il décroche, l'assistante, les objections et la demande qui marche. La méthode de nos SDR.",
    },
    breadcrumb: "Dirigeants de PME",
    updated: "2026-11-15",
    hero: {
      eyebrow: "Interlocuteur · Dirigeants",
      badge: { label: "Mission en cours", tone: "running" },
      title: "Joindre le dirigeant d'une PME, sans le harceler",
      lead: "En PME, le dirigeant décide de presque tout, et tout le monde veut lui parler. Nos SDR le joignent aux heures où il décroche lui-même, avec une raison qui tient en une phrase.",
      primary: { label: "Lancer un sprint test", href: "/demo?offre=sprint" },
      secondary: { label: "Quand appeler", href: "#quand-appeler" },
      photo: "binder",
      bullets: ["Les créneaux où il décroche lui-même", "Un respect strict des refus", "Chaque appel enregistré et visible"],
    },
    blocks: [
      {
        kind: "answer",
        question: "Comment joindre un dirigeant de PME par téléphone ?",
        answer:
          "Appelez tôt le matin ou en fin de journée, quand il décroche lui-même, et demandez-le par son nom. Donnez en une phrase la raison de l'appel, liée à son entreprise, puis proposez un échange court à une date précise. Rappelez à d'autres heures plutôt que plusieurs fois le même jour.",
        facts: [
          "Appelés depuis 2025 : **dirigeants** de PME industrielles et de transport",
          "Rappels à **des heures différentes**",
          "Un refus est **enregistré et respecté**",
        ],
      },
      {
        kind: "timing",
        id: "quand-appeler",
        eyebrow: "Quand appeler",
        title: "Quand le dirigeant décroche lui-même",
        good: [
          { when: "Avant 9 heures", why: "Beaucoup de dirigeants arrivent avant leurs équipes, et l'accueil n'est pas encore là pour filtrer." },
          { when: "Après 18 heures", why: "La journée se termine, il repasse par son bureau et répond plus volontiers." },
          { when: "Mardi au jeudi", why: "Le lundi sert à lancer la semaine, le vendredi à la boucler." },
        ],
        avoid: [
          { when: "Lundi matin", why: "Réunions, urgences du week-end, planning de la semaine." },
          { when: "Vendredi après-midi", why: "Il est déjà ailleurs : la réponse sera « rappelez lundi »." },
          { when: "Trois fois le même jour", why: "Mieux vaut un autre jour, une autre heure. Insister ferme la porte." },
        ],
      },
      {
        kind: "people",
        id: "qui-appeler",
        eyebrow: "Qui fait quoi",
        title: "Autour du dirigeant",
        items: [
          { role: "Décroche", who: "L'accueil ou l'assistante de direction", body: "Elle protège son agenda. Elle laisse passer une raison précise, et le nom du dirigeant." },
          { role: "Décide", who: "Le dirigeant", body: "Il veut comprendre en une phrase ce que vous apportez à son entreprise, pas à toutes les entreprises." },
          { role: "Influence", who: "Son bras droit", body: "Directeur commercial, DAF ou directeur d'exploitation : il prépare souvent la décision." },
          { role: "Valide", who: "Associés ou groupe", body: "Pour un engagement important, ou quand l'entreprise appartient à un groupe." },
        ],
      },
      {
        kind: "opener",
        id: "ouverture",
        eyebrow: "Au téléphone",
        title: "Son entreprise, une phrase, une date",
        intro: "Un dirigeant raccroche vite quand il sent un script lu.",
        points: [
          "On cite son entreprise, pour montrer qu'on ne l'appelle pas au hasard.",
          "Une seule phrase sur ce que vous apportez.",
          "Un échange court, à une date proposée.",
        ],
        lines: [
          { who: "SDR", text: "Bonjour Madame Dubois, Sarah, de la part de [société]. Je vous appelle parce que vous ouvrez un deuxième site à Lyon cette année." },
          { who: "Interlocuteur", text: "Oui. Et donc ?" },
          { who: "SDR", text: "Nous aidons les PME qui ouvrent un site à recruter leurs premiers techniciens. Vingt minutes avec notre consultant, mardi ou jeudi ?" },
          { who: "Interlocuteur", text: "Jeudi matin, tôt." },
        ],
        note: runningNote,
      },
      {
        kind: "objections",
        id: "objections",
        eyebrow: "Ce qu'on nous répond",
        title: "Les objections d'un dirigeant",
        items: [
          { objection: "Je n'ai pas le temps.", reply: "Je comprends, c'est pour ça que je ne vous demande que vingt minutes, au moment qui vous arrange. Plutôt tôt le matin ?" },
          { objection: "Comment avez-vous eu mon numéro ?", reply: "Nous l'avons trouvé dans [source]. Si vous préférez que nous ne vous appelions plus, je le note tout de suite." },
          { objection: "Envoyez-moi un mail.", reply: "Je vous l'envoie, en trois lignes. Je vous propose aussi un créneau : vous l'annulez si le mail suffit." },
          { objection: "Ça ne m'intéresse pas.", reply: "Merci de me le dire. Je le note pour ne plus vous déranger. Juste par curiosité : c'est le sujet, ou le moment ?" },
        ],
      },
      {
        kind: "faq",
        id: "faq",
        eyebrow: "Questions fréquentes",
        title: "Prospecter les dirigeants de PME",
        items: [
          {
            q: "À quelle heure appeler un dirigeant de PME ?",
            a: "Tôt le matin, avant 9 heures, ou après 18 heures, quand il décroche lui-même. Préférez le mardi, le mercredi et le jeudi, et rappelez à une autre heure plutôt que plusieurs fois dans la même journée.",
          },
          {
            q: "Comment passer l'assistante d'un dirigeant ?",
            a: "Avec le nom du dirigeant et une raison précise, liée à son entreprise. Notre guide [passer le barrage secrétaire](/guides/barrage-secretaire) détaille ce qui marche, avec nos chiffres d'appels.",
          },
          {
            q: "Faut-il dire d'où vient son numéro ?",
            a: "Oui, si on vous le demande, et c'est même une obligation d'information du RGPD. Un refus doit être enregistré et respecté. Voir notre guide [prospection téléphonique B2B et RGPD](/guides/prospection-telephonique-b2b-rgpd).",
          },
          {
            q: "Combien d'appels pour joindre un dirigeant ?",
            a: "Rarement un seul. Sur notre mission vers les cabinets dentaires, la moitié des appels n'aboutissait pas au premier essai. C'est pourquoi chaque contact est rappelé à des heures différentes, avec l'historique dans le CRM.",
          },
        ],
      },
      sprintCta("Testez sur vos dirigeants cibles", "Deux semaines pour savoir combien de dirigeants de votre cible acceptent un échange, et à quel coût par RDV."),
    ],
  },
];

export const sectors = targets.filter((t) => t.group === "secteur");
export const contacts = targets.filter((t) => t.group === "interlocuteur");

export const findSector = (slug: string) => sectors.find((s) => s.slug === slug);
export const findContact = (slug: string) => contacts.find((s) => s.slug === slug);

/** Les autres pages cibles, pour le maillage interne en bas de page. */
export const relatedTargets = (slug: string) => targets.filter((t) => t.slug !== slug);
