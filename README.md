# Magic Voice Scriber for Thunderbird

**Dictée vocale sémantique et intelligente inspirée de Google Rambler pour Thunderbird 128+ ESR.**

**Magic Voice Scriber** transforme votre voix en courriels clairs, fluides et parfaitement ponctués. Contrairement à la dictée vocale classique mot-à-mot, il élimine automatiquement les hésitations (« euh », « ben »), résout vos auto-corrections orales à la volée et structure votre pensée en paragraphes ou en listes à puces directement à la position de votre curseur.

---

## ✨ Fonctionnalités Principales

- 🎙️ **Dictée Sémantique Style Rambler** : Suppression intelligente des bafouillements, faux départs et répétitions. Si vous dites *« Rendez-vous mardi, non pardon mercredi à 14h »*, seul *« Rendez-vous mercredi à 14h00 »* est inséré.
- 💧 **La Goutte Vocale (Smart Voice Gem)** : Micro-déclencheur discret de 14 px suspendu sous le curseur avec icône vectorielle blanche, atténuation intelligente pendant la frappe (Ghost Mode à 20 % d'opacité) et hitbox magnétique de 28 px.
- 🌊 **Capsule Glassmorphism & Onde Réactive** : Se déploie sur place en 1 clic avec visualisation sonore en temps réel (`AudioContext` + `AnalyserNode`), jauge de capacité optimale (5 minutes) et streaming du texte au fil de la parole.
- ⌨️ **Pilotage 100 % Clavier ou Souris** :
  - `Alt+Shift+S` (ou clic sur la Goutte / le bouton de barre d'outils) : Démarre / Termine la dictée.
  - `Espace` : Met en pause ou reprend l'enregistrement à tout moment pour vous laisser réfléchir sans stress.
  - `Échap` : Annule immédiatement la prise de parole sans rien insérer.
- ⚡ **Dictée Fluide en 1 Passe Native (< 250 ms)** : Vos hésitations (« euh », « ben »), faux départs et répétitions sont gommés naturellement dès la transcription par le modèle (Gemini SMART, Mistral Voxtral ou Whisper local), sans latence ni reformulation artificielle.
- 🔌 **Architecture Multi-Moteurs Ouverte (Trio Champion BYOK & Souveraineté Locale)** :
  1. **Google Gemini (Par défaut — Recommandé)** : Supporte `gemini-3.5-transcribe` (Push-to-Talk REST) et `gemini-3.5-transcribe-live` (Streaming temps réel WebSocket) avec le mode natif `SMART`.
  2. **Mistral AI (Natif Voxtral)** : Modèle 1 passe `voxtral-mini-latest` pour une transcription ultra-rapide et souveraine.
  3. **100 % Local & Hors-Ligne** : Connectez directement votre serveur Whisper local (`whisper.cpp` / `faster-whisper-server` sur `:8000`) pour une confidentialité absolue.
- 🌍 **Multilingue Natif (6 langues)** : Interface intégralement traduite en Français, Anglais, Espagnol, Portugais, Allemand et Vietnamien.

---

## 🚀 Installation & Démarrage Rapide

### Depuis un fichier `.xpi`
1. Téléchargez ou compilez l'archive dans `dist/magic-voice-scriber-thunderbird-1.4.1.xpi`.
2. Dans Thunderbird, ouvrez **Outils > Modules complémentaires et thèmes** (`Ctrl+Maj+A`).
3. Cliquez sur la roue dentée ⚙️ > **Installer un module depuis un fichier…** et sélectionnez le fichier `.xpi`.

### Assistant de Configuration & Diagnostic Automatique
Dès l'installation, Magic Voice Scriber ouvre automatiquement son **Assistant de Configuration & Diagnostic** interactif en 5 étapes :
1. **Diagnostic du Microphone & OS** : Teste le flux audio en direct avec un vumètre 5 barres et guide l'autorisation unique `media.navigator.permission.disabled` (avec diagnostic Linux Snap vs .deb).
2. **Choix du Moteur d'IA (BYOK)** : Saisie et validation en 1 clic de votre clé API Google Gemini, Mistral AI ou de votre serveur Whisper local.
3. **Ergonomie & Raccourcis** : Présentation de la dictée fluide en 1 passe native sans latence et configuration de l'affichage de la Goutte Vocale au repos sous votre curseur.
4. **Bac à Sable Interactif (« Essayez la Magie en direct ! ✨ »)** : Faites le test immédiatement sur une phrase modèle avec hésitation et auto-correction pour voir votre texte nettoyé et ponctué en conditions réelles.
5. **Prêt à dicter ! 🎉** : Enregistrement des préférences et rappel des raccourcis pour commencer dans votre fenêtre de rédaction.

Vous pouvez réouvrir cet assistant à tout moment depuis les options de l'extension.

---

### 🐧 Note Essentielle pour les Utilisateurs Linux Ubuntu (Snap vs .deb)

> [!WARNING]
> **Le paquet Snap de Thunderbird bloque l'accès au microphone**
> Sur Ubuntu (22.04 / 24.04), Canonical distribue Thunderbird sous forme de paquet **Snap** confiné. Dans la recette officielle Snap (`snapcraft.yaml`), les mainteneurs de Canonical ont déclaré la sortie audio (`audio-playback`), mais ont **omis le connecteur d'enregistrement microphone (`audio-record`)**.
> 
> En conséquence, aucune WebExtension ne peut capturer le son sous Thunderbird Snap (le profil AppArmor bloque le micro et `sudo snap connect thunderbird:audio-record` échoue car le plug n'existe pas).

#### Solution : Utiliser la version native `.deb` officielle de Mozilla
Pour profiter pleinement de la dictée vocale sous Ubuntu Linux, installez la version native `.deb` officielle de Mozilla (sans confinement Snap).  
👉 **[Consultez notre tutoriel pas-à-pas illustré sur mtfk.fr](https://mtfk.fr/installer-thunderbird-deb-ubuntu-sans-snap/)** pour sauvegarder votre profil existant (`~/snap/...`) et éviter toute perte d'e-mails.

Pour les utilisateurs expérimentés, vous pouvez également configurer directement le PPA et la priorité APT 1001 au terminal :

```bash
# 1. Ajouter le PPA officiel de l'équipe Mozilla pour Thunderbird
sudo add-apt-repository ppa:mozillateam/ppa

# 2. Configurer la priorité APT pour privilégier le paquet .deb natif (Pinning 1001)
echo '
Package: thunderbird*
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001
' | sudo tee /etc/apt/preferences.d/mozillateam-thunderbird

# 3. Mettre à jour et installer Thunderbird natif
sudo apt update
sudo apt install thunderbird
```
Sur la version native `.deb`, l'accès microphone via PipeWire / PulseAudio fonctionne parfaitement !

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
