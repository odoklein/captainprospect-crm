import type { HrGuideStep } from "./HrGuide";

export const HR_PAGE_GUIDE_KEY = "hr-guide-page-v2";
export const HR_DETAIL_GUIDE_KEY = "hr-guide-detail-v1";

export const HR_PAGE_GUIDE: HrGuideStep[] = [
  {
    title: "Bienvenue dans votre espace RH & Paie",
    body: (
      <>
        <p>
          Cette page calcule <strong>automatiquement</strong> ce que chaque personne de votre équipe doit
          toucher ce mois-ci, à partir de ses journées de travail, de ses appels et de ses rendez-vous.
        </p>
        <p>Ce guide dure 2 minutes. Vous pourrez le relancer quand vous voulez avec le bouton « Comment ça marche ? ».</p>
      </>
    ),
  },
  {
    target: "month",
    title: "Choisissez le mois",
    body: (
      <p>
        Utilisez les flèches pour passer d’un mois à l’autre. Tout ce que vous voyez en dessous concerne
        uniquement le mois affiché.
      </p>
    ),
  },
  {
    target: "recalculate",
    title: "Mettez les chiffres à jour",
    body: (
      <>
        <p>
          Pendant le mois, les appels et les rendez-vous continuent d’arriver. Ce bouton enregistre les
          derniers chiffres pour toute l’équipe.
        </p>
        <p>
          Pas d’inquiétude : les dossiers déjà <strong>validés</strong> ou <strong>payés</strong> ne sont
          jamais modifiés.
        </p>
      </>
    ),
  },
  {
    target: "export",
    title: "Envoyez la paie au comptable",
    body: (
      <p>
        « Exporter » télécharge un fichier Excel avec, pour chaque personne affichée, les jours payés, le fixe,
        les primes, les ajustements et le total.
      </p>
    ),
  },
  {
    target: "summary",
    title: "L’essentiel en un coup d’œil",
    body: (
      <p>
        Le nombre de personnes, le montant total estimé à verser, et l’activité du mois. Ces chiffres suivent
        les filtres que vous choisissez plus bas.
      </p>
    ),
  },
  {
    target: "attention",
    title: "Ce qui a besoin de vous",
    body: (
      <>
        <p>
          Ce compteur indique combien de personnes demandent une action de votre part avant de pouvoir payer.
        </p>
        <p>Cliquez dessus pour n’afficher que ces personnes.</p>
      </>
    ),
  },
  {
    target: "pipeline",
    title: "Où en est le mois ?",
    body: (
      <>
        <p>
          Cette barre montre combien de dossiers sont à chaque étape, et le montant correspondant. L’objectif en fin
          de mois : tout en vert (« Payé »).
        </p>
        <p>Cliquez sur une étape pour n’afficher que ces dossiers.</p>
      </>
    ),
  },
  {
    target: "filters",
    title: "Retrouvez quelqu’un rapidement",
    body: (
      <p>
        Cherchez par nom (astuce : touche « / » du clavier), ou filtrez par manager, type de contrat ou étape. Par
        défaut, seuls les SDR sont affichés. Cliquez sur un titre de colonne pour trier.
      </p>
    ),
  },
  {
    target: "row-select",
    title: "Traitez plusieurs personnes d’un coup",
    body: (
      <>
        <p>
          Cochez plusieurs personnes : une barre apparaît en bas de l’écran pour les passer toutes « À vérifier »,
          les valider ou les marquer payées.
        </p>
        <p>Les dossiers qui ne sont pas prêts sont automatiquement laissés de côté, avec la raison.</p>
      </>
    ),
  },
  {
    target: "row-person",
    title: "Une ligne = une personne",
    body: (
      <p>
        Cliquez sur le nom pour ouvrir son dossier : ses règles, ses 12 derniers mois de paie, et qui a changé
        quoi.
      </p>
    ),
  },
  {
    target: "row-alerts",
    title: "Les alertes",
    body: (
      <>
        <p>
          <strong className="text-amber-700">« À statuer »</strong> : certains jours, la personne a fait moins
          d’appels que prévu. Vous devez décider si ces jours sont payés ou non.
        </p>
        <p>
          <strong className="text-rose-700">« Règles à configurer »</strong> : on ne sait pas encore combien la
          payer. Renseignez son salaire d’abord.
        </p>
        <p>
          <strong className="text-sky-700">« À recalculer »</strong> : de nouvelles activités sont arrivées depuis
          le dernier enregistrement.
        </p>
      </>
    ),
  },
  {
    target: "row-total",
    title: "Le montant à payer",
    body: (
      <p>
        C’est la somme du salaire fixe (réduit s’il y a des absences), de la prime par rendez-vous, et d’un
        éventuel ajustement que vous avez ajouté à la main.
      </p>
    ),
  },
  {
    target: "row-detail",
    title: "« Détail » : comprendre le calcul",
    body: (
      <p>
        Affiche le calcul ligne par ligne et le mois jour par jour. C’est ici que vous décidez pour les journées
        « à statuer ».
      </p>
    ),
  },
  {
    target: "row-rules",
    title: "« Règles » : le contrat de la personne",
    body: (
      <p>
        Salaire fixe, prime par rendez-vous, nombre d’appels attendus par jour et manager. Chaque modification
        est gardée dans l’historique.
      </p>
    ),
  },
  {
    target: "row-status",
    title: "« Statut » : faire avancer le dossier",
    body: (
      <>
        <p>Chaque mois passe par 4 étapes :</p>
        <p>
          <strong>Brouillon</strong> → <strong>À vérifier</strong> → <strong>Validé</strong> →{" "}
          <strong>Payé</strong>
        </p>
        <p>Une fois validé, le dossier est verrouillé : plus personne ne peut changer les chiffres par erreur.</p>
      </>
    ),
  },
  {
    target: "help",
    title: "Besoin d’un rappel ?",
    body: <p>Ce bouton relance ce guide à tout moment. Les petits « ? » sur la page expliquent aussi chaque terme.</p>,
  },
  {
    title: "Votre routine de fin de mois",
    body: (
      <ol className="list-decimal space-y-1 pl-4">
        <li>Cliquez sur « Recalculer le mois ».</li>
        <li>Cliquez sur « À traiter », puis ouvrez « Détail » : les flèches passent d’une personne à la suivante.</li>
        <li>Cochez tout le monde et passez « À vérifier », puis « Valider ».</li>
        <li>Exportez le fichier pour le comptable.</li>
        <li>Après le virement, cochez à nouveau et « Marquer payé ».</li>
      </ol>
    ),
  },
];

