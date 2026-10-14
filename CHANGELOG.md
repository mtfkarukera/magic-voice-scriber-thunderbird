# Changelog — Magic Voice Scriber

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.2.4] - 2026-10-14

### Corrigé & Fiabilisé (Éradication de la Troncature et Diagnostic Précis)
- **Contrat Manual VAD Strict pour Gemini 3.5 Transcribe Live (`background.js`, `mvs-providers.js`)** :
  - Suppression définitive de `audioStreamEnd: true` à la fin de l'enregistrement. Conformément à la spécification officielle Bidi de Google, `audioStreamEnd` est réservé à la détection automatique ; en Manual VAD, seul `activityEnd: {}` doit être émis pour clore le tour de parole.
  - Extension du délai de garde-fou de sécurité de finalisation de 1 500 ms à 4 000 ms, garantissant au modèle le temps d'émettre le segment final nettoyé par `mode: "SMART"`.
  - Suppression de l'ouverture arbitraire du flux après 180 ms : `wsPret` attend obligatoirement la confirmation `setupComplete` du serveur.
  - Mise en place d'une mémoire tampon locale (`tamponPcmAvantPret`) accumulant les trames audio PCM entre le clic utilisateur et la réception de `setupComplete`, vidée instantanément après émission d'`activityStart: {}`.
  - Nouvelle méthode pure `fusionnerSegmentFinal(base, segment)` gérant à la fois les réponses cumulatives et incrémentales de l'API sans duplication ni perte de mots.
  - Priorisation absolue du segment final validé (`texteValideLive`) par rapport à l'interim transitoire brut lors de l'insertion finale.
- **Maintien en Éveil de l'Event Page MV3 (`compose/compose-injected.js`, `background.js`)** :
  - Émission d'un ping `keepAliveAudioSession` toutes les 4 secondes depuis le chronomètre de rédaction, empêchant Gecko de suspendre le script d'arrière-plan après 15-20 secondes de parole et réveillant l'AudioContext si nécessaire.
- **Diagnostic Précis & Transparence Utilisateur (`compose/compose-injected.js`, `_locales/*/messages.json`)** :
  - Remplacement des faux `NO_AUDIO` par deux codes d'erreur transparents : `EMPTY_RECORDING` (capture vide ou trop courte) et `SESSION_LOST` (interruption inattendue de l'arrière-plan), traduits dans les 6 langues (FR, EN, ES, PT, DE, VI).
