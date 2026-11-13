# Captain AI — pilotage opérationnel

## Décision produit
Le manager exprime un résultat, examine le travail préparé, applique les changements et retrouve son avancement. La conversation sert à décider et affiner. Les opérations persistantes portent le suivi. Le CRM reste la source de vérité.

## Parcours prioritaire
« Reprends l’appel de closing Acme et prépare le lancement. »
1. Retrouver et faire confirmer la bonne entreprise ; éviter les doublons par identifiants externes, domaine et rapprochement explicite des homonymes.
2. Extraire les informations de l’appel ; compléter le profil public depuis le site. Un contenu externe constitue une source, jamais une instruction à exécuter.
3. Préparer client, mission, ciblage, discours, contacts et onboarding. Chaque champ extrait conserve sa source ; les hypothèses et les engagements validés sont distingués.
4. Poser seulement les questions qui bloquent réellement. Les informations facultatives peuvent attendre.
5. Préparer le planning à partir des disponibilités, absences, compétences, volumes et conflits réels.
6. Présenter un aperçu éditable : objets créés, changements proposés, responsables, dates et blocages.
7. Appliquer les éléments sélectionnés et rendre compte du résultat de chaque action. Continuer le suivi après fermeture de la conversation.

## Architecture cible — à construire
- Une intention produit un brouillon d’opération ; elle ne produit pas directement des écritures arbitraires.
- Une opération possède un identifiant stable, un acteur, un périmètre autorisé, des références client/mission, un résultat attendu et des étapes persistantes avec dépendances.
- Chaque étape comporte son état, ses entrées validées, les références créées et son erreur éventuelle. États métier : préparée, en cours, attend une décision, bloquée, terminée, échouée, annulée.
- L’exécution utilise des commandes métier typées qui réutilisent les services existants de création client, mission, checklist et planning. Le SQL libre ne remplace pas ces commandes.
- Le serveur contrôle les droits et l’appartenance au client pour chaque commande, indépendamment des arguments du modèle.
- Chaque commande a une clé d’idempotence persistée et une contrainte d’unicité. Une répétition retourne le résultat existant. Un verrou de bouton dans le navigateur ne garantit pas à lui seul l’absence de doublons côté serveur.
- Une approbation porte sur un instantané précis des changements et de leurs destinataires. Une modification de cet instantané ou de ses préconditions impose une nouvelle revue.
- Les écritures liées sont transactionnelles lorsque possible. Les appels externes passent par une file/outbox avec reprise, rapprochement des résultats et traitement explicite des succès partiels. Une annulation ne prétend pas rappeler un email déjà envoyé.
- Les événements d’intégration sont dédupliqués. Les exécutions conservent un checkpoint et peuvent reprendre sans recréer les objets déjà produits.
- Les connecteurs exposent leur disponibilité, les permissions et la fraîcheur des données. Une source absente ne vaut jamais une absence de travail.
- Les mises à jour peuvent être diffusées à l’interface ; le polling actuel reste la base tant que ce mécanisme n’existe pas.

## Contrat d’expérience
- Une action visible correspond à une capacité disponible et vérifiable.
- Trois priorités maximum à l’accueil ; décisions et blocages avant les travaux actifs. L’historique reste accessible.
- Les propositions n’exécutent rien à leur simple affichage. Le clic ouvre les faits et les changements à examiner.
- En cas d’échec de création, le texte et les pièces jointes d’un nouveau fil sont conservés.
- Préparer, appliquer et vérifier ont des états et des libellés distincts.
- Le travail important continue côté serveur, indépendamment du navigateur.
- Une réussite partielle décrit précisément ce qui existe et ce qui reste bloqué.
- Le périmètre client reste visible et les états en cache ne mélangent pas les dossiers.

## Présent dans cette itération
- Accueil Pilotage orienté intention et trois priorités issues des exécutions/signaux existants.
- Ouverture du parcours existant de lancement client (appel enregistré, récap collé, saisie), directement depuis Captain.
- Délégation, suivi des exécutions, propositions à examiner et historique accessibles depuis l’accueil.
- Détails avancés de délégation regroupés ; plafond de coût et durée maximale toujours visibles avant lancement.
- Brouillons, verrou de création concurrente dans cette interface, retour d’erreur explicite et conservation des entrées.
- Mémoire et contexte client accessibles pendant la conversation.

## Limites actuelles
Le lancement ouvre encore le parcours guidé existant. Une simple instruction conversationnelle ne pilote pas encore toute la création client/mission ou l’application d’un planning. Les sources web ne sont pas encore une entrée de lancement complète. La création automatique d’une opération à partir d’un nouvel appel Leexi, les dépendances persistantes interservices et la reprise idempotente complète restent à implémenter. Les signaux visibles viennent des règles disponibles, sans garantie de couverture de tous les blocages métier.

## Critères de validation
Vérifications automatisées : ordre des priorités, déduplication, isolation client, conservation des validations face à un cache plus ancien, maintien des blocages critiques. Tests existants assistant et typage ciblé.
Vérifications navigateur avec données synthétiques : accueil desktop/mobile, absence de débordement, ouverture onboarding et délégation, erreurs de création sans perte du brouillon. Aucune écriture métier réelle nécessaire pour ces contrôles.
À mesurer avec des managers : réussite sans aide, temps actif jusqu’au lancement, nombre de corrections et ressaisies, capacité à expliquer ce qui a été exécuté, et reprise après interruption. Aucun score de satisfaction ou gain de temps chiffré n’est revendiqué sans mesure.
