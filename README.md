# K-Ramen Hygiène

Appli web installable (PWA) pour l'hygiène du restaurant K-Ramen : relevés de températures, et bientôt nettoyage, réception marchandise, documents.

- Hébergement : GitHub Pages (gratuit)
- Données : Firebase Firestore, offre gratuite Spark (sans carte bancaire), fonctionne hors ligne
- Connexion : prénom + code à 6 chiffres

## Version 0.1 (test)
- Première installation : création du compte de la responsable et des 11 appareils de départ
- Connexion des employés (prénom + code)
- Accueil : avancement des relevés, alertes hors norme
- Températures : saisie au pavé numérique, enregistrement automatique, hors ligne, trace des corrections
- Admin : appareils (ajout, modification, plages de température), employés (création, désactivation)

## Mise en ligne
1. Mettre tous les fichiers de ce dossier dans un dépôt GitHub, puis activer GitHub Pages (Settings > Pages > branche `main`, dossier `/root`).
2. Firebase > Authentication > Paramètres > Domaines autorisés : ajouter le domaine GitHub Pages (ex. `ir4kaz.github.io`).
3. Firebase > Firestore Database > Règles : coller le contenu de `firestore.rules`, puis Publier.

## Mise à jour
Modifier les fichiers, puis changer `VERSION` dans `sw.js` (v1 → v2…) pour que les téléphones prennent la nouvelle version.

## Structure
- `index.html`, `css/app.css`, `manifest.webmanifest`, `sw.js`
- `js/firebase.js` : configuration Firebase (projet de test, à remplacer par celui du resto à la livraison)
- `js/app.js` : connexion, menu, navigation
- `js/views/` : un fichier par écran
- `firestore.rules` : règles de sécurité de la base
