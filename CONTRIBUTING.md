# CONTRIBUTING.md — Magic Voice Scriber
## Guide de contribution et de livraison

---

## 1. Pièges Connus & Anti-Patterns

- **Capture microphone centralisée dans l'Event Page** : Dans Thunderbird 128+ ESR (Gecko MV3), l'accès à `navigator.mediaDevices.getUserMedia` et `AudioContext` est centralisé dans `background.js`. Le content script (`compose/compose-injected.js`) orchestre les états visuels au curseur et communique via `browser.runtime.sendMessage()`.
- **Match patterns WebExtension sans numéro de port** : Les patterns d'origine WebExtension (`browser.permissions.contains` / `request`) rejettent les numéros de port (`http://localhost:11434/*` est invalide). Toujours utiliser `http://localhost/*` ou `http://127.0.0.1/*` via `MVSProviders.obtenirPatternsOrigines()`.
- **Requêtes CORS vers `localhost`** : Ne jamais exécuter `fetch()` vers `http://localhost:11434` ou `http://localhost:8000` directement depuis un script non privilégié. Toujours faire transiter les requêtes HTTP par `background.js` via `browser.runtime.sendMessage()`.
- **Perte du canal asynchrone `onMessage`** : Tout écouteur `browser.runtime.onMessage.addListener` effectuant un traitement asynchrone doit impérativement retourner `true` de manière synchrone.

---

## 2. Règles de Code

- **Vanilla JavaScript strict** : Aucun bundler (Webpack, Vite, Rollup) ni dépendance NPM de runtime.
- **Commentaires en Français** : Tout le code et ses commentaires sont rédigés en français.
- **Internationalisation absolue (Zéro texte en dur)** :
  - Toute chaîne visible par l'utilisateur (texte, placeholder, `title`, `aria-label`) doit être déclarée dans les 6 fichiers `_locales/{en,fr,es,pt,de,vi}/messages.json`.
  - Utiliser les attributs déclaratifs `data-i18n`, `data-i18n-title`, `data-i18n-aria-label`, `data-i18n-placeholder` et l'utilitaire `t(cle, repli)`.
- **Accessibilité WCAG 2.1 AA** :
  - Contraste minimal de 4.5:1, indicateurs `:focus-visible` explicites et mise à jour dynamique des attributs ARIA sur la Goutte Vocale et les contrôles de la capsule vocale.
- **Sécurité DOM & CSP** :
  - Interdiction stricte de `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval()` et `new Function()`.
  - Interdiction de `window.alert()`, `confirm()` et `prompt()`.

---

## 3. Checklist de Livraison

1. Vérifier que la version dans `manifest.json`, `package.json` et `CHANGELOG.md` est identique.
2. Vérifier la parité exacte des clés de traduction dans les 6 locales (`en`, `fr`, `es`, `pt`, `de`, `vi`).
3. Vérifier qu'aucune constante `DEBUG = true` n'est présente dans le code.
4. Vérifier que `AGENTS.md`, `task.md` et `submission_kit.md` figurent bien dans `.gitignore` et ne sont pas indexés par Git (`git status`).
5. Exécuter la suite de tests unitaires (`npm test`) et le script de packaging (`bash build.sh`).

---

## 4. Build, Lint & Test

```bash
# Exécuter la suite de tests unitaires Node.js
npm test

# Construire le package .xpi dans dist/
bash build.sh
```

### Procédure de test manuel dans Thunderbird 128+ ESR
1. Ouvrir `Outils > Modules complémentaires et thèmes > Déboguer des modules > Charger un module temporaire…` et sélectionner `manifest.json`.
2. Ouvrir une fenêtre de rédaction de message (`Ctrl+N`) et appuyer sur `Alt+Shift+S`.
3. Tester la pause/reprise avec la barre `Espace`, l'animation de l'onde réactive 5 barres et l'insertion automatique du texte au curseur.
