/**
 * Magic Voice Scriber — Script d'Arrière-Plan (Event Page Manifest V3)
 * ════════════════════════════════════════════════════════════════════
 *
 * Point d'entrée privilégié 100 % WebExtension Pure (compatible ATN & Thunderbird Release 153+).
 *
 * Responsabilités :
 *   1. Enregistrer automatiquement compose-injected.js (bouton flottant permanent près du curseur)
 *   2. Gérer le bouton de barre d'outils (compose_action), le menu contextuel et le raccourci Mac/PC
 *   3. Capturer le microphone en contexte d'extension (moz-extension://), réveiller l'AudioContext
 *      et calculer en temps réel l'amplitude des 5 barres d'ondes vocales (RMS + FFT)
 *   4. Piloter le streaming WebSocket temps réel (gemini-3.5-transcribe-live v1beta) avec affichage
 *      des mots au fil de la voix, ainsi que les appels REST (Gemini, OpenAI/Mistral/Groq, Local)
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;
const api = globalThis.browser || globalThis.messenger;

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONFIGURATION PAR DÉFAUT (storage.local)
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG_DEFAUT = {
  // Fournisseur actif par défaut : Google Gemini
  provider: "gemini",

  // 1. Paramètres Google Gemini (gemini-3.5-transcribe-live par défaut)
  geminiApiKey: "",
  geminiModel: "gemini-3.5-transcribe-live",

  // 2. Paramètres OpenAI / Tiers Cloud (Mistral, Groq, OpenAI)
  openaiPreset: "openai",
  sttBaseUrl: "https://api.openai.com",
  sttApiKey: "",
  sttModel: "whisper-1",
  llmBaseUrl: "https://api.openai.com",
  llmApiKey: "",
  llmModel: "gpt-4o-mini",

  // 3. Paramètres Modèle 100 % Local (Whisper local + Ollama / LM Studio)
  localSttUrl: "http://localhost:8000",
  localSttModel: "whisper-1",
  localLlmPreset: "ollama",
  localLlmUrl: "http://localhost:11434",
  localLlmModel: "llama3.2",
  localApiKey: "",

  // 4. Préférences du Sélecteur de Mode de Voix (pour OpenAI/Tiers et Local)
  voiceModePolicy: "remember", // "remember" | "default"
  defaultVoiceMode: "natural", // "natural" | "pro" | "bullets"
  lastVoiceMode: "natural"     // "natural" | "pro" | "bullets"
};

const MODES_VOIX_VALIDES = new Set(["natural", "pro", "bullets"]);

const CODES_ERREURS_CONNUS = new Set([
  "NO_AUDIO",
  "EMPTY_RECORDING",
  "SESSION_LOST",
  "MIC_DENIED",
  "MIC_PREF_REQUIRED",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "TIMEOUT",
  "NETWORK",
  "SERVICE_UNAVAILABLE",
  "INVALID_PAYLOAD",
  "PERMISSION_REQUIRED"
]);

/**
 * Charge la configuration complète depuis browser.storage.local en fusionnant avec CONFIG_DEFAUT.
 * @returns {Promise<typeof CONFIG_DEFAUT>}
 */
async function chargerConfiguration() {
  try {
    const stocke = await api.storage.local.get(Object.keys(CONFIG_DEFAUT));
    return { ...CONFIG_DEFAUT, ...stocke };
  } catch {
    return { ...CONFIG_DEFAUT };
  }
}

/**
 * Détermine le mode de voix initial à activer lors de l'ouverture de la capsule.
 * @param {typeof CONFIG_DEFAUT} config
 * @returns {string} 'natural', 'pro' ou 'bullets'
 */
function determinerModeVoixActif(config) {
  if (config.voiceModePolicy === "default") {
    return MODES_VOIX_VALIDES.has(config.defaultVoiceMode) ? config.defaultVoiceMode : "natural";
  }
  return MODES_VOIX_VALIDES.has(config.lastVoiceMode) ? config.lastVoiceMode : "natural";
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ENREGISTREMENT DU SCRIPT DANS L'ÉDITEUR COMPOSE & RACCOURCIS
// ═══════════════════════════════════════════════════════════════════════════

(async function initialiserExtension() {
  const definitionCompose = {
    id: "magic-voice-scriber-compose-v1",
    js: ["compose/compose-injected.js"]
  };

  try {
    if (api && api.scripting && api.scripting.compose) {
      try {
        await api.scripting.compose.unregisterScripts({ ids: [definitionCompose.id] });
      } catch {
        /* Normal lors du premier chargement */
      }
      await api.scripting.compose.registerScripts([definitionCompose]);
    }
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] Note registerScripts compose :", err);
  }
})();

/**
 * Envoie l'action "toggleVoicePill" à l'onglet de rédaction spécifié, avec injection
 * dynamique de secours si la fenêtre de rédaction était déjà ouverte avant l'installation.
 * @param {number} tabId - Identifiant de l'onglet de rédaction Thunderbird
 */
