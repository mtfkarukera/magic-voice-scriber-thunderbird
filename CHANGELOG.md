# Changelog — Magic Voice Scriber

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [1.3.2] - 2026-10-16

### Sécurisation APT Pinning Ubuntu & Intégration du Tutoriel Pas-à-Pas
- **Bouton vers le Tutoriel Illustré (`setup/setup.html`, `setup/setup.css`)** : Intégration dans l'étape 1 du wizard d'un lien direct vers le guide complet sur `mtfk.fr` (*Comment installer Thunderbird en version .deb sur Ubuntu et débloquer votre microphone*).
- **Sécurisation de la commande terminal avec Priorité APT 1001 (`setup/setup.html`, `setup/setup.js`)** : Remplacement de la commande naïve par la commande complète d'un seul tenant créant `/etc/apt/preferences.d/mozillateam-thunderbird` avec priorité 1001, interdisant à Ubuntu de réinstaller le Snap lors des mises à jour système ultérieures.
- **Accompagnement à la sauvegarde de profil (`README.md`, `setup/setup.html`)** : Sensibilisation sur la migration des e-mails depuis `~/snap/thunderbird/common/.thunderbird/` vers `~/.thunderbird/` pour prévenir tout sentiment de perte de données.
- **Internationalisation intégrale (6 langues)** : Synchronisation et traduction des nouvelles clés dans les 6 locales (`fr`, `en`, `de`, `es`, `pt`, `vi`).

## [1.3.1] - 2026-10-16

### Sanctuarisation de l'Invariant Strict #1 (Gemini SMART)
- **Sanctuarisation architecturale (`AGENTS.md`)** : Inscription formelle de l'**Invariant Strict #1** interdisant toute proposition, prompt ou argumentation de style de reformulation artificielle lorsque Google Gemini est sélectionné.
- **Affichage 100 % conditionnel (`setup/setup.html`, `setup/setup.js`, `setup/setup.css`)** :
  - Si `provider === "gemini"` : Masquage total des 3 cartes de modes LLM et affichage valorisant de l'explication native Gemini SMART en 1 passe sans prompt.
  - Si `provider === "openai" || provider === "local"` : Révélation dynamique du sélecteur à 3 cartes de modes LLM (Mode Rambler, Professionnel, Synthèse / Puces).

### Assistant Étendu à 5 Étapes & Bac à Sable Interactif Live
- **Transition vers un Stepper à 5 étapes (`setup/setup.html`, `setup/setup.js`)** :
  - **Étape 1 : Microphone & Compatibilité Système** (visualiseur FFT 5 barres, diagnostic Linux Snap vs .deb).
  - **Étape 2 : Moteur d'IA & BYOK** (sélection du moteur et validation de clé API).
  - **Étape 3 : Style & Raccourcis (100 % conditionnel)** (panneau SMART Gemini vs sélecteur 3 modes LLM).
  - **Étape 4 : Bac à sable interactif (« Essayez la Magie en direct ! ✨ »)** : L'utilisateur teste directement la dictée sur une phrase suggérée contenant hésitations et auto-correction, enregistre sa voix, et observe le résultat nettoyé en temps réel avec badges de validation sémantique.
  - **Étape 5 : Clôture (« Tout est prêt ! 🎉 »)** : Synthèse des étapes d'utilisation et enregistrement sécurisé dans `browser.storage.local`.
- **Internationalisation intégrale (6 langues)** : Traduction complète des nouvelles clés de guidage dans `_locales/` (`fr`, `en`, `es`, `de`, `pt`, `vi`) avec parité absolue 161/161 clés.
- **Tests unitaires et intégrité automatisés (`test/mvs.test.js`)** : 20 tests automatisés validant la présence de l'Invariant Strict #1, la structure 5 étapes et l'absence totale de duplication ou faille CSP.

## [1.3.0] - 2026-10-15

