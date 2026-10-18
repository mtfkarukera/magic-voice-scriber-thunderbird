# Politique de Confidentialité / Privacy Policy — Magic Voice Scriber

*Dernière mise à jour : 14 octobre 2026*

---

## 🇫🇷 Version Française

### 1. Principe Fondamental : Zéro Collecte de Données
**Magic Voice Scriber** est conçu selon le principe du respect absolu de la vie privée (*Privacy by Design*) :
- **Aucun serveur intermédiaire** : L'extension est développée par **MTF Karukera** et fonctionne intégralement en local au sein de votre client Thunderbird. Nous ne possédons aucun serveur de collecte et n'interceptons jamais vos enregistrements vocaux, vos courriels ou vos clés d'API.
- **Aucune télémétrie ni pistage** : Aucun outil d'analyse, traceur publicitaire ou script de télémétrie n'est intégré dans l'extension.

### 2. Traitement des Données Vocales et Textuelles
Lorsque vous déclenchez manuellement une dictée vocale (via le bouton de rédaction ou le raccourci clavier `Alt+Shift+S`) :
- L'audio capturé par votre microphone est conservé temporairement en mémoire vive (RAM) le temps de l'enregistrement, puis immédiatement purgé dès la transcription terminée ou annulée (`Échap`).
- Selon le fournisseur que vous avez explicitement choisi dans les paramètres :
  1. **Google Gemini API (Recommandé & Par défaut)** : L'audio est envoyé directement à l'API officielle de Google (`generativelanguage.googleapis.com`) avec votre propre clé API (mode SMART 1 passe natif).
  2. **Mistral AI (Voxtral Haute Fidélité)** : L'audio est transmis directement à l'API officielle de Mistral (`api.mistral.ai`) en 1 passe REST avec votre clé API personnelle.
  3. **Modèle Local (Whisper local, Ollama, LM Studio)** : L'intégralité du traitement vocal et textuel s'effectue à 100 % sur votre propre machine (`http://localhost` / `http://127.0.0.1`). Aucune donnée ne quitte votre ordinateur.

### 3. Stockage Local (`storage`)
Vos préférences (fournisseur actif, mode de voix préféré, URLs et clés d'API) sont enregistrées exclusivement en local dans le stockage interne de votre profil Thunderbird via `browser.storage.local`.

### 4. Justification des Permissions
- **`compose` & `scripting`** : Nécessaires uniquement pour insérer le texte transcrit à la position exacte de votre curseur dans la fenêtre de rédaction du courriel actif.
- **`storage`** : Permet de sauvegarder localement vos préférences et la configuration de votre moteur IA.
- **`menus`** : Permet d'accéder rapidement aux paramètres via un clic droit sur l'icône de l'extension.
- **Permissions d'hôtes (`host_permissions`)** : Permettent au script d'arrière-plan de contacter directement l'API du moteur IA que vous avez sélectionné (Google Gemini, Mistral AI ou `localhost`). Les domaines tiers non utilisés (tels qu'OpenAI ou Groq) sont strictement exclus par principe de moindre privilège.

---

## 🇬🇧 English Version

### 1. Core Principle: Zero Data Collection
**Magic Voice Scriber** is built with strict *Privacy by Design* principles:
- **No intermediate servers**: Developed by **MTF Karukera**, this extension runs 100% locally inside your Thunderbird client. We do not operate any backend servers and never collect, store, or intercept your voice recordings, emails, or API keys.
- **No telemetry or tracking**: No analytics, tracking scripts, or telemetry tools are included.

### 2. Voice and Text Processing
When you manually trigger voice dictation (via the compose toolbar button or the `Alt+Shift+S` shortcut):
- Captured microphone audio is held only in volatile memory (RAM) during recording and is immediately discarded once transcription finishes or is canceled (`Escape`).
- Depending on the provider you explicitly configured in the settings:
  1. **Google Gemini API (Recommended & Default)**: Audio is sent directly to Google's official API (`generativelanguage.googleapis.com`) using your own API key (native 1-pass SMART mode).
  2. **Mistral AI (Voxtral High Fidelity)**: Audio is sent directly to Mistral's official API (`api.mistral.ai`) via 1-pass REST using your own personal API key.
  3. **Local Model (Local Whisper, Ollama, LM Studio)**: All speech-to-text and LLM cleanup processing happens 100% offline on your own computer (`http://localhost` / `http://127.0.0.1`). Zero data ever leaves your device.

### 3. Local Storage (`storage`)
Your preferences (active provider, voice mode preference, endpoints, and API keys) are stored exclusively on your device within your Thunderbird profile using `browser.storage.local`.

### 4. Permissions Justification
- **`compose` & `scripting`**: Required solely to insert the cleaned transcript at the exact cursor position in the active email composition window.
- **`storage`**: Used to locally save your preferences and AI provider settings.
- **`menus`**: Provides quick access to the extension settings via right-click on the toolbar button.
- **Host Permissions (`host_permissions`)**: Allow the background script to communicate directly with your selected AI provider (Google Gemini, Mistral AI, or `localhost`). Unused third-party hosts (such as OpenAI or Groq) are strictly excluded under the principle of least privilege.