async function envoyerToggleVoicePill(tabId) {
  if (!tabId) return;
  try {
    await api.tabs.sendMessage(tabId, { action: "toggleVoicePill" });
  } catch {
    try {
      await api.scripting.executeScript({
        target: { tabId },
        files: ["compose/compose-injected.js"]
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
      await api.tabs.sendMessage(tabId, { action: "toggleVoicePill" });
    } catch (errSecours) {
      if (DEBUG) console.error("[MagicVoiceScriber] Échec injection compose :", errSecours);
    }
  }
}

// ── Clic sur le bouton "Dicter" dans la barre d'action de rédaction ──────────
if (api && api.composeAction && api.composeAction.onClicked) {
  api.composeAction.onClicked.addListener((tab) => {
    if (tab && tab.id) {
      envoyerToggleVoicePill(tab.id);
    }
  });
}

// ── Raccourci clavier global (Alt+Maj+S sur PC / ⌘⇧S ou ⌥⇧S sur Mac) ────────
if (api && api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener(async (commande) => {
    if (commande !== "toggle-voice-scriber" && commande !== "_execute_compose_action") {
      return;
    }
    try {
      const onglets = await api.tabs.query({ active: true, currentWindow: true });
      if (onglets && onglets[0] && onglets[0].id) {
        await envoyerToggleVoicePill(onglets[0].id);
      }
    } catch (err) {
      if (DEBUG) console.warn("[MagicVoiceScriber] Erreur raccourci clavier :", err);
    }
  });
}

// ── Menu contextuel clic-droit sur le bouton de rédaction ────────────────────
if (api && api.menus) {
  api.menus.remove("open-options-compose").catch(() => {});

  let titreMenu = "Magic Voice Scriber";
  try {
    if (api.i18n && api.i18n.getMessage) {
      titreMenu = api.i18n.getMessage("menuOptionsTitle") || titreMenu;
    }
  } catch {
    /* Ignorer */
  }

  api.menus.create({
    id: "open-options-compose",
    title: titreMenu,
    contexts: ["compose_action"]
  });

  api.menus.onClicked.addListener((info) => {
    if (info.menuItemId === "open-options-compose") {
      api.runtime.openOptionsPage().catch(() => {});
    }
  });
}

// Nettoyage immédiat des ressources audio si l'onglet de rédaction est fermé (M4)
if (api && api.tabs && api.tabs.onRemoved) {
  api.tabs.onRemoved.addListener((tabId) => {
    if (sessionAudio.active && sessionAudio.tabId === tabId) {
      if (DEBUG) console.log("[MagicVoiceScriber] Onglet fermé, libération de la session :", tabId);
      libererSessionAudio();
    }
  });
}

// ── Ouverture automatique du Wizard d'onboarding au premier démarrage ───────
if (api && api.runtime && api.runtime.onInstalled) {
  api.runtime.onInstalled.addListener(async (details) => {
    if (details && details.reason === "install") {
      try {
        const urlSetup = api.runtime.getURL("setup/setup.html");
        await api.tabs.create({ url: urlSetup });
      } catch (err) {
        if (DEBUG) console.warn("[MagicVoiceScriber] Note onInstalled setup tab :", err);
      }
    }
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. MOTEUR DE CAPTURE AUDIO, ONDES VOCALES & STREAMING GEMINI LIVE
// ═══════════════════════════════════════════════════════════════════════════

let demarrageSessionEnCours = false;

let sessionSauvegardeAudio = {
  dernierBlob: null,
  dernierMimeType: "audio/webm",
  dernierVoiceMode: "natural"
};

let sessionAudio = {
  active: false,
  etat: "IDLE", // "IDLE" | "RECORDING" | "PAUSED" | "STOPPING"
  tabId: null,
  fluxMedia: null,
  mediaRecorder: null,
  tranchesAudio: [],
  mimeType: "audio/webm",
  contexteAudio: null,
  noeudSource: null,
  analyseur: null,
  donneesFreq: null,
  donneesTemps: null,
  intervalleOndes: null,
  socketLive: null,
  wsPret: false,
  processeurPcm: null,
  gainMuet: null,
  texteValideLive: "",
  texteInterimLive: "",
  dernierTexteInterimValide: "",
  resolveurFinLive: null,
  activiteDemarree: false,
  tamponPcmAvantPret: []
};

/**
 * Sélectionne le meilleur format audio supporté par MediaRecorder dans Gecko.
 * @returns {string}
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
 * Convertit un tampon Float32Array en PCM 16-bit Little-Endian Base64 à 16 kHz pour Gemini Live.
 * @param {Float32Array} echantillons
 * @param {number} tauxSource
 * @returns {string}
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

/**
 * Calcule les hauteurs normalisées (0.18 à 1.0) des 5 barres verticales blanches du bouton rouge
 * en combinant l'énergie vocale temporelle (RMS) et la répartition fréquentielle (FFT).
 * @returns {number[]} Tableau de 5 valeurs entre 0.18 et 1.0
 */
function calculerCinqBarresVocales() {
  if (!sessionAudio.analyseur || !sessionAudio.donneesFreq || sessionAudio.etat !== "RECORDING") {
    return [0.22, 0.35, 0.5, 0.35, 0.22];
  }

  // Réveil proactif de l'AudioContext s'il était suspendu en arrière-plan
  if (sessionAudio.contexteAudio && sessionAudio.contexteAudio.state === "suspended") {
    sessionAudio.contexteAudio.resume().catch(() => {});
  }

  sessionAudio.analyseur.getByteFrequencyData(sessionAudio.donneesFreq);
  const donnees = sessionAudio.donneesFreq;

  // 1. Calcul RMS temporel (garantit une réaction vive même à voix douce)
  let energieRms = 0;
  if (sessionAudio.donneesTemps) {
    sessionAudio.analyseur.getByteTimeDomainData(sessionAudio.donneesTemps);
    const temps = sessionAudio.donneesTemps;
    let sommeCarres = 0;
    for (let i = 0; i < temps.length; i++) {
      const ecart = (temps[i] - 128) / 128;
      sommeCarres += ecart * ecart;
    }
    const rms = Math.sqrt(sommeCarres / temps.length);
    energieRms = Math.min(1, rms * 6.8);
  }

  // 2. Découpage du spectre vocal en 5 bandes expressives
  const plages = [
    [1, 4],
    [4, 9],
    [9, 18],
    [18, 32],
    [32, 52]
  ];

  // Profil symétrique naturel (les barres centrales sont plus élancées)
  const profilSymetrique = [0.65, 0.9, 1.15, 0.9, 0.65];
  const coefficientsFreq = [2.2, 3.0, 3.6, 3.0, 2.2];

  return plages.map(([debut, fin], idx) => {
    let somme = 0;
    const limite = Math.min(fin, donnees.length);
    const nb = Math.max(1, limite - debut);
    for (let i = debut; i < limite; i++) {
      somme += donnees[i];
    }
    const moyenneFreq = somme / (nb * 255);
    const composanteFreq = moyenneFreq * coefficientsFreq[idx];
    const composanteRms = energieRms * profilSymetrique[idx];
    const valeur = 0.18 + Math.max(composanteFreq, composanteRms);
    return Number(Math.min(1, Math.max(0.18, valeur)).toFixed(2));
  });
}

/**
 * Concatène proprement deux segments de transcription avec gestion de l'espace séparatrice.
 * @param {string} base
 * @param {string} ajout
 * @returns {string}
 */
function assemblerSegmentsLive(base, ajout) {
  const b = (base || "").trim();
  const a = (ajout || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (/^[,.;:!?]/.test(a)) {
    return `${b}${a}`;
  }
  return `${b} ${a}`;
}

/**
 * Diffuse en temps réel la transcription en cours vers l'éditeur de rédaction.
 */
function diffuserTexteLiveVersEditeur() {
  if (!sessionAudio.tabId) return;
  const texteComplet = assemblerSegmentsLive(
    sessionAudio.texteValideLive,
    sessionAudio.texteInterimLive
  );
  api.tabs
    .sendMessage(sessionAudio.tabId, {
      action: "updateLiveTranscript",
      committedText: sessionAudio.texteValideLive,
      interimText: sessionAudio.texteInterimLive,
      fullLiveText: texteComplet
    })
    .catch(() => {});
}

/**
 * Libère immédiatement le microphone, l'AudioContext, le timer d'ondes et le WebSocket.
 */
function libererSessionAudio() {
  if (sessionAudio.intervalleOndes) {
    clearInterval(sessionAudio.intervalleOndes);
    sessionAudio.intervalleOndes = null;
  }

  if (sessionAudio.processeurPcm) {
    try {
      sessionAudio.processeurPcm.onaudioprocess = null;
      sessionAudio.processeurPcm.disconnect();
    } catch {
      /* Ignorer */
    }
    sessionAudio.processeurPcm = null;
  }

  if (sessionAudio.gainMuet) {
    try {
      sessionAudio.gainMuet.disconnect();
    } catch {
      /* Ignorer */
    }
    sessionAudio.gainMuet = null;
  }

  if (sessionAudio.noeudSource) {
    try {
      sessionAudio.noeudSource.disconnect();
    } catch {
      /* Ignorer */
    }
    sessionAudio.noeudSource = null;
  }

  if (sessionAudio.socketLive) {
    try {
      sessionAudio.socketLive.close();
    } catch {
      /* Ignorer */
    }
    sessionAudio.socketLive = null;
  }
  sessionAudio.wsPret = false;
  sessionAudio.activiteDemarree = false;
  sessionAudio.tamponPcmAvantPret = [];

  if (typeof sessionAudio.resolveurFinLive === "function") {
    try {
      sessionAudio.resolveurFinLive(true);
    } catch {
      /* Ignorer */
    }
    sessionAudio.resolveurFinLive = null;
  }

  if (sessionAudio.fluxMedia) {
    sessionAudio.fluxMedia.getTracks().forEach((piste) => {
      try {
        piste.stop();
      } catch {
        /* Ignorer */
      }
    });
    sessionAudio.fluxMedia = null;
  }

  if (sessionAudio.mediaRecorder) {
    try {
      if (sessionAudio.mediaRecorder.state !== "inactive") {
        sessionAudio.mediaRecorder.stop();
      }
    } catch {
      /* Ignorer */
    }
    sessionAudio.mediaRecorder = null;
  }

  if (sessionAudio.contexteAudio && sessionAudio.contexteAudio.state !== "closed") {
    sessionAudio.contexteAudio.close().catch(() => {});
    sessionAudio.contexteAudio = null;
  }

  // Purge intégrale de la mémoire vive audio et des textes
  sessionAudio.tranchesAudio = [];
  sessionAudio.texteValideLive = "";
  sessionAudio.texteInterimLive = "";
  sessionAudio.dernierTexteInterimValide = "";
  sessionAudio.tabId = null;
  sessionAudio.analyseur = null;
  sessionAudio.donneesFreq = null;
  sessionAudio.donneesTemps = null;
  sessionAudio.active = false;
  sessionAudio.etat = "IDLE";
}

/**
 * Démarre une nouvelle session d'enregistrement microphone pour l'onglet de rédaction.
 * @param {number} tabId
 * @returns {Promise<Object>}
 */
async function demarrerSessionAudio(tabId) {
  if (demarrageSessionEnCours) {
    return { success: false, error: "BUSY" };
  }
  demarrageSessionEnCours = true;

  try {
    libererSessionAudio();

    const config = await chargerConfiguration();
    if (!globalThis.MVSProviders.estConfigure(config)) {
      return {
        success: false,
        error: "NOT_CONFIGURED",
        activeVoiceMode: determinerModeVoixActif(config),
        provider: config.provider
      };
    }

    // Détection en 1,8 s du bug Thunderbird #2080573 (getUserMedia restant pending si media.navigator.permission.disabled = false)
    let flux;
    let idTimeoutMic = null;
    let promesseMic = null;
    try {
      promesseMic = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const promesseDelai = new Promise((_, reject) => {
        idTimeoutMic = setTimeout(() => {
          reject(new Error("MIC_PREF_REQUIRED"));
        }, 1800);
      });

      flux = await Promise.race([promesseMic, promesseDelai]);
      if (idTimeoutMic) clearTimeout(idTimeoutMic);
    } catch (err) {
      if (idTimeoutMic) clearTimeout(idTimeoutMic);
      // Garde-fou B2 : si le flux micro arrive en retard après le timeout, couper immédiatement ses pistes
      if (promesseMic) {
        promesseMic
          .then((fluxTardif) => {
            if (fluxTardif) {
              fluxTardif.getTracks().forEach((p) => {
                try {
                  p.stop();
                } catch {}
              });
            }
          })
          .catch(() => {});
      }
      if (DEBUG) console.error("[MagicVoiceScriber] Erreur getUserMedia :", err);
      if (err && err.message === "MIC_PREF_REQUIRED") {
        return {
          success: false,
          error: "MIC_PREF_REQUIRED",
          provider: config.provider
        };
      }
      return {
        success: false,
        error: "MIC_DENIED",
        provider: config.provider
      };
    }

    sessionAudio.fluxMedia = flux;
    sessionAudio.tabId = tabId;
    sessionAudio.tranchesAudio = [];
    sessionAudio.texteValideLive = "";
    sessionAudio.texteInterimLive = "";
    sessionAudio.dernierTexteInterimValide = "";
    sessionAudio.resolveurFinLive = null;
    sessionAudio.wsPret = false;
    sessionAudio.activiteDemarree = false;
    sessionAudio.tamponPcmAvantPret = [];

    // Initialisation et réveil explicite de l'AudioContext pour les 5 barres d'ondes blanches
    try {
      const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AudioCtx) {
        sessionAudio.contexteAudio = new AudioCtx();
        if (sessionAudio.contexteAudio.state === "suspended") {
          await sessionAudio.contexteAudio.resume();
        }

        const source = sessionAudio.contexteAudio.createMediaStreamSource(flux);
        sessionAudio.noeudSource = source;
        sessionAudio.analyseur = sessionAudio.contexteAudio.createAnalyser();
        sessionAudio.analyseur.fftSize = 128;
        sessionAudio.analyseur.smoothingTimeConstant = 0.65;
        source.connect(sessionAudio.analyseur);
        sessionAudio.donneesFreq = new Uint8Array(sessionAudio.analyseur.frequencyBinCount);
        sessionAudio.donneesTemps = new Uint8Array(sessionAudio.analyseur.fftSize);

        // Si le moteur est Gemini avec gemini-3.5-transcribe-live, ouvrir le flux WebSocket v1beta
        const estGeminiLive =
          config.provider === "gemini" &&
          config.geminiModel === "gemini-3.5-transcribe-live" &&
          Boolean(config.geminiApiKey && config.geminiApiKey.trim());

        if (estGeminiLive) {
          initialiserWebSocketLive(config, source);
        }
      }
    } catch (err) {
      if (DEBUG) console.warn("[MagicVoiceScriber] Analyseur audio non disponible :", err);
    }

    // Démarrage du MediaRecorder (utilisé pour les modes batch et comme filet de sécurité)
    const mime = choisirMimeTypeSupporte();
    sessionAudio.mimeType = mime || "audio/webm";
    try {
      sessionAudio.mediaRecorder = mime
        ? new MediaRecorder(flux, { mimeType: mime })
        : new MediaRecorder(flux);
    } catch {
      sessionAudio.mediaRecorder = new MediaRecorder(flux);
    }

    sessionAudio.mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) {
        sessionAudio.tranchesAudio.push(e.data);
      }
    });

    sessionAudio.mediaRecorder.start(200);
    sessionAudio.active = true;
    sessionAudio.etat = "RECORDING";

    // Envoi périodique (50 ms = 20 FPS) des 5 hauteurs de barres au bouton flottant
    if (tabId) {
      sessionAudio.intervalleOndes = setInterval(() => {
        if (!sessionAudio.active || sessionAudio.etat !== "RECORDING") return;
        const bars = calculerCinqBarresVocales();
        api.tabs
          .sendMessage(tabId, {
            action: "updateVoiceBars",
            bars
          })
          .catch(() => {});
      }, 50);
    }

    return {
      success: true,
      state: "RECORDING",
      activeVoiceMode: determinerModeVoixActif(config),
      provider: config.provider,
      geminiModel: config.geminiModel
    };
  } finally {
    demarrageSessionEnCours = false;
  }
}

/**
 * Initialise la session WebSocket temps réel Gemini 3.5 Transcribe Live (v1beta).
 * @param {typeof CONFIG_DEFAUT} config
 * @param {MediaStreamAudioSourceNode} sourceNode
 */
function initialiserWebSocketLive(config, sourceNode) {
  try {
    const wsUrl = globalThis.MVSProviders.obtenirUrlWebSocketGeminiLive(config.geminiApiKey);
    const setupMsg = globalThis.MVSProviders.construireSetupGeminiLive();

    const ws = new WebSocket(wsUrl);
    sessionAudio.socketLive = ws;

    ws.addEventListener("open", () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(setupMsg));
        // Note : On ne débloque plus arbitrairement après 180 ms ; wsPret attend la confirmation setupComplete du serveur.
      }
    });

    ws.addEventListener("error", (errEvent) => {
      if (DEBUG) console.warn("[MagicVoiceScriber] Erreur WebSocket Live :", errEvent);
      sessionAudio.wsPret = false;
      if (typeof sessionAudio.resolveurFinLive === "function") {
        try {
          sessionAudio.resolveurFinLive(true);
        } catch {}
      }
    });

    ws.addEventListener("close", (closeEvent) => {
      if (DEBUG) {
        console.info(
          `[MagicVoiceScriber] Fermeture WebSocket Live (code: ${closeEvent.code}, raison: ${closeEvent.reason})`
        );
      }
      sessionAudio.wsPret = false;
      if (typeof sessionAudio.resolveurFinLive === "function") {
        try {
          sessionAudio.resolveurFinLive(true);
        } catch {}
      }
    });

    ws.addEventListener("message", async (event) => {
      try {
        const brut = event.data instanceof Blob ? await event.data.text() : String(event.data);
        const msg = JSON.parse(brut);
        if (!msg) return;

        if (msg.setupComplete !== undefined) {
          sessionAudio.wsPret = true;
          // Dès confirmation du setup par Gemini Live, émettre activityStart (Manual VAD)
          // puis flusher les trames audio PCM accumulées pendant le handshake
          if (
            sessionAudio.socketLive &&
            sessionAudio.socketLive.readyState === WebSocket.OPEN &&
            !sessionAudio.activiteDemarree
          ) {
            try {
              sessionAudio.socketLive.send(
                JSON.stringify({
                  realtimeInput: {
                    activityStart: {}
                  }
                })
              );
              sessionAudio.activiteDemarree = true;
            } catch {}
          }
          if (
            Array.isArray(sessionAudio.tamponPcmAvantPret) &&
            sessionAudio.tamponPcmAvantPret.length > 0
          ) {
            for (const payloadPcm of sessionAudio.tamponPcmAvantPret) {
              if (
                sessionAudio.socketLive &&
                sessionAudio.socketLive.readyState === WebSocket.OPEN
              ) {
                try {
                  sessionAudio.socketLive.send(payloadPcm);
                } catch {}
              }
            }
            sessionAudio.tamponPcmAvantPret = [];
          }
        }

        if (msg.serverContent) {
          const sc = msg.serverContent;
          let modifie = false;
          let aRecuSegmentValide = false;

          // 1. Mots provisoires en temps réel pendant que l'utilisateur parle
          if (
            sc.interimInputTranscription &&
            typeof sc.interimInputTranscription.text === "string"
          ) {
            const rawInterim = sc.interimInputTranscription.text;
            sessionAudio.texteInterimLive = rawInterim;
            if (rawInterim && rawInterim.trim()) {
              sessionAudio.dernierTexteInterimValide = rawInterim.trim();
            }
            modifie = true;
          }

          // 2. Segment validé et nettoyé par le mode SMART de Gemini 3.5 Transcribe Live
          if (sc.inputTranscription && typeof sc.inputTranscription.text === "string") {
            const segmentPropre = sc.inputTranscription.text.trim();
            if (segmentPropre) {
              const fusionner =
                globalThis.MVSProviders?.fusionnerSegmentFinal || assemblerSegmentsLive;
              sessionAudio.texteValideLive = fusionner(
                sessionAudio.texteValideLive,
                segmentPropre
              );
              sessionAudio.texteInterimLive = "";
              modifie = true;
              aRecuSegmentValide = true;
            }
          } else if (
            sc.modelTurn &&
            Array.isArray(sc.modelTurn.parts) &&
            sc.modelTurn.parts[0] &&
            typeof sc.modelTurn.parts[0].text === "string"
          ) {
            const texteTour = sc.modelTurn.parts[0].text.trim();
            if (texteTour) {
              sessionAudio.texteValideLive = assemblerSegmentsLive(
                sessionAudio.texteValideLive,
                texteTour
              );
              sessionAudio.texteInterimLive = "";
              modifie = true;
              aRecuSegmentValide = true;
            }
          }

          if (modifie) {
            diffuserTexteLiveVersEditeur();
          }

          // Déblocage réactif si le tour est complètement terminé par Gemini (B1)
          if (sc.generationComplete === true || sc.turnComplete === true) {
            if (typeof sessionAudio.resolveurFinLive === "function") {
              sessionAudio.resolveurFinLive(true);
            }
          } else if (aRecuSegmentValide) {
            // Relance le timer de silence (800ms) sans fermer prématurément pour préserver la fin de phrase
            if (typeof sessionAudio.resolveurFinLive === "function") {
              sessionAudio.resolveurFinLive(false);
            }
          }
        }
      } catch {
        /* Ignorer les trames non JSON */
      }
    });

    const proc = sessionAudio.contexteAudio.createScriptProcessor(4096, 1, 1);
    sessionAudio.processeurPcm = proc;
    sourceNode.connect(proc);

    // Évite tout retour sonore dans les écouteurs/haut-parleurs tout en maintenant onaudioprocess actif sous Gecko
    const gainMuet = sessionAudio.contexteAudio.createGain();
    gainMuet.gain.value = 0;
    sessionAudio.gainMuet = gainMuet;
    proc.connect(gainMuet);
    gainMuet.connect(sessionAudio.contexteAudio.destination);

    proc.onaudioprocess = (e) => {
      if (sessionAudio.etat !== "RECORDING") return;
      if (!sessionAudio.socketLive || sessionAudio.socketLive.readyState !== WebSocket.OPEN) {
        return;
      }

      const entree = e.inputBuffer.getChannelData(0);
      const base64Pcm = encoderPcm16kBase64(entree, sessionAudio.contexteAudio.sampleRate);
      const payloadAudio = JSON.stringify({
        realtimeInput: {
          audio: {
            data: base64Pcm,
            mimeType: "audio/pcm;rate=16000"
          }
        }
      });

      // Si le handshake setup n'est pas encore complété par le serveur Gemini, tamponner
      if (!sessionAudio.wsPret) {
        if (!Array.isArray(sessionAudio.tamponPcmAvantPret)) {
          sessionAudio.tamponPcmAvantPret = [];
        }
        // Limiter la taille du tampon à ~5 secondes de dictée (environ 150 trames de 4096 échantillons)
        if (sessionAudio.tamponPcmAvantPret.length < 150) {
          sessionAudio.tamponPcmAvantPret.push(payloadAudio);
        }
        return;
      }

      // Mode Manual VAD (Push-to-Talk) : émettre activityStart au tout début de l'élocution
      if (!sessionAudio.activiteDemarree) {
        try {
          sessionAudio.socketLive.send(
            JSON.stringify({
              realtimeInput: {
                activityStart: {}
              }
            })
          );
          sessionAudio.activiteDemarree = true;
        } catch {}
      }

      // Contrat officiel Gemini 3.5 Transcribe Live : realtimeInput.audio
      try {
        sessionAudio.socketLive.send(payloadAudio);
      } catch {}
    };
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] WebSocket Live non initialisé :", err);
  }
}