### Assistant de Configuration & Diagnostic Dédié (Onboarding Wizard)
- **Nouvel Assistant interactif en 4 étapes (`setup/setup.html`, `setup/setup.css`, `setup/setup.js`)** :
  - **Étape 1 : Microphone & Compatibilité Système** : Diagnostic audio en direct avec visualiseur FFT réactif à 5 barres, détection d'amplitude en temps réel et accompagnement à la configuration de la préférence `media.navigator.permission.disabled` (avec bouton de copie double-détente).
  - **Étape 2 : Moteur d'IA & Validation des Clés (BYOK)** : Choix guidé entre Google Gemini, Cloud IA (Mistral, Groq, OpenAI) et serveurs locaux (Whisper / Ollama), avec test de connexion instantané.
  - **Étape 3 : Style de Dictée & Raccourcis** : Présentation interactive du **Mode Rambler** (recommandé), du Mode Professionnel et du Mode Synthèse / Puces, avec rappel visuel du raccourci clavier (`Alt+Shift+S` / `⌘⇧S`) et de la Goutte Vocale.
  - **Étape 4 : Clôture & Sauvegarde** : Sauvegarde centralisée dans `browser.storage.local` et transition fluide vers la rédaction.
- **Ouverture automatique au premier démarrage (`background.js`)** : Déclenchement garanti via `browser.runtime.onInstalled` lorsque `details.reason === "install"`, sans aucune réouverture intempestive lors des mises à jour ultérieures.
- **Accès permanent depuis les Options (`options/options.html`, `options/options.js`, `options/options.css`)** : Ajout du bouton « *🚀 Relancer l'assistant de configuration & diagnostic* » permettant de reconfigurer ou de tester son matériel à tout moment.

### Diagnostic & Documentation Linux Ubuntu (Snap vs .deb)
- **Détection active du blocage AppArmor Snap (`setup/setup.js`)** : Détection combinée de la plateforme Linux et du silence absolu persistant (> 1,8 s avec amplitude < 1,5), alertant l'utilisateur sur l'absence du plug `audio-record` dans le paquet Snap officiel de Thunderbird Canonical.
- **Procédure d'installation native .deb documentée (`README.md`, `ARCHITECTURE.md`, `setup/setup.html`)** : Documentation claire de la commande pour installer le PPA officiel Mozilla et contourner le confinement Snap bloquant le microphone.

## [1.2.9] - 2026-10-15

### Permissions & Aide Configuration Microphone (Bugzilla #2080573)
- **Déclaration de la permission `clipboardWrite` (`manifest.json`)** : Ajout de la permission officielle pour autoriser l'écriture dans le presse-papiers sans blocage de sécurité Gecko lors du geste utilisateur.
- **Fonction de copie double détente & feedback visuel (`compose/compose-injected.js`)** : Le bouton « Copier le nom de la préférence » (`media.navigator.permission.disabled`) exploite `navigator.clipboard.writeText` avec repli automatique sur `execCommand("copy")` et feedback temporaire « *Copié ✓* » pendant 3 secondes, éliminant tout échec silencieux lors de l'onboarding microphone sur Thunderbird 128+ ESR.

## [1.2.8] - 2026-10-15

### Ergonomie Multi-OS (Linux GTK / macOS) & Déblocage Pièces Jointes
- **Sanctuaire pour `Ctrl+Entrée` / `Cmd+Entrée` (`compose/compose-injected.js`)** : Exclusion inconditionnelle des combinaisons `Ctrl+Entrée`, `Cmd+Entrée` et `Alt+Entrée` dans l'écouteur `keydown`, garantissant que le raccourci historique d'envoi immédiat d'e-mail de Thunderbird n'est plus jamais capturé ni bloqué par l'extension.
- **Restauration intégrale du glisser-déposer de pièces jointes (`compose/compose-injected.js`)** : Définition explicite de `pointer-events: none` sur l'hôte en Light DOM (`hoteShadow`) et sur la racine flottante (`.mvs-floating-root`). Seuls les boutons interactifs réels reçoivent `pointer-events: auto`. Le document redevient 100 % transparent pour le serveur graphique Linux (protocole XDND) et le gestionnaire de glisser-déposer natif de Thunderbird, permettant d'ajouter des pièces jointes par simple drag-and-drop sans la moindre interférence.
- **Neutralisation du vol de focus sous Linux GTK (`compose/compose-injected.js`)** : Attribution systématique de `tabindex="-1"` sur l'ensemble des boutons de la capsule (`btnOndeRouge`, `btnModeMorphing`, `btnPause`, `btnAnnuler`, etc.) et redirection automatique de tout focus accidentel vers l'éditeur de texte (`focusin`). Élimination définitive de l'escamotage du curseur de texte clignotant sous Linux.
- **Raccourci étendu (`compose/compose-injected.js`)** : Prise en charge transparente de `Alt+Shift+D` en plus de `Alt+Shift+S` pour déclencher la dictée vocale.