- **Tests Unitaires & Intégrité (`test/mvs.test.js`)** :
  - Ajout des tests de non-régression pour `fusionnerSegmentFinal` (modes cumulatif, incrémental, dédoublonnage d'écho) et validation de la parité stricte des 6 dictionnaires de localisation.

---

## [1.2.3] - 2026-10-14

### Corrigé & Aligné sur les Bonnes Pratiques Google Gemini Live
- **Mode Manual VAD (Push-to-Talk) pour Gemini 3.5 Transcribe Live (`mvs-providers.js`, `background.js`)** :
  - Désactivation de la détection automatique d'activité (`realtimeInputConfig.automaticActivityDetection.disabled = true`) selon le contrat officiel de l'API Gemini Live pour les boutons de dictée vocale.
  - Émission explicite de `activityStart: {}` lors de l'envoi de la première trame audio pour initialiser le tour de parole.
- **Sécurisation du Buffer MediaRecorder sous Gecko/Thunderbird (`background.js`)** :
  - Déclenchement d'un appel conditionnel à `recorder.requestData()` juste avant `recorder.stop()` en mode Batch REST (Transcribe Simple).
  - Force l'émission immédiate des derniers blocs audio en mémoire vers `dataavailable`.
- **Tests & Robustesse (`test/mvs.test.js`)** :
  - Vérification unitaire de la présence de `realtimeInputConfig.automaticActivityDetection.disabled = true` dans la configuration de handshake WebSocket.

---

## [1.2.2] - 2026-10-14

### Corrigé & Amélioré
- **Attente Réactive de Finalisation Gemini Live (`background.js`)** :
  - Remplacement du délai statique de 350 ms par une promesse réactive attendant les signaux de fin de tour (`generationComplete: true`, `turnComplete: true` ou `inputTranscription`) avec un garde-fou de sécurité de 1 500 ms.
  - Résolution immédiate dès réception de la réponse finale de Google, éliminant la fermeture prématurée du WebSocket sur les dictées longues.
  - Mise en place d'un tampon `dernierTexteInterimValide` pour immuniser contre la réinitialisation de l'interim par le serveur avant l'émission du segment validé.
- **Politique Stricte "Zero Data Loss" dans l'Éditeur (`compose/compose-injected.js`)** :
  - Transmission du texte en direct affiché (`lastKnownLiveText`) à `background.js` lors de la demande d'arrêt.
  - Nouvelle méthode `figerConteneurLiveDOM()` : si une erreur réseau ou de fournisseur devait survenir alors que du texte a déjà été dicté et affiché en direct, l'extension fige et intègre immédiatement ce texte dans le document (`parent.normalize()`) au lieu de le détruire.
- **Tests & Robustesse** :
  - Ajout de tests unitaires pour la concaténation de flux et la résilience aux segments vides (`test/mvs.test.js`).

---

## [1.2.1] - 2026-10-14

### Corrigé & Optimisé
- **Éradication de la surchauffe CPU 100 % et du gel de l'interface (`compose/compose-injected.js`)** :
  - Suppression radicale des réassignations de sélection `sel.removeAllRanges(); sel.addRange(...)` dans `obtenirRectangleCurseur()` qui déclenchaient l'événement `selectionchange` en boucle infinie synchrone dans Gecko.
  - Mise en place d'un verrou anti-réentrance `estEnTrainDePositionner` et régulation fluide à 60 FPS via `requestAnimationFrame` sur tous les écouteurs de frappe et de sélection.
- **Correction du contrat ASR Gemini 3.5 Transcribe & Gestion du silence (`mvs-providers.js`)** :
  - Extraction conforme du champ dédié `part.audioTranscription.text` (avec repli sur `part.text`), résolvant l'erreur critique où la transcription réussie était rejetée en `NO_AUDIO`.
  - Tolérance au silence : lorsque Google renvoie `finishReason: "STOP"` sans objet `content` (silence ou absence de parole), retour gracieux d'une chaîne vide sans plus jamais lever de fausse erreur `SERVICE_UNAVAILABLE`.
- **Sécurisation de la chaîne Web Audio & Résilience WebSocket (`background.js`)** :
  - Intercalation d'un `GainNode` muet (`gain.value = 0`) entre le `ScriptProcessorNode` et la destination audio pour éliminer définitivement tout retour larsen dans les écouteurs ou haut-parleurs.
  - Ajout des écouteurs `onerror` et `onclose` sur le WebSocket Gemini Live pour une résilience réseau accrue.
- **Guidage didactique précis pour la configuration microphone (`_locales/*/messages.json`)** :
  - Clarification du chemin d'accès dans les 6 langues pour guider l'utilisateur en 4 étapes en insistant sur le premier onglet **« Général »** (tout en bas) pour ouvrir l'Éditeur de configuration.
- **Création de la Skill locale de référence (`.gemini/skills/gemini-transcribe-expert/SKILL.md`)** :
  - Capitalisation complète des contrats d'API, schémas JSON, Web Audio Gecko et garde-fous DOM pour immuniser le projet contre toute régression future.

---

## [1.2.0] - 2026-10-14

### Modifié & Corrigé
- **100 % WebExtension Pure (Suppression de `experiment_apis`)** :
  - Retrait complet de `experiment_apis` (`manifest.json` et `experiment-api/`) afin d'assurer la conformité totale avec **ATN** et le canal **Thunderbird Release (153 / 157+)**.
  - Détection automatique en `1,8 s` du blocage `getUserMedia` (Bugzilla #2080573) avec guide d'activation unique et copie en 1 clic de `media.navigator.permission.disabled`.
- **Bouton d'enregistrement flottant en permanence à côté du curseur (`IDLE_FLOATING`)** :
  - Le petit bouton rond (`26×26 px`) suit désormais le curseur en permanence à `10 px` à droite dans le corps du mail et se déploie **sur place** en la pilule complète d'un simple clic (sans jamais perdre le curseur ni avoir à remonter en haut à droite).
- **Transcription en direct `gemini-3.5-transcribe-live` (`v1beta`) & Contrat strict `gemini-3.5-transcribe` (`SMART`)** :
  - `gemini-3.5-transcribe-live` défini comme modèle par défaut, avec affichage en temps réel des mots au fur et à mesure de la parole (`interimInputTranscription` + `inputTranscription`) directement dans le corps du mail.
  - Mise en conformité stricte des appels `gemini-3.5-transcribe` (retrait du prompt texte et de `temperature`, envoi exclusif de `inlineData` et `audioTranscriptionConfig: { mode: "SMART" }`).
  - Masquage automatique des 3 modes (`🎙️ / 👔 / 📋`) lorsque Gemini est sélectionné (le mode `SMART` natif suffisant), et conservation des 3 modes pour les moteurs OpenAI/Tiers et Local.
- **Animation vive des 5 barres blanches dans la pilule rouge** :
  - Réveil explicite de l'`AudioContext` (`await contexteAudio.resume()`) en arrière-plan et calcul combiné RMS temporel + fréquences vocales.
- **Nouvelle identité chromatique Orange Vibrant (`icons/`)** :
  - Recolorisation du trapèze de l'icône en Orange Vibrant (`#f97316` ➔ `#ea580c`) pour la distinguer du violet de *Magic Threads* tout en conservant le dessin haute définition de la suite.

---

## [1.1.0] - 2026-10-14

### Ajouté
- **Bouton rouge à ondes vocales flottant près du curseur (`compose/compose-injected.js`)** :
  - Positionnement dynamique à quelques millimètres (`10 px`) à droite du curseur actif dans l'éditeur de rédaction via un Shadow DOM isolé.
  - Bouton rond rouge vif (`#ef4444`) animé de 5 barres verticales blanches réactives à la voix (`|┃|┃|`), passant au violet-indigo pendant la réflexion IA.
  - Préservation garantie du focus et du curseur (`mousedown` ➔ `e.preventDefault()`).
- **Pont audio Thunderbird 128 (`experiment-api/audioBridgeApi.js`)** :
  - Résolution du blocage de `getUserMedia:request` dans Thunderbird 128+ ESR et capture microphone en contexte sécurisé (`background.js`).
- **Raccourcis clavier multi-plateformes (PC & Mac)** :
  - Support natif de `Alt+Shift+S` sur Windows/Linux et `⌘⇧S` / `⌥⇧S` sur macOS, avec libellé court `"Dicter"` dans la barre d'action et infobulle détaillée au survol.
- **Nouvelle icône PNG haute définition fidèle à la suite Magic-Softs** :
  - Trapèze violet bordé de sombre avec détourage Alpha 100 % transparent, baguette magique blanche étoilée, microphone + ondes vocales + lignes de texte et les 3 pastilles colorées (`icons/icon-{16,32,48,64,128}.png`).

---

## [1.0.0] - 2026-10-14

### Ajouté
- **Dictée vocale sémantique inspirée de Google Rambler** pour Thunderbird 128+ ESR (Manifest V3).
- **Capsule d'enregistrement Glassmorphism (`compose/`)** :
  - Visualiseur d'onde sonore en temps réel sur `<canvas>` via `AudioContext` et `AnalyserNode`.
  - Contrôles au clavier et à la souris : `Alt+Shift+S` (Démarrer/Arrêter), `Espace` (Pause/Reprise), `Échap` (Annuler).
  - Jauge de capacité optimale plafonnée à 5 minutes de prise de parole continue.
  - Animation d'attente de réflexion boréale et insertion chirurgicale paginée à la position du curseur (avec préservation du `Ctrl+Z` natif).
- **Sélecteur de Mode Morphing à 3 états** :
  - Modes *Naturel* (`natural`), *Professionnel* (`pro`) et *Synthèse / Puces* (`bullets`).
  - Politique configurable dans les paramètres : mémoriser le dernier mode choisi (par défaut) ou réinitialiser sur un mode par défaut.
- **Orchestrateur Multi-Moteurs (`mvs-providers.js`)** :
  - **Google Gemini (Par défaut)** : support de `gemini-3.5-transcribe` (Push-to-Talk REST) et `gemini-3.5-transcribe-live` (Streaming temps réel WebSocket) avec activation native de `audioTranscriptionConfig: { mode: "SMART" }`.
  - **OpenAI & Tiers Cloud** : pipeline en 2 étapes combinant la transcription Whisper (`/v1/audio/transcriptions` sur OpenAI ou Groq) et le nettoyage sémantique LLM (`/v1/chat/completions` sur Mistral, OpenAI, Groq ou endpoint personnalisé).
  - **Modèle Local 100 % Souverain** : prise en charge des serveurs STT locaux (`faster-whisper-server`, `speaches`, `whisper.cpp` sur `:8000`) et des serveurs LLM locaux (**Ollama** sur `:11434`, **LM Studio** sur `:1234`).
- **Page de paramètres complète (`options/`)** avec test de connexion en direct et gestion des permissions d'hôtes en 1 clic.
- **Internationalisation native intégrale (6 langues)** : Anglais (`en`), Français (`fr`), Espagnol (`es`), Portugais (`pt`), Allemand (`de`) et Vietnamien (`vi`) sans aucun texte codé en dur.
- **Outillage de build et tests** : script `build.sh` avec garde-fou anti-`DEBUG = true` et suite de tests unitaires automatisés (`test/mvs.test.js`).