/**
 * Arrête l'enregistrement en cours, libère le micro et exécute/finalise la transcription IA.
 * @param {string} modeVoixDemande
 * @param {string} [texteSecoursClient=""] - Transcription visible déjà présente dans le DOM côté client
 * @returns {Promise<Object>}
 */
async function arreterEtTranscrireSession(modeVoixDemande, texteSecoursClient = "") {
  if (!sessionAudio.active || !sessionAudio.mediaRecorder) {
    libererSessionAudio();
    return { success: false, error: "SESSION_LOST" };
  }

  // Passer en état STOPPING pour cesser immédiatement d'envoyer du flux audio au WebSocket
  sessionAudio.etat = "STOPPING";

  // Si un WebSocket Gemini Live est ouvert, signaler la fin du flux audio et attendre réactivement la finalisation
  if (sessionAudio.socketLive && sessionAudio.socketLive.readyState === WebSocket.OPEN) {
    try {
      await new Promise((resolve) => {
        let timerSecurite = null;
        let timerSilence = null;

        const nettoyerEtResoudre = () => {
          if (timerSecurite) clearTimeout(timerSecurite);
          if (timerSilence) clearTimeout(timerSilence);
          sessionAudio.resolveurFinLive = null;
          resolve();
        };

        sessionAudio.resolveurFinLive = (estComplet = false) => {
          if (estComplet) {
            nettoyerEtResoudre();
          } else {
            // Relance le timer de silence (800ms) après chaque segment reçu pour ne pas tronquer la fin (B1)
            if (timerSilence) clearTimeout(timerSilence);
            timerSilence = setTimeout(nettoyerEtResoudre, 800);
          }
        };

        // Délai de sécurité global maximal de 5 secondes
        timerSecurite = setTimeout(() => {
          nettoyerEtResoudre();
        }, 5000);

        try {
          // Mode Manual VAD (Push-to-Talk) : clôture explicite du tour par activityEnd
          sessionAudio.socketLive.send(
            JSON.stringify({
              realtimeInput: {
                activityEnd: {}
              }
            })
          );
        } catch {
          nettoyerEtResoudre();
        }
      });
    } catch {
      /* Ignorer */
    }
  }

  const recorder = sessionAudio.mediaRecorder;
  const mime = sessionAudio.mimeType || "audio/webm";

  const blobFinal = await new Promise((resolve) => {
    if (recorder.state === "inactive") {
      resolve(new Blob(sessionAudio.tranchesAudio, { type: mime }));
      return;
    }
    recorder.addEventListener(
      "stop",
      () => {
        resolve(new Blob(sessionAudio.tranchesAudio, { type: mime }));
      },
      { once: true }
    );
    try {
      // Sous Gecko/Thunderbird, forcer le flush du buffer interne vers dataavailable avant le stop
      if (typeof recorder.requestData === "function" && recorder.state === "recording") {
        recorder.requestData();
      }
      recorder.stop();
    } catch {
      resolve(new Blob(sessionAudio.tranchesAudio, { type: mime }));
    }
  });

  // Sauvegarde de sécurité du blob audio complet en mémoire en cas d'erreur API (M6)
  sessionSauvegardeAudio.dernierBlob = blobFinal;
  sessionSauvegardeAudio.dernierMimeType = blobFinal.type || mime;
  sessionSauvegardeAudio.dernierVoiceMode = modeVoixDemande;

  // Priorité au segment validé et nettoyé par SMART.
  // L'interim brut n'est utilisé en secours que si aucun segment validé n'a été produit.
  let texteLiveFinal = (sessionAudio.texteValideLive || "").trim();
  if (!texteLiveFinal) {
    const texteInterimSecours =
      sessionAudio.texteInterimLive || sessionAudio.dernierTexteInterimValide || "";
    texteLiveFinal = texteInterimSecours.trim();
  }

  if (!texteLiveFinal && typeof texteSecoursClient === "string" && texteSecoursClient.trim()) {
    texteLiveFinal = texteSecoursClient.trim();
  }

  libererSessionAudio();

  const config = await chargerConfiguration();
  const voiceMode = MODES_VOIX_VALIDES.has(modeVoixDemande)
    ? modeVoixDemande
    : determinerModeVoixActif(config);

  // Si Gemini Live a déjà transcrit le texte en direct en mode SMART, retour instantané !
  if (
    config.provider === "gemini" &&
    config.geminiModel === "gemini-3.5-transcribe-live" &&
    texteLiveFinal
  ) {
    return {
      success: true,
      text: globalThis.MVSProviders.nettoyerReponseLLM(texteLiveFinal),
      provider: config.provider,
      wasLiveStreamed: true
    };
  }

  if (!blobFinal || blobFinal.size < 100) {
    return { success: false, error: "EMPTY_RECORDING" };
  }

  let audioBase64;
  try {
    audioBase64 = await blobVersBase64(blobFinal);
  } catch {
    return { success: false, error: "EMPTY_RECORDING" };
  }

  try {
    const resultat = await globalThis.MVSProviders.transcrire(
      config,
      audioBase64,
      blobFinal.type || mime,
      voiceMode
    );
    if (!resultat || !resultat.text || !resultat.text.trim()) {
      return {
        success: false,
        error: "NO_AUDIO",
        provider: config.provider
      };
    }
    return {
      success: true,
      text: resultat.text,
      provider: config.provider,
      wasLiveStreamed: false
    };
  } catch (erreur) {
    const code = erreur && erreur.message ? erreur.message : "SERVICE_UNAVAILABLE";
    return {
      success: false,
      error: CODES_ERREURS_CONNUS.has(code) ? code : "SERVICE_UNAVAILABLE"
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. GESTIONNAIRE DE MESSAGES INTERNES (Widget Flottant Compose & Options)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Traite les messages internes de manière asynchrone et sécurisée.
 * @param {Object} message - Requête reçue
 * @param {Object} expediteur - Métadonnées de l'expéditeur
 * @returns {Promise<Object>} Réponse structurée
 */
async function traiterMessage(message, expediteur) {
  if (!message || typeof message.action !== "string") {
    return { success: false, error: "INVALID_PAYLOAD" };
  }

  // Validation stricte de l'expéditeur : seuls nos propres scripts internes sont autorisés
  if (!expediteur || expediteur.id !== api.runtime.id) {
    return { success: false, error: "UNAUTHORIZED" };
  }

  const tabIdExpediteur = expediteur.tab && expediteur.tab.id ? expediteur.tab.id : null;

  // Contrôle de session multi-onglets (M3) : empêcher une autre fenêtre d'interférer avec une dictée en cours
  if (
    sessionAudio.active &&
    sessionAudio.tabId !== null &&
    tabIdExpediteur !== null &&
    sessionAudio.tabId !== tabIdExpediteur
  ) {
    if (message.action === "startAudioSession") {
      return { success: false, error: "BUSY" };
    }
    if (
      message.action === "pauseResumeAudioSession" ||
      message.action === "stopAndTranscribeSession" ||
      message.action === "cancelAudioSession" ||
      message.action === "keepAliveAudioSession"
    ) {
      return { success: false, error: "UNAUTHORIZED" };
    }
  }

  // ── Action 1 : Récupérer l'état et la configuration pour la capsule ────────
  if (message.action === "getConfig") {
    const config = await chargerConfiguration();
    const fournisseur = globalThis.MVSProviders.obtenirFournisseur(config.provider, config);
    const estConfigure = globalThis.MVSProviders.estConfigure(config);
    const requiredOrigin = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);
    const activeVoiceMode = determinerModeVoixActif(config);

    let hasPermission = true;
    try {
      if (api.permissions && api.permissions.contains) {
        hasPermission = await api.permissions.contains({ origins: [requiredOrigin] });
      }
    } catch {
      hasPermission = true;
    }

    return {
      success: true,
      provider: config.provider,
      geminiModel: config.geminiModel,
      providerLabel: fournisseur.label,
      providerNom: fournisseur.nomComplet,
      isConfigured: estConfigure,
      hasPermission: Boolean(hasPermission),
      requiredOrigin,
      activeVoiceMode,
      voiceModePolicy: config.voiceModePolicy
    };
  }

  // ── Action 2 : Sauvegarder le changement de mode de voix (Bouton Morphing) ─
  if (message.action === "saveVoiceMode") {
    const mode = message.voiceMode;
    if (!MODES_VOIX_VALIDES.has(mode)) {
      return { success: false, error: "INVALID_PAYLOAD" };
    }
    try {
      await api.storage.local.set({ lastVoiceMode: mode });
      return { success: true, voiceMode: mode };
    } catch {
      return { success: false, error: "SERVICE_UNAVAILABLE" };
    }
  }

  // ── Action 3 : Démarrer la capture audio en arrière-plan ───────────────────
  if (message.action === "startAudioSession") {
    return await demarrerSessionAudio(tabIdExpediteur);
  }

  // ── Action 3bis : Maintien de l'Event Page MV3 en vie pendant la dictée ─────
  if (message.action === "keepAliveAudioSession") {
    if (sessionAudio.contexteAudio && sessionAudio.contexteAudio.state === "suspended") {
      sessionAudio.contexteAudio.resume().catch(() => {});
    }
    return {
      success: true,
      active: Boolean(sessionAudio.active),
      state: sessionAudio.etat
    };
  }

  // ── Action 4 : Mettre en pause / Reprendre la capture audio ────────────────
  if (message.action === "pauseResumeAudioSession") {
    if (!sessionAudio.active || !sessionAudio.mediaRecorder) {
      return { success: false, error: "NO_AUDIO" };
    }
    if (sessionAudio.etat === "RECORDING" && sessionAudio.mediaRecorder.state === "recording") {
      sessionAudio.mediaRecorder.pause();
      sessionAudio.etat = "PAUSED";
      return { success: true, state: "PAUSED" };
    }
    if (sessionAudio.etat === "PAUSED" && sessionAudio.mediaRecorder.state === "paused") {
      sessionAudio.mediaRecorder.resume();
      sessionAudio.etat = "RECORDING";
      return { success: true, state: "RECORDING" };
    }
    return { success: true, state: sessionAudio.etat };
  }

  // ── Action 5 : Arrêter l'enregistrement et lancer la transcription ─────────
  if (message.action === "stopAndTranscribeSession") {
    return await arreterEtTranscrireSession(message.voiceMode, message.lastKnownLiveText);
  }

  // ── Action 6 : Annuler l'enregistrement sans transcrire ────────────────────
  if (message.action === "cancelAudioSession") {
    libererSessionAudio();
    return { success: true };
  }

  // ── Action 6bis : Réessayer la transcription avec le dernier audio sauvegardé (M6) ──
  if (message.action === "retryLastTranscription") {
    if (!sessionSauvegardeAudio.dernierBlob) {
      return { success: false, error: "NO_AUDIO" };
    }
    const config = await chargerConfiguration();
    const voiceMode = MODES_VOIX_VALIDES.has(message.voiceMode)
      ? message.voiceMode
      : sessionSauvegardeAudio.dernierVoiceMode || determinerModeVoixActif(config);

    let audioBase64;
    try {
      audioBase64 = await blobVersBase64(sessionSauvegardeAudio.dernierBlob);
    } catch {
      return { success: false, error: "EMPTY_RECORDING" };
    }

    try {
      const res = await globalThis.MVSProviders.transcrire(
        config,
        audioBase64,
        sessionSauvegardeAudio.dernierMimeType || "audio/webm",
        voiceMode
      );
      return {
        success: true,
        text: res.text,
        provider: config.provider,
        wasLiveStreamed: false
      };
    } catch (err) {
      const code = err && err.message ? err.message : "SERVICE_UNAVAILABLE";
      return {
        success: false,
        error: CODES_ERREURS_CONNUS.has(code) ? code : "SERVICE_UNAVAILABLE"
      };
    }
  }

  // ── Action 7 : Transcrire un payload Base64 direct (rétro-compatibilité) ───
  if (message.action === "transcribeAudio") {
    if (typeof message.audioBase64 !== "string" || !message.audioBase64.trim()) {
      return { success: false, error: "NO_AUDIO" };
    }

    const config = await chargerConfiguration();
    const voiceMode = MODES_VOIX_VALIDES.has(message.voiceMode)
      ? message.voiceMode
      : determinerModeVoixActif(config);
    const mimeType = typeof message.mimeType === "string" ? message.mimeType : "audio/webm";

    try {
      const resultat = await globalThis.MVSProviders.transcrire(
        config,
        message.audioBase64,
        mimeType,
        voiceMode
      );
      return {
        success: true,
        text: resultat.text,
        provider: config.provider
      };
    } catch (erreur) {
      const code = erreur && erreur.message ? erreur.message : "SERVICE_UNAVAILABLE";
      return {
        success: false,
        error: CODES_ERREURS_CONNUS.has(code) ? code : "SERVICE_UNAVAILABLE"
      };
    }
  }

  // ── Action 8 : Tester la connexion à un fournisseur depuis les options ─────
  if (message.action === "testProvider") {
    // Protection SSRF : dans Thunderbird, la page d'options s'exécute dans un onglet (about:addons ou tab).
    // On s'assure que le message provient bien de la page de paramètres ou du wizard interne et non d'un autre contexte.
    if (expediteur && expediteur.url && !expediteur.url.includes("options") && !expediteur.url.includes("setup")) {
      return { success: false, error: "UNAUTHORIZED", message: "UNAUTHORIZED" };
    }
    if (!message.config || typeof message.config !== "object") {
      return { success: false, error: "INVALID_PAYLOAD", message: "INVALID_PAYLOAD" };
    }
    return await globalThis.MVSProviders.testerConnexion(message.config);
  }

  // ── Action 9 : Ouvrir la page des paramètres ───────────────────────────────
  if (message.action === "openOptions") {
    libererSessionAudio();
    try {
      await api.runtime.openOptionsPage();
      return { success: true };
    } catch {
      return { success: false, error: "SERVICE_UNAVAILABLE" };
    }
  }

  // ── Action 10 : Ouvrir l'assistant de configuration & diagnostic ───────────
  if (message.action === "openSetup") {
    libererSessionAudio();
    try {
      const urlSetup = api.runtime.getURL("setup/setup.html");
      await api.tabs.create({ url: urlSetup });
      return { success: true };
    } catch {
      return { success: false, error: "SERVICE_UNAVAILABLE" };
    }
  }

  return { success: false, error: "INVALID_PAYLOAD" };
}

// Écouteur synchrone WebExtension MV3 (Règle 13 : retourne true de manière synchrone)
if (api && api.runtime && api.runtime.onMessage) {
  api.runtime.onMessage.addListener((message, expediteur, sendResponse) => {
    traiterMessage(message, expediteur)
      .then((reponse) => {
        sendResponse(reponse);
      })
      .catch((err) => {
        sendResponse({
          success: false,
          error: (err && CODES_ERREURS_CONNUS.has(err.message)) ? err.message : "SERVICE_UNAVAILABLE"
        });
      });
    return true;
  });
}
