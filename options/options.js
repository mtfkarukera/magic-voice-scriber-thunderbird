/**
 * Magic Voice Scriber — Logique Métier de la Page de Paramètres (Options)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Responsabilités :
 *   1. Appliquer l'internationalisation native sur tous les nœuds déclaratifs (6 langues)
 *   2. Charger et sauvegarder les préférences dans browser.storage.local
 *   3. Gérer les préréglages Cloud (OpenAI, Groq, Mistral, Custom) et Locaux (Ollama, LM Studio)
 *   4. Vérifier et demander en 1 clic les permissions d'hôtes WebExtension
 *   5. Tester en direct la connexion au moteur sélectionné
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;
const api = globalThis.browser || globalThis.messenger;

/**
 * Récupère une chaîne traduite depuis _locales/<lang>/messages.json.
 * @param {string} cle - Identifiant de la clé i18n
 * @returns {string}
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
 * Parcourt le DOM et applique les traductions sur tous les attributs data-i18n*.
 */
function appliquerI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const cle = el.getAttribute("data-i18n");
    const msg = t(cle);
    if (msg) el.textContent = msg;
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const cle = el.getAttribute("data-i18n-placeholder");
    const msg = t(cle);
    if (msg) el.setAttribute("placeholder", msg);
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

document.addEventListener("DOMContentLoaded", async () => {
  appliquerI18n();

  // ── Références DOM ─────────────────────────────────────────────────────────
  const form = document.getElementById("form-options");
  const selectProvider = document.getElementById("select-provider");
  const providerBadge = document.getElementById("provider-badge");
  const helpProvider = document.getElementById("help-provider");

  // Section 1A : Gemini
  const sectionGemini = document.getElementById("section-gemini");
  const inputGeminiKey = document.getElementById("gemini-api-key");
  const btnToggleGeminiKey = document.getElementById("btn-toggle-gemini-key");
  const selectGeminiModel = document.getElementById("gemini-model");

  // Section 1B : OpenAI / Tiers Cloud
  const sectionOpenai = document.getElementById("section-openai");
  const selectOpenaiPreset = document.getElementById("openai-preset");
  const inputSttUrl = document.getElementById("stt-base-url");
  const inputSttModel = document.getElementById("stt-model");
  const inputSttKey = document.getElementById("stt-api-key");
  const btnToggleSttKey = document.getElementById("btn-toggle-stt-key");
  const inputLlmUrl = document.getElementById("llm-base-url");
  const inputLlmModel = document.getElementById("llm-model");
  const inputLlmKey = document.getElementById("llm-api-key");
  const btnToggleLlmKey = document.getElementById("btn-toggle-llm-key");

  // Section 1C : Modèle Local
  const sectionLocal = document.getElementById("section-local");
  const inputLocalSttUrl = document.getElementById("local-stt-url");
  const inputLocalSttModel = document.getElementById("local-stt-model");
  const selectLocalLlmPreset = document.getElementById("local-llm-preset");
  const inputLocalLlmUrl = document.getElementById("local-llm-url");
  const inputLocalLlmModel = document.getElementById("local-llm-model");
  const inputLocalKey = document.getElementById("local-api-key");
  const btnToggleLocalKey = document.getElementById("btn-toggle-local-key");

  // Section 2 : Mode de Voix (réservée aux moteurs OpenAI/Tiers et Local)
  const sectionVoiceMode = document.getElementById("section-voice-mode");
  const selectVoiceModePolicy = document.getElementById("voice-mode-policy");
  const selectDefaultVoiceMode = document.getElementById("default-voice-mode");

  // Bannière Permission & Statut
  const permissionBanner = document.getElementById("permission-warning-banner");
  const permissionDomainCode = document.getElementById("permission-domain-code");
  const btnGrantPermission = document.getElementById("btn-grant-permission");
  const statusContainer = document.getElementById("status-container");
  const statusIcon = document.getElementById("status-icon");
  const statusText = document.getElementById("status-text");
  const btnTest = document.getElementById("btn-test");

  // ── Valeurs par défaut & Préréglages ───────────────────────────────────────
  const DEFAUTS = {
    provider: "gemini",
    geminiApiKey: "",
    geminiModel: "gemini-3.5-transcribe-live",
    openaiPreset: "openai",
    sttBaseUrl: "https://api.openai.com",
    sttApiKey: "",
    sttModel: "whisper-1",
    llmBaseUrl: "https://api.openai.com",
    llmApiKey: "",
    llmModel: "gpt-4o-mini",
    localSttUrl: "http://localhost:8000",
    localSttModel: "whisper-1",
    localLlmPreset: "ollama",
    localLlmUrl: "http://localhost:11434",
    localLlmModel: "llama3.2",
    localApiKey: "",
    voiceModePolicy: "remember",
    defaultVoiceMode: "natural",
    lastVoiceMode: "natural"
  };

  const PRESETS_CLOUD = {
    openai: {
      sttUrl: "https://api.openai.com",
      sttModel: "whisper-1",
      llmUrl: "https://api.openai.com",
      llmModel: "gpt-4o-mini"
    },
    groq: {
      sttUrl: "https://api.groq.com/openai",
      sttModel: "whisper-large-v3-turbo",
      llmUrl: "https://api.groq.com/openai",
      llmModel: "llama-3.3-70b-versatile"
    },
    mistral: {
      sttUrl: "https://api.groq.com/openai",
      sttModel: "whisper-large-v3-turbo",
      llmUrl: "https://api.mistral.ai",
      llmModel: "mistral-small-latest"
    }
  };

  const PRESETS_LOCAL = {
    ollama: {
      llmUrl: "http://localhost:11434",
      llmModel: "llama3.2"
    },
    lmstudio: {
      llmUrl: "http://localhost:1234",
      llmModel: "local-model"
    }
  };

  /**
   * Affiche un message dans la bannière de statut.
   * @param {'loading'|'success'|'error'} type
   * @param {string} message
   */
  function afficherStatut(type, message) {
    if (!statusContainer || !statusIcon || !statusText) return;
    statusContainer.className = `mvs-status-banner mvs-status-${type}`;
    statusContainer.classList.remove("mvs-hidden");

    if (type === "loading") statusIcon.textContent = "⏳";
    else if (type === "success") statusIcon.textContent = "✓";
    else statusIcon.textContent = "⚠";

    statusText.textContent = message;
  }

  /**
   * Collecte la configuration actuelle saisie dans le formulaire.
   * @returns {typeof DEFAUTS}
   */
  function lireConfigFormulaire() {
    return {
      provider: selectProvider.value,
      geminiApiKey: inputGeminiKey.value.trim(),
      geminiModel: selectGeminiModel.value,
      openaiPreset: selectOpenaiPreset.value,
      sttBaseUrl: inputSttUrl.value.trim() || "https://api.openai.com",
      sttApiKey: inputSttKey.value.trim(),
      sttModel: inputSttModel.value.trim() || "whisper-1",
      llmBaseUrl: inputLlmUrl.value.trim() || "https://api.openai.com",
      llmApiKey: inputLlmKey.value.trim(),
      llmModel: inputLlmModel.value.trim() || "gpt-4o-mini",
      localSttUrl: inputLocalSttUrl.value.trim() || "http://localhost:8000",
      localSttModel: inputLocalSttModel.value.trim() || "whisper-1",
      localLlmPreset: selectLocalLlmPreset.value,
      localLlmUrl: inputLocalLlmUrl.value.trim() || "http://localhost:11434",
      localLlmModel: inputLocalLlmModel.value.trim() || "llama3.2",
      localApiKey: inputLocalKey.value.trim(),
      voiceModePolicy: selectVoiceModePolicy.value,
      defaultVoiceMode: selectDefaultVoiceMode.value
    };
  }

  /**
   * Met à jour les panneaux visibles selon le fournisseur sélectionné.
   */
  function actualiserVisibiliteFournisseur() {
    const provider = selectProvider.value;

    sectionGemini.classList.add("mvs-hidden");
    sectionOpenai.classList.add("mvs-hidden");
    sectionLocal.classList.add("mvs-hidden");

    if (provider === "gemini") {
      sectionGemini.classList.remove("mvs-hidden");
      if (sectionVoiceMode) sectionVoiceMode.classList.add("mvs-hidden");
      providerBadge.textContent = t("badgeDefault");
      helpProvider.textContent = t("helpProviderGemini");
    } else if (provider === "openai") {
      sectionOpenai.classList.remove("mvs-hidden");
      if (sectionVoiceMode) sectionVoiceMode.classList.remove("mvs-hidden");
      providerBadge.textContent = "OpenAI / Cloud";
      helpProvider.textContent = t("helpProviderOpenai");
    } else if (provider === "local") {
      sectionLocal.classList.remove("mvs-hidden");
      if (sectionVoiceMode) sectionVoiceMode.classList.remove("mvs-hidden");
      providerBadge.textContent = "Localhost";
      helpProvider.textContent = t("helpProviderLocal");
    }

    verifierPermissionOrigine();
  }

  /**
   * Vérifie si la permission réseau d'hôte est déjà accordée pour l'URL configurée.
   */
  async function verifierPermissionOrigine() {
    if (!globalThis.MVSProviders) return;
    const config = lireConfigFormulaire();
    const origine = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);

    try {
      if (api && api.permissions && api.permissions.contains) {
        const accorde = await api.permissions.contains({ origins: [origine] });
        if (!accorde) {
          permissionDomainCode.textContent = origine;
          permissionBanner.classList.remove("mvs-hidden");
          return;
        }
      }
    } catch {
      /* Ignorer */
    }
    permissionBanner.classList.add("mvs-hidden");
  }

  /**
   * Configure un bouton Afficher / Masquer pour un champ de clé API.
   * @param {HTMLButtonElement} bouton
   * @param {HTMLInputElement} champ
   */
  function lierBoutonVisibiliteCle(bouton, champ) {
    if (!bouton || !champ) return;
    bouton.addEventListener("click", () => {
      champ.type = champ.type === "password" ? "text" : "password";
    });
  }

  lierBoutonVisibiliteCle(btnToggleGeminiKey, inputGeminiKey);
  lierBoutonVisibiliteCle(btnToggleSttKey, inputSttKey);
  lierBoutonVisibiliteCle(btnToggleLlmKey, inputLlmKey);
  lierBoutonVisibiliteCle(btnToggleLocalKey, inputLocalKey);

  // ── Chargement initial depuis browser.storage.local ────────────────────────
  try {
    const stocke = await api.storage.local.get(Object.keys(DEFAUTS));
    const cfg = { ...DEFAUTS, ...stocke };

    selectProvider.value = cfg.provider;
    inputGeminiKey.value = cfg.geminiApiKey;
    selectGeminiModel.value = cfg.geminiModel;

    selectOpenaiPreset.value = cfg.openaiPreset;
    inputSttUrl.value = cfg.sttBaseUrl;
    inputSttKey.value = cfg.sttApiKey;
    inputSttModel.value = cfg.sttModel;
    inputLlmUrl.value = cfg.llmBaseUrl;
    inputLlmKey.value = cfg.llmApiKey;
    inputLlmModel.value = cfg.llmModel;

    inputLocalSttUrl.value = cfg.localSttUrl;
    inputLocalSttModel.value = cfg.localSttModel;
    selectLocalLlmPreset.value = cfg.localLlmPreset;
    inputLocalLlmUrl.value = cfg.localLlmUrl;
    inputLocalLlmModel.value = cfg.localLlmModel;
    inputLocalKey.value = cfg.localApiKey;

    selectVoiceModePolicy.value = cfg.voiceModePolicy;
    selectDefaultVoiceMode.value = cfg.defaultVoiceMode;
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] Erreur lecture options :", err);
  }

  actualiserVisibiliteFournisseur();

  // ── Événements de Changement de Fournisseur & Presets ──────────────────────
  selectProvider.addEventListener("change", actualiserVisibiliteFournisseur);

  selectOpenaiPreset.addEventListener("change", () => {
    const preset = PRESETS_CLOUD[selectOpenaiPreset.value];
    if (preset) {
      inputSttUrl.value = preset.sttUrl;
      inputSttModel.value = preset.sttModel;
      inputLlmUrl.value = preset.llmUrl;
      inputLlmModel.value = preset.llmModel;
    }
    verifierPermissionOrigine();
  });

  selectLocalLlmPreset.addEventListener("change", () => {
    const preset = PRESETS_LOCAL[selectLocalLlmPreset.value];
    if (preset) {
      inputLocalLlmUrl.value = preset.llmUrl;
      inputLocalLlmModel.value = preset.llmModel;
    }
    verifierPermissionOrigine();
  });

  inputLlmUrl.addEventListener("input", verifierPermissionOrigine);
  inputLocalLlmUrl.addEventListener("input", verifierPermissionOrigine);

  // ── Autorisation Réseau 1-Clic ─────────────────────────────────────────────
  if (btnGrantPermission) {
    btnGrantPermission.addEventListener("click", async () => {
      const config = lireConfigFormulaire();
      const origine = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);
      try {
        if (api.permissions && api.permissions.request) {
          const accorde = await api.permissions.request({ origins: [origine] });
          if (accorde) {
            permissionBanner.classList.add("mvs-hidden");
          }
        }
      } catch {
        /* Ignorer */
      }
    });
  }

  // ── Test de Connexion en Direct ────────────────────────────────────────────
  if (btnTest) {
    btnTest.addEventListener("click", async () => {
      const config = lireConfigFormulaire();
      const origine = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);

      try {
        if (api.permissions && api.permissions.request) {
          await api.permissions.request({ origins: [origine] });
          await verifierPermissionOrigine();
        }
      } catch {
        /* Ignorer */
      }

      afficherStatut("loading", t("statusTesting"));

      try {
        const res = await api.runtime.sendMessage({
          action: "testProvider",
          config
        });

        if (res && res.success) {
          afficherStatut("success", t("statusTestSuccess"));
        } else {
          const code = (res && res.message) || "SERVICE_UNAVAILABLE";
          const detail = code === "UNAUTHORIZED" ? t("errorUnauthorized") : code;
          afficherStatut("error", `${t("statusTestFailed")} ${detail}`);
        }
      } catch {
        afficherStatut("error", `${t("statusTestFailed")} ${t("errorNetwork")}`);
      }
    });
  }

  // ── Sauvegarde des Paramètres ──────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const config = lireConfigFormulaire();
    const origine = globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config);

    try {
      if (api.permissions && api.permissions.request) {
        await api.permissions.request({ origins: [origine] });
        await verifierPermissionOrigine();
      }
    } catch {
      /* Ignorer */
    }

    try {
      // Si l'utilisateur force le mode par défaut à l'ouverture, on aligne aussi lastVoiceMode
      const donneesASauvegarder = { ...config };
      if (config.voiceModePolicy === "default") {
        donneesASauvegarder.lastVoiceMode = config.defaultVoiceMode;
      }

      await api.storage.local.set(donneesASauvegarder);
      afficherStatut("success", t("statusSaved"));
    } catch {
      afficherStatut("error", t("errorServiceUnavailable"));
    }
  });
});
