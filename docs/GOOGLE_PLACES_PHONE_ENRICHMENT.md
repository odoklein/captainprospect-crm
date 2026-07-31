# Enrichissement téléphonique Google Places

La recherche est disponible dans les drawers SDR uniquement lorsqu’aucun numéro
valide n’existe pour la société. Le résultat reste une suggestion jusqu’à ce que
l’utilisateur choisisse **Appliquer**. Les actions **Appliquer** et **Rejeter**
sont historisées avec l’identifiant de l’utilisateur et la date de validation.

## Configuration

1. Activer **Places API (New)** dans le projet Google Cloud.
2. Créer une clé API serveur restreinte à cette API et aux adresses IP du serveur.
3. Ajouter la variable suivante dans l’environnement de déploiement :

```text
GOOGLE_PLACES_API_KEY=...
```

Optionnel :

```text
GOOGLE_PLACES_PHONE_CACHE_HOURS=168
```

La valeur par défaut met les résultats en cache pendant 7 jours. Chaque
utilisateur est limité à 10 recherches par minute. La requête Google emploie un
FieldMask limité aux données nécessaires, mais les champs téléphone et site web
relèvent du SKU Google Places Text Search Enterprise. Surveiller les quotas et
le budget Google Cloud après activation.