export const HR_DETAIL_GUIDE: HrGuideStep[] = [
  {
    target: "detail-cards",
    title: "Comment on arrive au total",
    body: (
      <p>
        Fixe (après absences) + variable (rendez-vous) + ajustement = montant à payer. Les quatre cases vous
        montrent chaque morceau.
      </p>
    ),
  },
  {
    target: "detail-formulas",
    title: "Le calcul, écrit en toutes lettres",
    body: (
      <p>
        Rien n’est caché : chaque ligne montre l’opération exacte. Vous pouvez la refaire à la calculatrice.
      </p>
    ),
  },
  {
    target: "detail-days",
    title: "Le mois, jour par jour",
    body: (
      <>
        <p>Pour chaque journée : le nombre d’appels, les rendez-vous, et si l’objectif du jour est atteint.</p>
        <p>
          Les jours en <strong className="text-amber-700">orange</strong> sont sous l’objectif. Les jours à venir
          ne sont pas encore jugés.
        </p>
      </>
    ),
  },
  {
    target: "detail-decide",
    title: "Décider pour une journée",
    body: (
      <>
        <p>
          Cliquez sur « Statuer » : <strong>payée</strong> (par exemple, une panne ou une formation) ou{" "}
          <strong>non payée</strong> (travail non fait).
        </p>
        <p>Une courte explication est obligatoire : elle reste dans l’historique.</p>
        <p>Tant que vous n’avez rien décidé, la journée reste payée.</p>
      </>
    ),
  },
];
