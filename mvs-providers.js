/**
 * Magic Voice Scriber — Orchestrateur des Moteurs d'Intelligence Vocale (Providers)
 * ═════════════════════════════════════════════════════════════════════════════════
 *
 * Module pur et modulaire encapsulant les 3 familles de moteurs de dictée intelligente :
 *   1. Google Gemini API (Par défaut : gemini-3.5-transcribe REST & gemini-3.5-transcribe-live WebSocket)
 *   2. OpenAI & Tiers Cloud (Mistral, Groq, OpenAI : Pipeline STT Whisper + LLM Nettoyage)
 *   3. Modèle 100 % Local Souverain (Whisper local :8000 + Ollama :11434 / LM Studio :1234)
 *
 * Compatible avec l'environnement Thunderbird WebExtension (MV3) et Node.js (tests unitaires).
 * Auteur : MTF Karukera
 */

"use strict";

(() => {
  const DEBUG = false;
  const TIMEOUT_REQUETE_MS = 45000; // 45 secondes pour absorber les enregistrements jusqu'à 5 min

  // ── 1. DÉFINITION DES 3 MODES DE VOIX (STYLES DE FORMATAGE RAMBLER) ─────────
  const MODES_VOIX = {
    natural: {
      id: "natural",
      promptInstruction:
        "You are an intelligent voice dictation engine (like Google Rambler). " +
        "Clean up the spoken input in its original language: strictly remove all filler words ('um', 'uh', 'euh', 'ben', 'hm', 'like'), stuttering, repetitions, and false starts. " +
        "If the speaker self-corrects orally (e.g., 'send 3 files, wait no, 4 files'), keep ONLY the final intended correction ('send 4 files'). " +
        "Fix grammar, capitalization, and punctuation, and structure long thoughts into natural paragraphs separated by a blank line. " +
        "Keep the speaker's exact vocabulary and natural tone. Output ONLY the final clean text ready to paste, with NO preamble, NO quotes, and NO explanations."
    },
    pro: {
      id: "pro",
      promptInstruction:
        "You are an intelligent executive voice dictation engine (like Google Rambler in Professional mode). " +
        "Transform the spoken input in its original language into a polished, courteous, and well-structured professional email text. " +
        "Strictly remove all filler words ('um', 'uh', 'euh', 'ben'), hesitations, and false starts. Resolve any spoken self-corrections. " +
        "Elevate awkward phrasing into clear, polite, and fluent prose separated into clean paragraphs. " +
        "Output ONLY the final polished text ready to paste, with NO preamble, NO quotes, and NO explanations."
    },
    bullets: {
      id: "bullets",
      promptInstruction:
        "You are an intelligent voice synthesis engine (like Google Rambler in Summary mode). " +
        "Transform the spoken input in its original language into a clear, concise, and well-structured bulleted list (using '- ' for each bullet point). " +
        "Strictly remove all filler words, hesitations, and false starts, and resolve spoken self-corrections. " +
        "Output ONLY the final bulleted list ready to paste, with NO preamble, NO quotes, and NO explanations."
    }
  };

  /**
   * Retourne le prompt système correspondant au mode de voix sélectionné.
   * @param {string} [voiceMode='natural'] - 'natural', 'pro' ou 'bullets'
   * @returns {string} Instruction système pour le modèle
   */
  function construirePromptSysteme(voiceMode = "natural") {
    const mode = MODES_VOIX[voiceMode] || MODES_VOIX.natural;
    return mode.promptInstruction;
  }

  /**
   * Nettoie la réponse brute d'un LLM (supprime les balises markdown ou guillemets parasites).
   * @param {string} texte - Texte renvoyé par le modèle
   * @returns {string} Texte propre prêt à être inséré
   */
  function nettoyerReponseLLM(texte) {
    if (!texte || typeof texte !== "string") return "";
    let propre = texte.trim();

    // Suppression des blocs de code Markdown éventuels ```text ... ```
    propre = propre.replace(/^```(?:[a-zA-Z0-9_-]+)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    // Suppression des guillemets englobants parasites uniquement s'ils entourent tout le bloc
    if (
      (propre.startsWith('"') && propre.endsWith('"') && propre.length >= 2 && !propre.slice(1, -1).includes('"')) ||
      (propre.startsWith("«") && propre.endsWith("»") && propre.length >= 2)
    ) {
      propre = propre.slice(1, -1).trim();
    }

    return propre;
  }

  /**
   * Normalise une URL de base vers l'endpoint OpenAI /v1/chat/completions.
   * @param {string} [baseUrl] - URL de base du serveur LLM
   * @returns {string} URL complète de l'endpoint chat/completions
   */
  function construireEndpointChat(baseUrl) {
    const url = (baseUrl || "https://api.openai.com").trim().replace(/\/+$/, "");
    if (url.endsWith("/v1/chat/completions") || url.endsWith("/chat/completions")) {
      return url;
    }
    if (url.endsWith("/v1")) {
      return `${url}/chat/completions`;
    }
    return `${url}/v1/chat/completions`;
  }

  /**
   * Normalise une URL de base vers l'endpoint OpenAI /v1/audio/transcriptions.
   * @param {string} [baseUrl] - URL de base du serveur STT
   * @returns {string} URL complète de l'endpoint audio/transcriptions
   */
  function construireEndpointSTT(baseUrl) {
    const url = (baseUrl || "https://api.openai.com").trim().replace(/\/+$/, "");
    if (url.endsWith("/v1/audio/transcriptions") || url.endsWith("/audio/transcriptions")) {
      return url;
    }
    if (url.endsWith("/v1")) {
      return `${url}/audio/transcriptions`;
    }
    return `${url}/v1/audio/transcriptions`;
  }

  /**
   * Convertit une chaîne Base64 en tableau d'octets Uint8Array.
   * @param {string} base64 - Données audio encodées en Base64 (avec ou sans préfixe data:)
   * @returns {Uint8Array} Octets binaires
   */
  function base64VersUint8Array(base64) {
    if (!base64 || typeof base64 !== "string") {
      return new Uint8Array(0);
    }
    const base64Pur = base64.includes(",") ? base64.split(",")[1].trim() : base64.trim();
    if (typeof atob === "function") {
      const binaire = atob(base64Pur);
      const octets = new Uint8Array(binaire.length);
      for (let i = 0; i < binaire.length; i++) {
        octets[i] = binaire.charCodeAt(i);
      }
      return octets;
    }
    // Repli Node.js
    return new Uint8Array(Buffer.from(base64Pur, "base64"));
  }

  /**
   * Détermine l'extension de fichier correspondant au type MIME audio.
   * @param {string} [mimeType='audio/webm']
   * @returns {string} Extension (webm, ogg, wav, mp3, mp4)
   */
  function obtenirExtensionAudio(mimeType = "audio/webm") {
    const type = mimeType.toLowerCase();
    if (type.includes("ogg")) return "ogg";
    if (type.includes("wav")) return "wav";
    if (type.includes("mp3") || type.includes("mpeg")) return "mp3";
    if (type.includes("mp4") || type.includes("m4a")) return "m4a";
    return "webm";
  }

  // ── 2. BRIQUES RÉUTILISABLES STT (WHISPER) & LLM (CHAT COMPLETIONS) ────────

  /**
   * Exécute l'étape 1 (STT) vers un endpoint compatible OpenAI (/v1/audio/transcriptions).
   * @param {Object} params
   * @param {string} params.audioBase64 - Audio en Base64
   * @param {string} [params.mimeType='audio/webm'] - Type MIME de l'audio
   * @param {string} params.sttUrl - URL de base ou complète du serveur STT
   * @param {string} [params.sttApiKey=''] - Clé API optionnelle (requise pour OpenAI/Groq)
   * @param {string} [params.sttModel='whisper-1'] - Modèle STT
   * @returns {Promise<string>} Transcription brute
   */
  async function executerTranscriptionSTT({ audioBase64, mimeType = "audio/webm", sttUrl, sttApiKey = "", sttModel = "whisper-1" }) {
    const octets = base64VersUint8Array(audioBase64);
    if (!octets || octets.length === 0) {
      throw new Error("NO_AUDIO");
    }

    const endpoint = construireEndpointSTT(sttUrl);
    const ext = obtenirExtensionAudio(mimeType);
    const typePropre = mimeType.split(";")[0].trim() || "audio/webm";
    const blobAudio = new Blob([octets], { type: typePropre });

    const formData = new FormData();
    formData.append("file", blobAudio, `dictation.${ext}`);
    formData.append("model", (sttModel || "whisper-1").trim());

    const headers = {};
    if (sttApiKey && sttApiKey.trim()) {
      headers["Authorization"] = `Bearer ${sttApiKey.trim()}`;
    }

    let reponse;
    try {
      reponse = await fetch(endpoint, {
        method: "POST",
        headers,
        body: formData,
        signal: AbortSignal.timeout(TIMEOUT_REQUETE_MS)
      });
    } catch (erreur) {
      if (erreur && (erreur.name === "TimeoutError" || erreur.name === "AbortError")) {
        throw new Error("TIMEOUT");
      }
      throw new Error("NETWORK");
    }

    if (!reponse.ok) {
      if (reponse.status === 401 || reponse.status === 403) throw new Error("UNAUTHORIZED");
      if (reponse.status === 429) throw new Error("RATE_LIMITED");
      throw new Error("SERVICE_UNAVAILABLE");
    }

    let donnees;
    try {
      donnees = await reponse.json();
    } catch {
      throw new Error("SERVICE_UNAVAILABLE");
    }

    const texteBrut = donnees && typeof donnees.text === "string" ? donnees.text.trim() : "";
    if (!texteBrut) {
      throw new Error("NO_AUDIO");
    }
    return texteBrut;
  }

  /**
   * Exécute l'étape 2 (Nettoyage sémantique Rambler) vers un endpoint /v1/chat/completions.
   * @param {Object} params
   * @param {string} params.texteBrut - Texte issu de l'étape STT
   * @param {string} [params.voiceMode='natural'] - Mode de voix ('natural', 'pro', 'bullets')
   * @param {string} params.llmUrl - URL de base du serveur LLM
   * @param {string} [params.llmApiKey=''] - Clé API optionnelle
   * @param {string} [params.llmModel='gpt-4o-mini'] - Nom du modèle LLM
   * @returns {Promise<string>} Texte nettoyé et structuré
   */
  async function executerNettoyageLLM({ texteBrut, voiceMode = "natural", llmUrl, llmApiKey = "", llmModel = "gpt-4o-mini" }) {
    if (!texteBrut || !texteBrut.trim()) {
      throw new Error("NO_AUDIO");
    }

    const endpoint = construireEndpointChat(llmUrl);
    const promptSysteme = construirePromptSysteme(voiceMode);

    const payload = {
      model: (llmModel || "gpt-4o-mini").trim(),
      messages: [
        { role: "system", content: promptSysteme },
        { role: "user", content: texteBrut }
      ],
      temperature: 0.2
    };

    const headers = {
      "Content-Type": "application/json"
    };
    if (llmApiKey && llmApiKey.trim()) {
      headers["Authorization"] = `Bearer ${llmApiKey.trim()}`;
    }

    let reponse;
    try {
      reponse = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_REQUETE_MS)
      });
    } catch (erreur) {
      if (erreur && (erreur.name === "TimeoutError" || erreur.name === "AbortError")) {
        throw new Error("TIMEOUT");
      }
      throw new Error("NETWORK");
    }

    if (!reponse.ok) {
      if (reponse.status === 401 || reponse.status === 403) throw new Error("UNAUTHORIZED");
      if (reponse.status === 429) throw new Error("RATE_LIMITED");
      throw new Error("SERVICE_UNAVAILABLE");
    }

    let donnees;
    try {
      donnees = await reponse.json();
    } catch {
      throw new Error("SERVICE_UNAVAILABLE");
    }

    if (
      donnees &&
      Array.isArray(donnees.choices) &&
      donnees.choices[0] &&
      donnees.choices[0].message &&
      typeof donnees.choices[0].message.content === "string"
    ) {
      const propre = nettoyerReponseLLM(donnees.choices[0].message.content);
      if (propre) return propre;
    }

    throw new Error("SERVICE_UNAVAILABLE");
  }

  // ── 3. FOURNISSEUR 1 : GOOGLE GEMINI API (DÉFAUT) ──────────────────────────

  /**
   * Construit l'URL WebSocket officielle (v1beta) pour gemini-3.5-transcribe-live.
   * @param {string} apiKey - Clé API Google AI Studio
   * @returns {string} URL WebSocket complète
   */
  function obtenirUrlWebSocketGeminiLive(apiKey) {
    const cle = (apiKey || "").trim();
    return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(cle)}`;
  }

  /**
   * Construit le message d'initialisation WebSocket pour gemini-3.5-transcribe-live en mode SMART.
   * Note : Le modèle spécialisé gemini-3.5-transcribe-live n'accepte pas de systemInstruction
   * et gère nativement le nettoyage via inputAudioTranscription.mode = "SMART".
   * @returns {Object} Payload JSON de setup Live API
   */
  function construireSetupGeminiLive() {
    return {
      setup: {
        model: "models/gemini-3.5-transcribe-live",
        generationConfig: {
          responseModalities: ["TEXT"]
        },
        // Mode Manual VAD (Push-to-Talk) : évite le découpage haché ou l'arrêt sur micro-pauses
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: true
          }
        },
        inputAudioTranscription: {
          mode: "SMART",
          languageCodes: []
        }
      }
    };
  }

  const FournisseurGemini = {
    id: "gemini",
    label: "Gemini",
    nomComplet: "Google Gemini API",

    obtenirLabel(config = {}) {
      const modele = (config.geminiModel || "gemini-3.5-transcribe-live").trim();
      if (modele === "gemini-3.5-transcribe-live") {
        return "Gemini Live";
      }
      return "Gemini 3.5";
    },

    /**
     * Transcrit et nettoie un enregistrement audio via l'API Google Gemini (mode SMART natif).
     * Contrat strict de gemini-3.5-transcribe : uniquement inlineData audio et audioTranscriptionConfig.mode = "SMART"
     * (aucun prompt texte ni paramètre temperature n'est autorisé sur ce modèle ASR dédié).
     * @param {string} audioBase64 - Audio encodé en Base64
     * @param {string} [mimeType='audio/webm'] - Type MIME de l'audio
     * @param {string} [_voiceMode='natural'] - Ignoré pour Gemini Transcribe (mode SMART natif)
     * @param {Object} [config={}] - Configuration active
     * @returns {Promise<{success: boolean, text: string}>}
     */
    async transcrire(audioBase64, mimeType = "audio/webm", _voiceMode = "natural", config = {}) {
      const apiKey = (config.geminiApiKey || config.apiKey || "").trim();
      if (!apiKey) {
        throw new Error("UNAUTHORIZED");
      }

      if (!audioBase64 || typeof audioBase64 !== "string") {
        throw new Error("NO_AUDIO");
      }

      const base64Pur = audioBase64.includes(",") ? audioBase64.split(",")[1].trim() : audioBase64.trim();
      if (!base64Pur) {
        throw new Error("NO_AUDIO");
      }

      // Pour un envoi batch REST, on cible gemini-3.5-transcribe
      const modeleChoisi = (config.geminiModel || "gemini-3.5-transcribe-live").replace(/^models\//, "").trim();
      const modeleRest = modeleChoisi === "gemini-3.5-transcribe-live" ? "gemini-3.5-transcribe" : modeleChoisi;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modeleRest)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const typePropre = (mimeType || "audio/webm").split(";")[0].trim() || "audio/webm";

      const payload = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: typePropre,
                  data: base64Pur
                }
              }
            ]
          }
        ],
        generationConfig: {
          audioTranscriptionConfig: {
            mode: "SMART"
          }
        }
      };

      let reponse;
      try {
        reponse = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_REQUETE_MS)
        });
      } catch (erreur) {
        if (erreur && (erreur.name === "TimeoutError" || erreur.name === "AbortError")) {
          throw new Error("TIMEOUT");
        }
        throw new Error("NETWORK");
      }

      if (!reponse.ok) {
        if (reponse.status === 401 || reponse.status === 403) {
          throw new Error("UNAUTHORIZED");
        }
        if (reponse.status === 400) {
          let detail = "";
          try {
            const errBody = await reponse.json();
            detail = JSON.stringify(errBody || {});
          } catch {
            /* Ignorer */
          }
          if (detail.includes("API_KEY") || detail.includes("API key")) {
            throw new Error("UNAUTHORIZED");
          }
          throw new Error("SERVICE_UNAVAILABLE");
        }
        if (reponse.status === 429) {
          throw new Error("RATE_LIMITED");
        }
        throw new Error("SERVICE_UNAVAILABLE");
      }

      let donnees;
      try {
        donnees = await reponse.json();
      } catch {
        throw new Error("SERVICE_UNAVAILABLE");
      }

      // 1. Détection de silence normal (finishReason: "STOP" sans contenu textuel)
      if (
        donnees &&
        Array.isArray(donnees.candidates) &&
        donnees.candidates[0] &&
        (!donnees.candidates[0].content || !donnees.candidates[0].content.parts)
      ) {
        // Enregistrement silencieux ou non transcrit : retour sans lever de fausse erreur serveur
        return {
          success: true,
          text: ""
        };
      }

      // 2. Extraction du texte : priorité à audioTranscription.text (spécifique à gemini-3.5-transcribe), repli sur text
      if (
        donnees &&
        Array.isArray(donnees.candidates) &&
        donnees.candidates[0] &&
        donnees.candidates[0].content &&
        Array.isArray(donnees.candidates[0].content.parts)
      ) {
        const morceaux = donnees.candidates[0].content.parts
          .map((p) => {
            if (!p) return "";
            if (p.audioTranscription && typeof p.audioTranscription.text === "string") {
              return p.audioTranscription.text;
            }
            if (typeof p.text === "string") {
              return p.text;
            }
            return "";
          })
          .filter(Boolean)
          .join(" ");

        const textePropre = nettoyerReponseLLM(morceaux);
        return {
          success: true,
          text: textePropre || ""
        };
      }

      throw new Error("SERVICE_UNAVAILABLE");
    }
  };

  // ── 4. FOURNISSEUR 2 : OPENAI & TIERS CLOUD (MISTRAL, GROQ, OPENAI) ────────

  const PRESET_CLOUD_LABELS = {
    openai: "OpenAI",
    groq: "Groq",
    mistral: "Mistral",
    custom: "Cloud LLM"
  };

  const FournisseurOpenAI = {
    id: "openai",
    label: "OpenAI",
    nomComplet: "OpenAI / Tiers Cloud",

    obtenirLabel(config = {}) {
      const preset = config.openaiPreset || "openai";
      return PRESET_CLOUD_LABELS[preset] || "OpenAI";
    },

    /**
     * Exécute le pipeline en 2 étapes : STT (Whisper) puis Nettoyage sémantique (LLM).
     * @param {string} audioBase64 - Audio en Base64
     * @param {string} [mimeType='audio/webm'] - Type MIME
     * @param {string} [voiceMode='natural'] - Mode de voix
     * @param {Object} [config={}] - Configuration Cloud
     * @returns {Promise<{success: boolean, text: string}>}
     */
    async transcrire(audioBase64, mimeType = "audio/webm", voiceMode = "natural", config = {}) {
      const sttUrl = (config.sttBaseUrl || "https://api.openai.com").trim();
      const sttApiKey = (config.sttApiKey || config.llmApiKey || "").trim();
      const sttModel = (config.sttModel || "whisper-1").trim();

      const llmUrl = (config.llmBaseUrl || "https://api.openai.com").trim();
      const llmApiKey = (config.llmApiKey || config.sttApiKey || "").trim();
      const llmModel = (config.llmModel || "gpt-4o-mini").trim();

      const estSttLocal = sttUrl.includes("localhost") || sttUrl.includes("127.0.0.1");
      if (!estSttLocal && !sttApiKey) {
        throw new Error("UNAUTHORIZED");
      }
      if (!llmApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      // Étape 1 : Transcription vocale brute via Whisper
      const texteBrut = await executerTranscriptionSTT({
        audioBase64,
        mimeType,
        sttUrl,
        sttApiKey,
        sttModel
      });

      // Étape 2 : Nettoyage sémantique et structuration Rambler via LLM
      const textePropre = await executerNettoyageLLM({
        texteBrut,
        voiceMode,
        llmUrl,
        llmApiKey,
        llmModel
      });

      return {
        success: true,
        text: textePropre
      };
    }
  };

  // ── 5. FOURNISSEUR 3 : MODÈLE 100 % LOCAL SOUVERAIN (OLLAMA / WHISPER) ─────

  const PRESET_LOCAL_LABELS = {
    ollama: "Ollama Local",
    lmstudio: "LM Studio",
    custom: "Local IA"
  };

  const FournisseurLocal = {
    id: "local",
    label: "Local",
    nomComplet: "Modèle Local (Ollama / Whisper)",

    obtenirLabel(config = {}) {
      const preset = config.localLlmPreset || "ollama";
      return PRESET_LOCAL_LABELS[preset] || "Local IA";
    },

    /**
     * Exécute le pipeline 100 % local : Whisper local (:8000) puis Ollama (:11434) ou LM Studio (:1234).
     * @param {string} audioBase64 - Audio en Base64
     * @param {string} [mimeType='audio/webm'] - Type MIME
     * @param {string} [voiceMode='natural'] - Mode de voix
     * @param {Object} [config={}] - Configuration locale
     * @returns {Promise<{success: boolean, text: string}>}
     */
    async transcrire(audioBase64, mimeType = "audio/webm", voiceMode = "natural", config = {}) {
      const sttUrl = (config.localSttUrl || "http://localhost:8000").trim();
      const sttModel = (config.localSttModel || "whisper-1").trim();
      const llmUrl = (config.localLlmUrl || "http://localhost:11434").trim();
      const llmModel = (config.localLlmModel || "llama3.2").trim();
      const apiKey = (config.localApiKey || "").trim();

      // Étape 1 : Transcription vocale sur le serveur Whisper local
      const texteBrut = await executerTranscriptionSTT({
        audioBase64,
        mimeType,
        sttUrl,
        sttApiKey: apiKey,
        sttModel
      });

      // Étape 2 : Nettoyage sémantique sur Ollama / LM Studio
      const textePropre = await executerNettoyageLLM({
        texteBrut,
        voiceMode,
        llmUrl,
        llmApiKey: apiKey,
        llmModel
      });

      return {
        success: true,
        text: textePropre
      };
    }
  };

  // ── 6. REGISTRE & GESTIONNAIRE GLOBAL MVSPROVIDERS ─────────────────────────

  const FOURNISSEURS = {
    gemini: FournisseurGemini,
    openai: FournisseurOpenAI,
    local: FournisseurLocal
  };

  const MVSProviders = {
    DEBUG,
    FOURNISSEURS,
    MODES_VOIX,
    construirePromptSysteme,
    nettoyerReponseLLM,
    construireEndpointChat,
    construireEndpointSTT,
    base64VersUint8Array,
    obtenirExtensionAudio,
    obtenirUrlWebSocketGeminiLive,
    construireSetupGeminiLive,
    executerNettoyageLLM,

    /**
     * Récupère un fournisseur par son identifiant avec son label dynamique.
     * @param {string} [id='gemini'] - 'gemini', 'openai' ou 'local'
     * @param {Object} [config={}] - Configuration active
     * @returns {Object} Instance du fournisseur
     */
    obtenirFournisseur(id = "gemini", config = {}) {
      const fournisseur = FOURNISSEURS[id] || FournisseurGemini;
      if (typeof fournisseur.obtenirLabel === "function") {
        return {
          ...fournisseur,
          label: fournisseur.obtenirLabel(config)
        };
      }
      return fournisseur;
    },

    /**
     * Vérifie si la configuration active possède les clés minimales pour démarrer l'enregistrement.
     * @param {Object} [config={}] - Configuration stockée
     * @returns {boolean} Vrai si prêt à enregistrer, faux si l'écran d'onboarding doit s'afficher
     */
    estConfigure(config = {}) {
      const provider = config.provider || "gemini";
      if (provider === "gemini") {
        return Boolean(config.geminiApiKey && config.geminiApiKey.trim().length > 0);
      }
      if (provider === "openai") {
        return Boolean(config.llmApiKey && config.llmApiKey.trim().length > 0);
      }
      if (provider === "local") {
        return Boolean(
          config.localSttUrl &&
          config.localSttUrl.trim().length > 0 &&
          config.localLlmUrl &&
          config.localLlmUrl.trim().length > 0
        );
      }
      return false;
    },

    /**
     * Exécute la transcription et le nettoyage sémantique selon le fournisseur actif.
     * @param {Object} config - Configuration active
     * @param {string} audioBase64 - Audio encodé en Base64
     * @param {string} [mimeType='audio/webm'] - Type MIME de l'enregistrement
     * @param {string} [voiceMode='natural'] - Mode de voix ('natural', 'pro', 'bullets')
     * @returns {Promise<{success: boolean, text: string}>}
     */
    async transcrire(config, audioBase64, mimeType = "audio/webm", voiceMode = "natural") {
      const providerId = (config && config.provider) || "gemini";
      const fournisseur = MVSProviders.obtenirFournisseur(providerId, config);
      return await fournisseur.transcrire(audioBase64, mimeType, voiceMode, config);
    },

    /**
     * Teste en direct la validité de la connexion au moteur configuré (depuis la page d'options).
     * @param {Object} config - Configuration à tester
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async testerConnexion(config = {}) {
      const provider = config.provider || "gemini";

      try {
        if (provider === "gemini") {
          const apiKey = (config.geminiApiKey || "").trim();
          if (!apiKey) {
            return { success: false, message: "UNAUTHORIZED" };
          }
          const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
          const rep = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!rep.ok) {
            if (rep.status === 400 || rep.status === 401 || rep.status === 403) {
              return { success: false, message: "UNAUTHORIZED" };
            }
            return { success: false, message: `HTTP ${rep.status}` };
          }
          return { success: true, message: "OK" };
        }

        if (provider === "openai") {
          const llmApiKey = (config.llmApiKey || "").trim();
          if (!llmApiKey) {
            return { success: false, message: "UNAUTHORIZED" };
          }
          const res = await executerNettoyageLLM({
            texteBrut: "Euh bonjour, test de connexion.",
            voiceMode: "natural",
            llmUrl: config.llmBaseUrl || "https://api.openai.com",
            llmApiKey,
            llmModel: config.llmModel || "gpt-4o-mini"
          });
          if (res) {
            return { success: true, message: "OK" };
          }
          return { success: false, message: "SERVICE_UNAVAILABLE" };
        }

        if (provider === "local") {
          const res = await executerNettoyageLLM({
            texteBrut: "Euh bonjour, test local.",
            voiceMode: "natural",
            llmUrl: config.localLlmUrl || "http://localhost:11434",
            llmApiKey: config.localApiKey || "",
            llmModel: config.localLlmModel || "llama3.2"
          });
          if (res) {
            return { success: true, message: "OK" };
          }
          return { success: false, message: "SERVICE_UNAVAILABLE" };
        }

        return { success: false, message: "UNKNOWN_PROVIDER" };
      } catch (err) {
        return { success: false, message: err.message || "NETWORK" };
      }
    },

    /**
     * Calcule le match pattern d'origine WebExtension requis pour le fournisseur sélectionné.
     * Note : Les match patterns WebExtension n'acceptent pas de numéro de port.
     * @param {string} [provider='gemini']
     * @param {Object} [config={}]
     * @returns {string} Pattern d'origine (ex: "https://generativelanguage.googleapis.com/*")
     */
    obtenirPatternOrigine(provider = "gemini", config = {}) {
      if (provider === "gemini") {
        return "https://generativelanguage.googleapis.com/*";
      }
      if (provider === "openai") {
        const preset = config.openaiPreset || "openai";
        if (preset === "openai") return "https://api.openai.com/*";
        if (preset === "groq") return "https://api.groq.com/*";
        if (preset === "mistral") return "https://api.mistral.ai/*";
        try {
          const u = new URL(config.llmBaseUrl || "https://api.openai.com");
          return `${u.protocol}//${u.hostname}/*`;
        } catch {
          return "https://api.openai.com/*";
        }
      }
      if (provider === "local") {
        try {
          const u = new URL(config.localLlmUrl || "http://localhost:11434");
          return `${u.protocol}//${u.hostname}/*`;
        } catch {
          return "http://localhost/*";
        }
      }
      return "https://generativelanguage.googleapis.com/*";
    },

    /**
     * Concatène proprement deux segments de transcription avec gestion de l'espace séparatrice.
     * @param {string} base
     * @param {string} ajout
     * @returns {string}
     */
    assemblerSegmentsLive(base, ajout) {
      const b = (base || "").trim();
      const a = (ajout || "").trim();
      if (!b) return a;
      if (!a) return b;
      if (/^[,.;:!?]/.test(a)) {
        return `${b}${a}`;
      }
      return `${b} ${a}`;
    },

    /**
     * Fusionne un segment final retourné par l'API avec la base accumulée,
     * en gérant à la fois le mode cumulatif (où le serveur renvoie l'intégralité du tour)
     * et le mode incrémental (où le serveur renvoie uniquement le dernier bout).
     * @param {string} base
     * @param {string} segment
     * @returns {string}
     */
    fusionnerSegmentFinal(base, segment) {
      const b = (base || "").trim();
      const s = (segment || "").trim();
      if (!b) return s;
      if (!s) return b;
      // Si le segment reçu contient déjà la base (mode cumulatif), le segment remplace la base
      if (s.startsWith(b)) return s;
      // Si le segment est déjà inclus à la fin de la base (redite ou écho tardif), conserver la base
      if (b.endsWith(s)) return b;
      // Sinon concaténation incrémentale propre avec gestion de la ponctuation
      if (/^[,.;:!?]/.test(s)) {
        return `${b}${s}`;
      }
      return `${b} ${s}`;
    }
  };

  // Exposition pour le background script, la popup et les tests unitaires Node.js
  globalThis.MVSProviders = MVSProviders;
})();
