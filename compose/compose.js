/**
 * Magic Voice Scriber — Logique Métier de la Capsule Glassmorphism (Compose)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Responsabilités :
 *   1. Appliquer l'internationalisation intégrale (Zéro texte codé en dur)
 *   2. Gérer le Sélecteur de Mode Morphing à 3 états (Naturel, Professionnel, Synthèse)
 *   3. Capturer le microphone via MediaRecorder et animer l'onde sonore temps réel (AnalyserNode)
 *   4. Gérer la Pause/Reprise (Espace), l'Annulation (Échap) et la Capacité Optimale (5 min)
 *   5. Piloter l'animation d'attente de réflexion boréale et le streaming WebSocket Live
 *   6. Insérer chirurgicalement le texte propre et paginé à la position du curseur dans Thunderbird
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;
const api = globalThis.browser || globalThis.messenger;

// Capacité optimale d'un segment de dictée : 5 minutes (300 secondes)
const DUREE_OPTIMALE_MAX_SEC = 300;

// Ordre cyclique du bouton Sélecteur de Mode Morphing à 3 états
const ORDRE_MODES_VOIX = ["natural", "pro", "bullets"];

const META_MODES_VOIX = {
  natural: {
    icone: "🎙️",
    cleLabel: "modeNaturalLabel",
    cleDesc: "modeNaturalDesc",
    classeCss: "mode-natural"
  },
  pro: {
    icone: "👔",
    cleLabel: "modeProLabel",
    cleDesc: "modeProDesc",
    classeCss: "mode-pro"
  },
  bullets: {
    icone: "📋",
    cleLabel: "modeBulletsLabel",
    cleDesc: "modeBulletsDesc",
    classeCss: "mode-bullets"
  }
};

// ── État Global de la Session ─────────────────────────────────────────────────
let ongletComposeId = null;
let etatCourant = "INIT"; // "INIT" | "ONBOARDING" | "RECORDING" | "PAUSED" | "THINKING" | "DONE" | "ERROR"
let modeVoixActif = "natural";
let aPermissionMoteur = true;
let origineRequise = "";

// Ressources Audio & Enregistrement
let fluxMedia = null;
let mediaRecorder = null;
let tranchesAudio = [];
let mimeTypeActif = "audio/webm";
let contexteAudio = null;
let analyseurAudio = null;
let donneesFrequences = null;
let idAnimationCanvas = null;
let phaseOnde = 0;

// Chronomètre & Capacité Optimale (5 min)
let secondesEcoulees = 0;
let idIntervalleChrono = null;

// Ressources WebSocket Temps Réel (gemini-3.5-transcribe-live)
let estModeGeminiLive = false;
let urlWebSocketLive = null;
let configSetupLive = null;
let socketLive = null;
let processeurPcmLive = null;
let texteLiveAccumule = "";

// ═══════════════════════════════════════════════════════════════════════════
// 1. INTERNATIONALISATION (i18n — Zéro texte en dur)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère une chaîne traduite depuis _locales/<lang>/messages.json.
 * @param {string} cle - Identifiant du message i18n
 * @returns {string} Chaîne localisée
 */
function t(cle) {
  try {
    if (api && api.i18n && typeof api.i18n.getMessage === "function") {
      const msg = api.i18n.getMessage(cle);
      if (msg) return msg;
    }
  } catch {
    /* Ignorer */
  }
  return "";
}

/**
 * Applique automatiquement les traductions sur tous les nœuds déclaratifs data-i18n*.
 */
