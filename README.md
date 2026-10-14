# Magic Voice Scriber for Thunderbird

**Dictée vocale sémantique et intelligente inspirée de Google Rambler pour Thunderbird 128+ ESR.**

**Magic Voice Scriber** transforme votre voix en courriels clairs, fluides et parfaitement ponctués. Contrairement à la dictée vocale classique mot-à-mot, il élimine automatiquement les hésitations (« euh », « ben »), résout vos auto-corrections orales à la volée et structure votre pensée en paragraphes ou en listes à puces directement à la position de votre curseur.

---

## ✨ Fonctionnalités Principales

- 🎙️ **Dictée Sémantique Style Rambler** : Suppression intelligente des bafouillements, faux départs et répétitions. Si vous dites *« Rendez-vous mardi, non pardon mercredi à 14h »*, seul *« Rendez-vous mercredi à 14h00 »* est inséré.
- 🌊 **Capsule Glassmorphism & Onde Réactive** : Interface élégante avec visualisation sonore en temps réel (`AudioContext` + `AnalyserNode`), jauge de capacité optimale (5 minutes) et animation d'inférence fluide.
- ⌨️ **Pilotage 100 % Clavier ou Souris** :
  - `Alt+Shift+S` (ou clic sur le bouton de la barre d'outils de rédaction) : Démarre / Termine la dictée.
  - `Espace` : Met en pause ou reprend l'enregistrement à tout moment pour vous laisser réfléchir sans stress.
  - `Échap` : Annule immédiatement la prise de parole sans rien insérer.
- 🎭 **Sélecteur de Mode Morphing à 3 États** :
  1. **🎙️ Naturel** : Nettoie les hésitations et corrige la ponctuation tout en gardant vos mots exacts.
  2. **👔 Professionnel** : Adopte un ton courtois, fluide et soigné, idéal pour vos correspondances d'affaires.
  3. **📋 Synthèse / Puces** : Convertit vos idées dictées en points d'action structurés.
- 🔌 **Architecture Multi-Moteurs Ouverte (BYOK & Souveraineté Locale)** :
  1. **Google Gemini (Par défaut — Recommandé)** : Supporte `gemini-3.5-transcribe` (Push-to-Talk REST) et `gemini-3.5-transcribe-live` (Streaming temps réel WebSocket) avec le mode natif `SMART`.
  2. **OpenAI & Tiers Cloud** : Compatible OpenAI, **Groq** (Whisper ultra-rapide), **Mistral** et tout endpoint `/v1/audio/transcriptions` + `/v1/chat/completions`.
  3. **100 % Local & Hors-Ligne** : Connectez directement votre serveur Whisper local (`whisper.cpp` / `faster-whisper-server` sur `:8000`) et **Ollama** (`:11434`) ou **LM Studio** (`:1234`) pour une confidentialité absolue.
- 🌍 **Multilingue Natif (6 langues)** : Interface intégralement traduite en Français, Anglais, Espagnol, Portugais, Allemand et Vietnamien.

---

## 🚀 Installation & Démarrage Rapide

### Depuis un fichier `.xpi`
1. Téléchargez ou compilez l'archive dans `dist/magic-voice-scriber-thunderbird-1.2.5.xpi`.
2. Dans Thunderbird, ouvrez **Outils > Modules complémentaires et thèmes** (`Ctrl+Maj+A`).
3. Cliquez sur la roue dentée ⚙️ > **Installer un module depuis un fichier…** et sélectionnez le fichier `.xpi`.

### Configuration Initiale
1. Ouvrez une fenêtre de rédaction de courriel dans Thunderbird.
2. Cliquez sur le bouton **Magic Voice Scriber** ou appuyez sur `Alt+Shift+S`.
3. Cliquez sur **Configurer en 1 clic** pour renseigner :
   - Soit votre clé API **Google AI Studio (Gemini)**,
   - Soit vos accès **OpenAI / Mistral / Groq**,
   - Soit vos URLs locales **Whisper + Ollama / LM Studio**.

---

## 🛠️ Compilation depuis les Sources

```bash
# Exécuter les tests unitaires
npm test

# Compiler le package .xpi dans dist/
bash build.sh
```

---

## 🔒 Confidentialité

**Magic Voice Scriber** fonctionne à 100 % en local dans votre client Thunderbird :
- Aucun serveur intermédiaire, aucune télémétrie, aucun suivi.
- Vos flux audio et textes sont transmis uniquement au moteur d'IA que vous avez explicitement configuré (ou restent exclusivement sur votre machine en mode Local).
- Consultez [PRIVACY_POLICY.md](file:///Users/mtfkarukera/Scripts/magic-voice-scriber/PRIVACY_POLICY.md) pour plus de détails.

---

## 📄 Licence

Distribué sous licence **Mozilla Public License 2.0 (MPL-2.0)**. Voir [LICENSE](file:///Users/mtfkarukera/Scripts/magic-voice-scriber/LICENSE).

---
*Développé par **MTF Karukera**. Découvre toutes les solutions logicielles et outils de productivité de la suite **magic-softs** sur [magic-clipper.mtfk.fr](https://magic-clipper.mtfk.fr/).*
