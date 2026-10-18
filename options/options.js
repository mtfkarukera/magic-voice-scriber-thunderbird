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
  if (api && api.i18n && typeof api.i18n.getUILanguage === "function") {
    const lang = api.i18n.getUILanguage().slice(0, 2);
    document.documentElement.lang = lang;
  }
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

  // Section 1B : Mistral AI
  const sectionMistral = document.getElementById("section-mistral");
  const inputMistralKey = document.getElementById("mistral-api-key");
  const btnToggleMistralKey = document.getElementById("btn-toggle-mistral-key");

  // Section 1C : Modèle Local
  const sectionLocal = document.getElementById("section-local");
  const inputLocalSttUrl = document.getElementById("local-stt-url");
  const inputLocalSttModel = document.getElementById("local-stt-model");

  // Section 2 : Ergonomie & Affichage
  const switchCaretGem = document.getElementById("caret-gem-enabled");

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
    mistralApiKey: "",
    mistralModel: "voxtral-mini-latest",
    localSttUrl: "http://localhost:8000",
    localSttModel: "whisper-1",
    caretGemEnabled: false,
    voiceModePolicy: "default",
    defaultVoiceMode: "natural",
    lastVoiceMode: "natural"
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
      mistralApiKey: inputMistralKey ? inputMistralKey.value.trim() : "",
      mistralModel: "voxtral-mini-latest",
      localSttUrl: inputLocalSttUrl.value.trim() || "http://localhost:8000",
      localSttModel: inputLocalSttModel.value.trim() || "whisper-1",
      caretGemEnabled: switchCaretGem ? switchCaretGem.checked : false,
      voiceModePolicy: "default",
      defaultVoiceMode: "natural"
    };
  }

  /**
   * Met à jour les panneaux visibles selon le fournisseur sélectionné.
   */
  function actualiserVisibiliteFournisseur() {
    const provider = selectProvider.value;

    sectionGemini.classList.add("mvs-hidden");
    if (sectionMistral) sectionMistral.classList.add("mvs-hidden");
    sectionLocal.classList.add("mvs-hidden");

    if (provider === "gemini") {
      sectionGemini.classList.remove("mvs-hidden");
      providerBadge.textContent = t("badgeDefault");
      helpProvider.textContent = t("helpProviderGemini");
    } else if (provider === "mistral") {
      if (sectionMistral) sectionMistral.classList.remove("mvs-hidden");
      providerBadge.textContent = "Mistral AI";
      helpProvider.textContent = t("helpProviderMistral") || "Mistral AI (Voxtral)";
    } else if (provider === "local") {
      sectionLocal.classList.remove("mvs-hidden");
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
    const origines = globalThis.MVSProviders.obtenirPatternsOrigines
      ? globalThis.MVSProviders.obtenirPatternsOrigines(config.provider, config)
      : [globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config)];

    try {
      if (api && api.permissions && api.permissions.contains) {
        const accorde = await api.permissions.contains({ origins: origines });
        if (!accorde) {
          permissionDomainCode.textContent = origines.join(", ");
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
    bouton.setAttribute("aria-pressed", "false");
    bouton.addEventListener("click", () => {
      const estMasque = champ.type === "password";
      champ.type = estMasque ? "text" : "password";
      bouton.setAttribute("aria-pressed", estMasque ? "true" : "false");
    });
  }

  lierBoutonVisibiliteCle(btnToggleGeminiKey, inputGeminiKey);
  lierBoutonVisibiliteCle(btnToggleMistralKey, inputMistralKey);

  // ── Chargement initial depuis browser.storage.local ────────────────────────
  try {
    const stocke = await api.storage.local.get(Object.keys(DEFAUTS));
    const cfg = { ...DEFAUTS, ...stocke };

    selectProvider.value = cfg.provider;
    inputGeminiKey.value = cfg.geminiApiKey || "";
    selectGeminiModel.value = cfg.geminiModel || "gemini-3.5-transcribe-live";

    if (inputMistralKey) inputMistralKey.value = cfg.mistralApiKey || "";

    inputLocalSttUrl.value = cfg.localSttUrl;
    inputLocalSttModel.value = cfg.localSttModel;

    if (typeof cfg.caretGemEnabled === "boolean" && switchCaretGem) {
      switchCaretGem.checked = cfg.caretGemEnabled;
    }
  } catch (err) {
    if (DEBUG) console.warn("[MagicVoiceScriber] Erreur lecture options :", err);
  }

  actualiserVisibiliteFournisseur();

  // ── Événements de Changement de Fournisseur ──────────────────────────────
  selectProvider.addEventListener("change", actualiserVisibiliteFournisseur);
  inputLocalSttUrl.addEventListener("input", verifierPermissionOrigine);

  // ── Autorisation Réseau 1-Clic ─────────────────────────────────────────────
  if (btnGrantPermission) {
    btnGrantPermission.addEventListener("click", async () => {
      const config = lireConfigFormulaire();
      const origines = globalThis.MVSProviders.obtenirPatternsOrigines
        ? globalThis.MVSProviders.obtenirPatternsOrigines(config.provider, config)
        : [globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config)];
      try {
        if (api.permissions && api.permissions.request) {
          const accorde = await api.permissions.request({ origins: origines });
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
      const origines = globalThis.MVSProviders.obtenirPatternsOrigines
        ? globalThis.MVSProviders.obtenirPatternsOrigines(config.provider, config)
        : [globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config)];

      try {
        if (api.permissions && api.permissions.request) {
          await api.permissions.request({ origins: origines });
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
          const code = (res && (res.message || res.error)) || "SERVICE_UNAVAILABLE";
          const detail = code === "UNAUTHORIZED" ? t("errorUnauthorized") : code;
          afficherStatut("error", `${t("statusTestFailed")} ${detail}`);
        }
      } catch {
        afficherStatut("error", `${t("statusTestFailed")} ${t("errorNetwork")}`);
      }
    });
  }

  // ── Lancement du Wizard d'onboarding & diagnostic ──────────────────────────
  const btnOpenSetup = document.getElementById("btn-open-setup");
  if (btnOpenSetup) {
    btnOpenSetup.addEventListener("click", () => {
      if (api && api.runtime && typeof api.runtime.sendMessage === "function") {
        api.runtime.sendMessage({ action: "openSetup" });
      } else {
        const urlSetup = api.runtime.getURL("setup/setup.html");
        window.open(urlSetup, "_blank");
      }
    });
  }

  // ── Sauvegarde des Paramètres ──────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const config = lireConfigFormulaire();
    const origines = globalThis.MVSProviders.obtenirPatternsOrigines
      ? globalThis.MVSProviders.obtenirPatternsOrigines(config.provider, config)
      : [globalThis.MVSProviders.obtenirPatternOrigine(config.provider, config)];

    try {
      if (api.permissions && api.permissions.request) {
        await api.permissions.request({ origins: origines });
        await verifierPermissionOrigine();
      }
    } catch {
      /* Ignorer */
    }

    try {
      await api.storage.local.set(config);
      afficherStatut("success", t("statusSaved"));
    } catch {
      afficherStatut("error", t("errorServiceUnavailable"));
    }
  });
});