## [1.2.7] - 2026-10-15

### Sécurité & Isolation des Secrets
- **Protection des clés API dans les en-têtes HTTP (`mvs-providers.js`)** : Migration de la clé API Gemini de la chaîne de requête (`?key=`) vers l'en-tête standard sécurisé `x-goog-api-key` sur l'ensemble des appels REST (`transcrireViaGemini` et `testerConnexion`).
- **Cloisonnement strict cross-domain STT / LLM (`mvs-providers.js`, `options/options.js`)** : Les clés STT et LLM ne sont plus partagées que si les deux serveurs partagent rigoureusement la même origine, empêchant toute fuite d'une clé Mistral/OpenAI vers un tiers (ex: Groq). Prise en charge automatique des origines multiples dans la demande de permissions d'hôtes (`obtenirPatternsOrigines`).
- **Protection anti-SSRF & Validation d'expéditeur (`background.js`, `compose/compose-injected.js`)** : Verrouillage de l'action privilégiée `testProvider` (rejet si appelée depuis un onglet web) et filtrage strict `expediteur.id === api.runtime.id` sur tous les écouteurs de messages.

### Robustesse & Cycle de Vie Audio (Event Page MV3)
- **Éradication de la troncature finale Gemini Live (`background.js`)** : Passage par un état tampon `STOPPING` avec attente de la confirmation serveur (`turnComplete` / `generationComplete`) ou d'un silence glissant de 800 ms avant fermeture, et protection intégrale `try/catch` sur `socketLive.send(...)`.
- **Libération intégrale des ressources audio (`background.js`)** : Déconnexion complète de l'arbre WebAudio (`noeudSource`, `onaudioprocess = null`), arrêt sécurisé de `mediaRecorder` et vidange des buffers PCM.
- **Gestion des flux microphone tardifs (`background.js`)** : Capture de la promesse microphone en cas de dépassement du timeout de 1,8 s pour stopper immédiatement tout flux orphelin (`Bugzilla #2080573`).
- **Écouteur de fermeture d'onglet (`background.js`)** : Surveillance `tabs.onRemoved` libérant automatiquement la capture microphone si la fenêtre de rédaction est fermée en cours d'enregistrement.
- **KeepAlive permanent en pause (`compose/compose-injected.js`)** : Maintien des pings `keepAliveAudioSession` toutes les 4 s y compris à l'état `PAUSED`, évitant la suspension prématurée de l'Event Page Gecko après 30 s.

### Accessibilité & Ergonomie Clavier Hybride (WCAG 2.1 AA)
- **Mode clavier hybride intelligent (`compose/compose-injected.js`)** : Les touches Espace (Pause/Reprise) et Entrée (Arrêt/Insertion) s'effacent automatiquement devant la saisie manuelle si l'utilisateur tape du texte (< 1,5 s), préservant la fluidité de rédaction sans conflit.
- **Accessibilité pour lecteurs d'écran NVDA / VoiceOver (`compose/compose-injected.js`)** : Zones d'annonces dédiées (`role="status"`, `role="alert"`), masquage du chronomètre vocal (`aria-hidden="true"`) pour éviter toute interférence audio avec le micro, et gestion dynamique de `aria-pressed`.
- **Calcul géométrique passif du curseur (`compose/compose-injected.js`)** : Suppression du nœud `<span>` temporaire au profit d'un calcul de boîte englobante 100 % passif en lecture seule.
- **Mode réduction de mouvement & focus visible (`compose/compose-injected.js`, `options/options.css`)** : Prise en charge de `@media (prefers-reduced-motion)` et mise en place d'anneaux de focus contrastés conformes WCAG.