function appliquerI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const cle = el.getAttribute("data-i18n");
    const msg = t(cle);
    if (msg) el.textContent = msg;
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const cle = el.getAttribute("data-i18n-title");
    const msg = t(cle);
    if (msg) el.setAttribute("title", msg);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const cle = el.getAttribute("data-i18n-aria-label");
    const msg = t(cle);
    if (msg) el.setAttribute("aria-label", msg);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GESTION DU STATUT & DU SÉLECTEUR DE MODE MORPHING (3 ÉTATS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Met à jour la ligne de statut visuelle et vocale (ARIA).
 * @param {'ready'|'recording'|'paused'|'thinking'|'error'} type - Style visuel
 * @param {string} cleI18n - Clé i18n du message à afficher
 */
function definirStatut(type, cleI18n) {
  const barre = document.getElementById("status-bar");
  const texte = document.getElementById("status-text");
  if (!barre || !texte) return;

  barre.className = `mvs-status-row status-${type}`;
  texte.textContent = t(cleI18n);
}

/**
 * Met à jour l'apparence et les attributs d'accessibilité du bouton Morphing à 3 états.
 * @param {string} mode - 'natural', 'pro' ou 'bullets'
 * @param {boolean} [animer=false] - Déclencher la micro-animation morphing
 */
function appliquerVisuelModeVoix(mode, animer = false) {
  const meta = META_MODES_VOIX[mode] || META_MODES_VOIX.natural;
  modeVoixActif = ORDRE_MODES_VOIX.includes(mode) ? mode : "natural";

  const btn = document.getElementById("btn-voice-mode");
  const icone = document.getElementById("mode-icon");
  const label = document.getElementById("mode-label");
  if (!btn || !icone || !label) return;

  if (animer) {
    btn.classList.add("is-morphing");
    setTimeout(() => btn.classList.remove("is-morphing"), 160);
  }

  btn.classList.remove("mode-natural", "mode-pro", "mode-bullets");
  btn.classList.add(meta.classeCss);
  btn.setAttribute("data-mode", modeVoixActif);

  icone.textContent = meta.icone;
  const texteLabel = t(meta.cleLabel);
  const texteDesc = t(meta.cleDesc);
  label.textContent = texteLabel;
  btn.setAttribute("title", `${texteLabel} — ${texteDesc}`);
  btn.setAttribute("aria-label", `${t("modeBtnAriaLabel")} (${texteLabel})`);
}

/**
 * Fait défiler cycliquement le mode de voix au clic (Naturel ➔ Professionnel ➔ Synthèse).
 */
async function basculerModeVoixSuivant() {
  const indexActuel = ORDRE_MODES_VOIX.indexOf(modeVoixActif);
  const indexSuivant = (indexActuel + 1) % ORDRE_MODES_VOIX.length;
  const nouveauMode = ORDRE_MODES_VOIX[indexSuivant];

  appliquerVisuelModeVoix(nouveauMode, true);

  try {
    await api.runtime.sendMessage({
      action: "saveVoiceMode",
      voiceMode: nouveauMode
    });
  } catch {
    /* Ignorer */
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. VISUALISEUR D'ONDULATION ÉLÉGANTE SUR CANVAS (WEB AUDIO & RÉFLEXION IA)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcule l'amplitude vocale normalisée (0.05 à 1.0) depuis l'AnalyserNode.
 * @returns {number} Amplitude normalisée
 */
function obtenirAmplitudeAudio() {
  if (!analyseurAudio || !donneesFrequences || etatCourant !== "RECORDING") {
    return 0.06;
  }
  analyseurAudio.getByteFrequencyData(donneesFrequences);
  let somme = 0;
  const nb = donneesFrequences.length;
  for (let i = 0; i < nb; i++) {
    somme += donneesFrequences[i];
  }
  const moyenne = somme / (nb * 255);
  return Math.min(1, Math.max(0.06, moyenne * 2.8));
}

/**
 * Boucle de rendu 60 FPS dessinant l'ondulation réactive ou l'animation de réflexion IA.
 */
function dessinerBoucleOnde() {
  const canvas = document.getElementById("waveform-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const largeur = canvas.width;
  const hauteur = canvas.height;
  const centreY = hauteur / 2;

  ctx.clearRect(0, 0, largeur, hauteur);

  if (etatCourant === "THINKING") {
    // ── Animation d'attente de réflexion : Ondulation boréale iridescente ──
    phaseOnde += 0.085;
    const couchesThinking = [
      { couleur: "rgba(56, 189, 248, 0.75)", amp: 14, freq: 0.024, vitesse: 1.3, epaisseur: 2.5 },
      { couleur: "rgba(139, 92, 246, 0.65)", amp: 18, freq: 0.019, vitesse: -0.9, epaisseur: 2.2 },
      { couleur: "rgba(16, 185, 129, 0.45)", amp: 10, freq: 0.031, vitesse: 1.7, epaisseur: 1.8 }
    ];

    couchesThinking.forEach((couche, idx) => {
      ctx.beginPath();
      ctx.strokeStyle = couche.couleur;
      ctx.lineWidth = couche.epaisseur;
      for (let x = 0; x <= largeur; x += 3) {
        const enveloppe = Math.sin((x / largeur) * Math.PI);
        const modulation = 0.65 + 0.35 * Math.sin(phaseOnde * 0.7 + idx);
        const y =
          centreY +
          Math.sin(x * couche.freq + phaseOnde * couche.vitesse + idx) *
            couche.amp *
            enveloppe *
            modulation;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  } else if (etatCourant === "PAUSED") {
    // ── État en Pause : Ligne respirante calme ambrée ──────────────────────
    phaseOnde += 0.025;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.75)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= largeur; x += 4) {
      const enveloppe = Math.sin((x / largeur) * Math.PI);
      const y = centreY + Math.sin(x * 0.02 + phaseOnde) * 3.2 * enveloppe;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    // ── État RECORDING : Ondulation multicouche réactive à la voix ─────────
    const amplitude = obtenirAmplitudeAudio();
    phaseOnde += 0.06 + amplitude * 0.09;

    const couchesVoix = [
      { couleur: "rgba(139, 92, 246, 0.88)", facteurAmp: 28, freq: 0.026, decalage: 0, epaisseur: 2.4 },
      { couleur: "rgba(244, 63, 94, 0.62)", facteurAmp: 22, freq: 0.034, decalage: 1.6, epaisseur: 1.9 },
      { couleur: "rgba(56, 189, 248, 0.50)", facteurAmp: 16, freq: 0.019, decalage: 3.1, epaisseur: 1.5 }
    ];

    couchesVoix.forEach((couche) => {
      ctx.beginPath();
      ctx.strokeStyle = couche.couleur;
      ctx.lineWidth = couche.epaisseur;
      const ampPixels = Math.max(3.5, amplitude * couche.facteurAmp);

      for (let x = 0; x <= largeur; x += 3) {
        const enveloppe = Math.sin((x / largeur) * Math.PI);
        const y =
          centreY +
          Math.sin(x * couche.freq + phaseOnde + couche.decalage) * ampPixels * enveloppe;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

  idAnimationCanvas = requestAnimationFrame(dessinerBoucleOnde);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CHRONOMÈTRE & JAUGE DE CAPACITÉ OPTIMALE (5 MINUTES MAX)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formate un nombre de secondes en MM:SS.
 * @param {number} totalSec
 * @returns {string}
 */
function formaterDuree(totalSec) {
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Met à jour l'affichage du compteur et de la barre de capacité optimale.
 */
function actualiserAffichageChrono() {
  const pill = document.getElementById("timer-display");
  const jauge = document.getElementById("capacity-progress-bar");

  if (pill) {
    pill.textContent = `${formaterDuree(secondesEcoulees)} / ${formaterDuree(DUREE_OPTIMALE_MAX_SEC)}`;
  }

  if (jauge) {
    const pourcentage = Math.min(100, (secondesEcoulees / DUREE_OPTIMALE_MAX_SEC) * 100);
    jauge.style.width = `${pourcentage.toFixed(1)}%`;
    if (secondesEcoulees >= 240) {
      jauge.classList.add("is-warning");
    } else {
      jauge.classList.remove("is-warning");
    }
  }
}

/**
 * Démarre le chronomètre de session (respecte l'état PAUSED et le plafond de 5 min).
 */
function demarrerChrono() {
  arreterChrono();
  secondesEcoulees = 0;
  actualiserAffichageChrono();

  idIntervalleChrono = setInterval(() => {
    if (etatCourant !== "RECORDING") return;

    secondesEcoulees += 1;
    actualiserAffichageChrono();

    // Arrêt automatique à la capacité optimale de 5 minutes pour finaliser le segment
    if (secondesEcoulees >= DUREE_OPTIMALE_MAX_SEC) {
      definirStatut("thinking", "statusMaxDurationReached");
      terminerEtInserer();
    }
  }, 1000);
}

function arreterChrono() {
  if (idIntervalleChrono) {
    clearInterval(idIntervalleChrono);
    idIntervalleChrono = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. STREAMING WEBSOCKET TEMPS RÉEL (gemini-3.5-transcribe-live)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convertit un tampon Float32Array (AudioContext) en PCM 16-bit Little-Endian Base64 à 16 kHz.
 * @param {Float32Array} echantillons - Échantillons audio (-1.0 à 1.0)
 * @param {number} tauxSource - Fréquence d'échantillonnage du contexte audio
 * @returns {string} Données PCM 16 kHz encodées en Base64
 */
function encoderPcm16kBase64(echantillons, tauxSource) {
  const tauxCible = 16000;
  const ratio = tauxSource / tauxCible;
  const longueurSortie = Math.max(1, Math.floor(echantillons.length / ratio));
  const bufferPcm = new ArrayBuffer(longueurSortie * 2);
  const vue = new DataView(bufferPcm);

  for (let i = 0; i < longueurSortie; i++) {
    const idxSource = Math.min(echantillons.length - 1, Math.floor(i * ratio));
    const s = Math.max(-1, Math.min(1, echantillons[idxSource]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    vue.setInt16(i * 2, int16, true);
  }

  const octets = new Uint8Array(bufferPcm);
  let binaire = "";
  for (let i = 0; i < octets.length; i++) {
    binaire += String.fromCharCode(octets[i]);
  }
  return btoa(binaire);
}

/**
 * Initialise la session WebSocket temps réel si gemini-3.5-transcribe-live est sélectionné.
 * @param {MediaStreamAudioSourceNode} sourceAudioNode
 */
function initialiserSessionGeminiLive(sourceAudioNode) {
  if (!estModeGeminiLive || !urlWebSocketLive || !configSetupLive || !contexteAudio) {
    return;
  }

  texteLiveAccumule = "";
  const apercuEl = document.getElementById("live-transcript-preview");
  if (apercuEl) {
    apercuEl.textContent = "";
    apercuEl.classList.remove("mvs-hidden");
  }

  try {
    socketLive = new WebSocket(urlWebSocketLive);

    socketLive.addEventListener("open", () => {
      if (socketLive && socketLive.readyState === WebSocket.OPEN) {
        socketLive.send(JSON.stringify(configSetupLive));
      }
    });

    socketLive.addEventListener("message", async (event) => {
      try {
        const texteBrut =
          event.data instanceof Blob ? await event.data.text() : String(event.data);
        const msg = JSON.parse(texteBrut);

        // Extraction des fragments de transcription Live API
        if (msg && msg.serverContent) {
          const sc = msg.serverContent;
          if (sc.inputTranscription && typeof sc.inputTranscription.text === "string") {
            texteLiveAccumule += sc.inputTranscription.text;
          } else if (
            sc.modelTurn &&
            Array.isArray(sc.modelTurn.parts) &&
            sc.modelTurn.parts[0] &&
            typeof sc.modelTurn.parts[0].text === "string"
          ) {
            texteLiveAccumule += sc.modelTurn.parts[0].text;
          }

          if (apercuEl && texteLiveAccumule.trim()) {
            apercuEl.textContent = texteLiveAccumule.trim();
            apercuEl.scrollTop = apercuEl.scrollHeight;
          }
        }
      } catch {
        /* Ignorer les trames de contrôle non textuelles */
      }
    });

    // Diffusion continue des paquets PCM 16 kHz vers le WebSocket
    processeurPcmLive = contexteAudio.createScriptProcessor(4096, 1, 1);
    sourceAudioNode.connect(processeurPcmLive);
    processeurPcmLive.connect(contexteAudio.destination);

    processeurPcmLive.onaudioprocess = (e) => {
      if (etatCourant !== "RECORDING") return;
      if (!socketLive || socketLive.readyState !== WebSocket.OPEN) return;

      const entree = e.inputBuffer.getChannelData(0);
      const base64Pcm = encoderPcm16kBase64(entree, contexteAudio.sampleRate);

      socketLive.send(
        JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: base64Pcm
              }
            ]
          }
        })
      );
    };
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] Repli REST (WebSocket Live indisponible) :", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. CAPTURE MICROPHONE, PAUSE/REPRISE & CYCLE D'ENREGISTREMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sélectionne le meilleur format audio supporté par MediaRecorder dans Gecko.
 * @returns {string} Type MIME
 */
function choisirMimeTypeSupporte() {
  const candidats = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4"
  ];
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
    for (const type of candidats) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
  }
  return "";
}

/**
 * Libère proprement le microphone, le contexte Web Audio et le WebSocket.
 */
function libererRessourcesAudio() {
  arreterChrono();

  if (processeurPcmLive) {
    try {
      processeurPcmLive.disconnect();
    } catch {
      /* Ignorer */
    }
    processeurPcmLive = null;
  }

  if (socketLive) {
    try {
      socketLive.close();
    } catch {
      /* Ignorer */
    }
    socketLive = null;
  }

  if (fluxMedia) {
    fluxMedia.getTracks().forEach((piste) => {
      try {
        piste.stop();
      } catch {
        /* Ignorer */
      }
    });
    fluxMedia = null;
  }

  if (contexteAudio && contexteAudio.state !== "closed") {
    contexteAudio.close().catch(() => {});
    contexteAudio = null;
  }
}

/**
 * Démarre immédiatement la capture du microphone et l'ondulation temps réel.
 */
async function demarrerEnregistrement() {
  tranchesAudio = [];

  try {
    fluxMedia = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch {
    etatCourant = "ERROR";
    definirStatut("error", "errorMicPermission");
    const btnPause = document.getElementById("btn-pause");
    const btnStop = document.getElementById("btn-stop");
    if (btnPause) btnPause.disabled = true;
    if (btnStop) btnStop.disabled = true;
    return;
  }

  // Initialisation de l'analyseur fréquentiel pour l'onde sonore
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    contexteAudio = new AudioCtx();
    const source = contexteAudio.createMediaStreamSource(fluxMedia);
    analyseurAudio = contexteAudio.createAnalyser();
    analyseurAudio.fftSize = 256;
    analyseurAudio.smoothingTimeConstant = 0.78;
    source.connect(analyseurAudio);
    donneesFrequences = new Uint8Array(analyseurAudio.frequencyBinCount);

    // Si l'utilisateur a choisi gemini-3.5-transcribe-live, on initialise le flux WebSocket
    if (estModeGeminiLive) {
      initialiserSessionGeminiLive(source);
    }
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] Analyseur audio non initialisé :", err);
  }

  // Initialisation du MediaRecorder
  mimeTypeActif = choisirMimeTypeSupporte();
  try {
    mediaRecorder = mimeTypeActif
      ? new MediaRecorder(fluxMedia, { mimeType: mimeTypeActif })
      : new MediaRecorder(fluxMedia);
  } catch {
    mediaRecorder = new MediaRecorder(fluxMedia);
  }

  mediaRecorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) {
      tranchesAudio.push(e.data);
    }
  });

  mediaRecorder.start(250);
  etatCourant = "RECORDING";
  definirStatut("recording", estModeGeminiLive ? "statusLiveStreaming" : "statusRecording");
  demarrerChrono();

  if (!idAnimationCanvas) {
    idAnimationCanvas = requestAnimationFrame(dessinerBoucleOnde);
  }
}

/**
 * Bascule entre l'état RECORDING et PAUSED (via la touche Espace ou le bouton Pause).
 */
function basculerPauseReprise() {
  if (!mediaRecorder) return;
  const iconePause = document.getElementById("pause-icon");

  if (etatCourant === "RECORDING" && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    etatCourant = "PAUSED";
    if (iconePause) iconePause.textContent = "▶";
    definirStatut("paused", "statusPaused");
  } else if (etatCourant === "PAUSED" && mediaRecorder.state === "paused") {
    mediaRecorder.resume();
    etatCourant = "RECORDING";
    if (iconePause) iconePause.textContent = "⏸";
    definirStatut("recording", estModeGeminiLive ? "statusLiveStreaming" : "statusRecording");
  }
}

/**
 * Convertit un Blob audio en chaîne Base64 pure.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobVersBase64(blob) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onloadend = () => {
      if (typeof lecteur.result === "string") {
        const base64 = lecteur.result.includes(",")
          ? lecteur.result.split(",")[1]
          : lecteur.result;
        resolve(base64);
      } else {
        reject(new Error("NO_AUDIO"));
      }
    };
    lecteur.onerror = () => reject(new Error("NO_AUDIO"));
    lecteur.readAsDataURL(blob);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. INSERTION CHIRURGICALE ET PAGINÉE AU CURSEUR DANS THUNDERBIRD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insère le texte propre et paginé à la position exacte du curseur dans l'éditeur Thunderbird.
 * Préserve l'historique d'annulation natif (Ctrl+Z).
 * @param {string} textePropre - Texte nettoyé à insérer
 * @returns {Promise<boolean>} Vrai si l'insertion a réussi
 */
async function insererTexteAuCurseur(textePropre) {
  if (!ongletComposeId || !textePropre) return false;

  try {
    await api.scripting.executeScript({
      target: { tabId: ongletComposeId },
      func: (texte) => {
        const editeur =
          document.querySelector("body[contenteditable='true']") || document.body;
        if (!editeur) return;

        if (typeof editeur.focus === "function") {
          editeur.focus();
        }

        // Insertion native préservant la pile Undo (Ctrl+Z) et la pagination
        const succes = document.execCommand("insertText", false, texte);
        if (!succes) {
          // Repli DOM sécurisé (Zéro innerHTML — Règle 11)
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();

            const fragment = document.createDocumentFragment();
            const lignes = texte.split("\n");
            lignes.forEach((ligne, index) => {
              if (index > 0) {
                fragment.appendChild(document.createElement("br"));
              }
              if (ligne) {
                fragment.appendChild(document.createTextNode(ligne));
              }
            });

            range.insertNode(fragment);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      },
      args: [textePropre]
    });
    return true;
  } catch (err) {
    if (DEBUG) console.error("[MagicVoiceScriber] Erreur insertion curseur :", err);
    return false;
  }
}

/**
 * Associe un code d'erreur normalisé du background à sa clé de traduction i18n.
 * @param {string} codeErreur
 * @returns {string} Clé i18n
 */
function obtenirCleErreurI18n(codeErreur) {
  const correspondances = {
    NO_AUDIO: "errorNoAudio",
    UNAUTHORIZED: "errorUnauthorized",
    RATE_LIMITED: "errorRateLimited",
    TIMEOUT: "errorTimeout",
    NETWORK: "errorNetwork",
    PERMISSION_REQUIRED: "statusPermissionRequired"
  };
  return correspondances[codeErreur] || "errorServiceUnavailable";
}

/**
 * Arrête l'enregistrement, déclenche l'état de réflexion IA, insère le texte et ferme la capsule.
 */
async function terminerEtInserer() {
  if (etatCourant !== "RECORDING" && etatCourant !== "PAUSED") return;

  // Vérification/demande de permission d'hôte en 1 clic sous geste utilisateur si nécessaire
  if (!aPermissionMoteur && origineRequise) {
    const accorde = await demanderAutorisation1Clic();
    if (!accorde) {
      definirStatut("error", "statusPermissionRequired");
      return;
    }
  }

  etatCourant = "THINKING";
  definirStatut("thinking", "statusThinking");

  const btnPause = document.getElementById("btn-pause");
  const btnStop = document.getElementById("btn-stop");
  if (btnPause) btnPause.disabled = true;
  if (btnStop) btnStop.disabled = true;

  // Arrêt propre du MediaRecorder et attente de la dernière tranche audio
  const blobFinal = await new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      resolve(new Blob(tranchesAudio, { type: mimeTypeActif || "audio/webm" }));
      return;
    }
    mediaRecorder.addEventListener(
      "stop",
      () => {
        resolve(new Blob(tranchesAudio, { type: mimeTypeActif || "audio/webm" }));
      },
      { once: true }
    );
    try {
      mediaRecorder.stop();
    } catch {
      resolve(new Blob(tranchesAudio, { type: mimeTypeActif || "audio/webm" }));
    }
  });

  const texteIssuDuLive = texteLiveAccumule.trim();
  libererRessourcesAudio();

  // Si le mode WebSocket Live a déjà produit une transcription complète en mode Naturel
  if (estModeGeminiLive && texteIssuDuLive && modeVoixActif === "natural") {
    const insere = await insererTexteAuCurseur(texteIssuDuLive);
    if (insere) {
      finaliserEtFermerCapsule();
      return;
    }
  }

  if (!blobFinal || blobFinal.size < 100) {
    etatCourant = "ERROR";
    definirStatut("error", "errorNoAudio");
    return;
  }

  let audioBase64;
  try {
    audioBase64 = await blobVersBase64(blobFinal);
  } catch {
    etatCourant = "ERROR";
    definirStatut("error", "errorNoAudio");
    return;
  }

  try {
    const reponse = await api.runtime.sendMessage({
      action: "transcribeAudio",
      audioBase64,
      mimeType: blobFinal.type || mimeTypeActif || "audio/webm",
      voiceMode: modeVoixActif
    });

    if (!reponse || !reponse.success || !reponse.text) {
      const codeErr = (reponse && reponse.error) || "SERVICE_UNAVAILABLE";
      etatCourant = "ERROR";
      definirStatut("error", obtenirCleErreurI18n(codeErr));
      return;
    }

    const succesInsertion = await insererTexteAuCurseur(reponse.text);
    if (!succesInsertion) {
      etatCourant = "ERROR";
      definirStatut("error", "errorInsertFailed");
      return;
    }

    finaliserEtFermerCapsule();
  } catch {
    etatCourant = "ERROR";
    definirStatut("error", "errorServiceUnavailable");
  }
}

/**
 * Affiche la confirmation d'insertion (✓) et referme doucement la capsule.
 */
function finaliserEtFermerCapsule() {
  etatCourant = "DONE";
  definirStatut("ready", "statusInserted");
  if (idAnimationCanvas) {
    cancelAnimationFrame(idAnimationCanvas);
    idAnimationCanvas = null;
  }
  const capsule = document.getElementById("mvs-capsule");
  setTimeout(() => {
    if (capsule) capsule.classList.add("is-closing");
    setTimeout(() => window.close(), 180);
  }, 320);
}

/**
 * Annule immédiatement l'enregistrement et referme la capsule sans rien insérer (Touche Échap).
 */
function annulerEtFermer() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch {
      /* Ignorer */
    }
  }
  libererRessourcesAudio();
  if (idAnimationCanvas) {
    cancelAnimationFrame(idAnimationCanvas);
    idAnimationCanvas = null;
  }
  window.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. AUTORISATION RÉSEAU 1-CLIC & INITIALISATION AU CHARGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Demande la permission d'hôte en 1 clic sous geste utilisateur.
 * @returns {Promise<boolean>}
 */
async function demanderAutorisation1Clic() {
  if (!origineRequise) return true;
  try {
    if (api.permissions && api.permissions.request) {
      const accorde = await api.permissions.request({ origins: [origineRequise] });
      if (accorde) {
        aPermissionMoteur = true;
        origineRequise = "";
        const dot = document.getElementById("provider-dot");
        if (dot) dot.classList.remove("is-warning");
        return true;
      }
    }
  } catch {
    /* Ignorer */
  }
  return false;
}

/**
 * Ouvrir la page de paramètres de l'extension et fermer la popup.
 */
async function ouvrirPageOptions() {
  libererRessourcesAudio();
  try {
    await api.runtime.sendMessage({ action: "openOptions" });
  } catch {
    if (api.runtime && api.runtime.openOptionsPage) {
      api.runtime.openOptionsPage().catch(() => {});
    }
  }
  window.close();
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Application stricte des traductions i18n
  appliquerI18n();

  // 2. Identification de l'onglet de rédaction actif dans Thunderbird
  try {
    const onglets = await api.tabs.query({ active: true, currentWindow: true });
    if (onglets && onglets[0]) {
      ongletComposeId = onglets[0].id;
    }
  } catch {
    /* Ignorer */
  }

  // 3. Récupération de l'état de configuration auprès du background script
  let configEtat = null;
  try {
    configEtat = await api.runtime.sendMessage({ action: "getConfig" });
  } catch {
    /* Ignorer */
  }

  const badgeLabel = document.getElementById("txt-provider-label");
  const badgeBtn = document.getElementById("btn-provider-badge");
  const dot = document.getElementById("provider-dot");
  const vueOnboarding = document.getElementById("view-onboarding");
  const vueRecorder = document.getElementById("view-recorder");

  if (configEtat && configEtat.success) {
    if (badgeLabel) {
      badgeLabel.textContent = configEtat.providerLabel || "Gemini 3.5";
    }
    appliquerVisuelModeVoix(configEtat.activeVoiceMode || "natural", false);

    estModeGeminiLive = Boolean(configEtat.isGeminiLive);
    urlWebSocketLive = configEtat.wsUrl || null;
    configSetupLive = configEtat.liveSetup || null;

    if (configEtat.hasPermission === false) {
      aPermissionMoteur = false;
      origineRequise = configEtat.requiredOrigin || "";
      if (dot) dot.classList.add("is-warning");
      if (badgeBtn) {
        const msgWarn = t("badgePermissionWarnTitle");
        badgeBtn.setAttribute("title", msgWarn);
        badgeBtn.setAttribute("aria-label", msgWarn);
      }
    }

    // Si aucune clé API n'est configurée pour le moteur actif, afficher l'écran d'accueil
    if (!configEtat.isConfigured) {
      etatCourant = "ONBOARDING";
      if (vueRecorder) vueRecorder.classList.add("mvs-hidden");
      if (vueOnboarding) vueOnboarding.classList.remove("mvs-hidden");
    } else {
      await demarrerEnregistrement();
    }
  } else {
    await demarrerEnregistrement();
  }

  // 4. Écouteurs d'événements des boutons
  const btnMode = document.getElementById("btn-voice-mode");
  if (btnMode) {
    btnMode.addEventListener("click", () => {
      basculerModeVoixSuivant();
    });
  }

  const btnOptions = document.getElementById("btn-open-options");
  if (btnOptions) {
    btnOptions.addEventListener("click", ouvrirPageOptions);
  }

  const btnOnboarding = document.getElementById("btn-onboarding-configure");
  if (btnOnboarding) {
    btnOnboarding.addEventListener("click", ouvrirPageOptions);
  }

  if (badgeBtn) {
    badgeBtn.addEventListener("click", async () => {
      if (!aPermissionMoteur && origineRequise) {
        await demanderAutorisation1Clic();
      } else {
        await ouvrirPageOptions();
      }
    });
  }

  const btnPause = document.getElementById("btn-pause");
  if (btnPause) {
    btnPause.addEventListener("click", basculerPauseReprise);
  }

  const btnStop = document.getElementById("btn-stop");
  if (btnStop) {
    btnStop.addEventListener("click", () => {
      terminerEtInserer();
    });
  }

  const btnCancel = document.getElementById("btn-cancel");
  if (btnCancel) {
    btnCancel.addEventListener("click", annulerEtFermer);
  }

  // 5. Raccourcis clavier globaux dans la capsule (Espace : Pause, Entrée : Insérer, Échap : Annuler)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      annulerEtFermer();
      return;
    }

    if (etatCourant !== "RECORDING" && etatCourant !== "PAUSED") {
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      basculerPauseReprise();
    } else if (e.key === "Enter") {
      e.preventDefault();
      terminerEtInserer();
    }
  });
});

window.addEventListener("pagehide", () => {
  libererRessourcesAudio();
});