### Identité Visuelle & Nettoyage
- **Harmonisation graphique Magic-Softs (`options/options.css`, `compose/compose-injected.js`)** : Palette officielle orange chaud (`#ea6512`) et contour sombre (`#85270b`), badges d'options à contraste renforcé.
- **Icônes d'application officielles (`icon.png`, `icons/*.png`)** : Mise à jour de toutes les dimensions d'icônes avec bordure foncée épaisse contrastée.
- **Nettoyage du code mort orphelin** : Suppression définitive des fichiers non utilisés `compose.html`, `compose.css` et `compose.js`.

---

## [1.2.6] - 2026-10-14

### Ajouté & Amélioré (Ergonomie & Design « La Goutte Vocale »)
- **La Goutte Vocale suspendue sous le curseur (`compose/compose-injected.js`)** :
  - Repositionnement ergonomique du déclencheur à 2 px sous la ligne de base du curseur (`rectCurseur.left - 2px`), supprimant toute interférence avec le flux horizontal de lecture et d'écriture.
  - Détection automatique des bords de fenêtre avec bascule haute fluide en cas de frappe en bas d'écran.
- **Micro-Pastille 14 px & Hitbox Magnétique 28 px (`compose/compose-injected.js`)** :
  - Réduction de moitié du diamètre en état de veille (14×14 px), logeant parfaitement dans l'interligne sans masquer le texte inférieur.
  - Hitbox magnétique invisible de 28×28 px (`::before`) assurant une zone de clic généreuse et infaillible conforme à la loi de Fitts.
  - Micro-icône vectorielle de microphone blanc SVG pur (8×8 px) en veille (zéro `innerHTML`), cédant la place aux 5 barres d'ondes vocales animées lors de l'enregistrement.
  - Micro-zoom au survol (20×20 px) avec halo lumineux chaleureux.
- **Ghost Mode : Atténuation Automatique à la Frappe (`compose/compose-injected.js`)** :
  - Atténuation instantanée de l'opacité à 20 % pendant la frappe active au clavier pour une discrétion absolue.
  - Rétablissement fluide à 85 % d'opacité dès que la frappe s'interrompt (pause d'1 seconde) ou que la souris approche.

---

## [1.2.5] - 2026-10-14

### Amélioré (Expérience Utilisateur & Raccourcis)
- **Infobulle Ultra-Conviviale & Épurée du Bouton de Rédaction (`_locales/*/messages.json`)** :
  - Remplacement du texte verbeux de l'infobulle (`composeActionTitle`) par une indication claire et synthétique des raccourcis multi-plateformes dans les 6 langues :
    - `fr` : `"PC : Alt+Maj+S • Mac : ⌘⇧S ou ⌥⇧S"`
    - `en` : `"PC: Alt+Shift+S • Mac: ⌘⇧S or ⌥⇧S"`
    - `es` : `"PC: Alt+Mayús+S • Mac: ⌘⇧S o ⌥⇧S"`
    - `pt` : `"PC: Alt+Shift+S • Mac: ⌘⇧S ou ⌥⇧S"`
    - `de` : `"PC: Alt+Umschalt+S • Mac: ⌘⇧S oder ⌥⇧S"`
    - `vi` : `"PC: Alt+Shift+S • Mac: ⌘⇧S hoặc ⌥⇧S"`
  - Amélioration de la lisibilité visuelle immédiate au survol de la souris dans la barre d'outils de rédaction de courriel sous Thunderbird 128+ ESR.

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
