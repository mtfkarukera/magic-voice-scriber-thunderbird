/**
 * Magic Voice Scriber — Logique Métier de l'Assistant de Configuration & Diagnostic
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Responsabilités :
 *   1. Guider l'utilisateur pas-à-pas à travers un stepper interactif (4 étapes)
 *   2. Diagnostiquer l'accès microphone avec visualiseur 5 barres en direct et détection de silence Linux Snap
 *   3. Offrir la copie double-détente sécurisée pour les préférences et commandes système
 *   4. Valider en 1 clic la connexion aux APIs d'IA (Gemini, Mistral, Groq, OpenAI, Local)
 *   5. Enregistrer les préférences globales dans browser.storage.local
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;
const api = globalThis.browser || globalThis.messenger;

/**
 * Récupère une chaîne traduite depuis les dictionnaires i18n.
 * @param {string} cle - Clé de traduction
 * @returns {string}
 */
function t(cle) {
  try {
    if (api && api.i18n && typeof api.i18n.getMessage === "function") {
      const msg = api.i18n.getMessage(cle);
      if (msg) return msg;
    }
  } catch {
    /* Fallback silencieux */
  }
  return "";
}

/**
 * Applique l'internationalisation sur tous les éléments déclaratifs du DOM.
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
}

/**
 * Copie du texte dans le presse-papiers avec repli textarea (double-détente).
 * @param {string} texte - Chaîne à copier
 * @returns {Promise<boolean>}
 */
async function copierDansPressePapier(texte) {
  let succes = false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(texte);
      succes = true;
    }
  } catch {
    /* Repli execCommand */
  }

  if (!succes) {
    try {
      const zone = document.createElement("textarea");
      zone.value = texte;
      zone.setAttribute("readonly", "");
      zone.style.position = "fixed";
      zone.style.left = "-9999px";
      zone.style.opacity = "0";
      document.body.appendChild(zone);
      zone.focus();
      zone.select();
      succes = document.execCommand("copy");
      zone.remove();
    } catch {
      succes = false;
    }
  }
  return succes;
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

document.addEventListener("DOMContentLoaded", async () => {
  if (api && api.i18n && typeof api.i18n.getUILanguage === "function") {
    const lang = api.i18n.getUILanguage().slice(0, 2);
    document.documentElement.lang = lang;
  }
  appliquerI18n();

  // ═════════════════════════════════════════════════════════════════════════
  // 1. GESTION DU STEPPER (NAVIGATION PAS-À-PAS)
  // ═════════════════════════════════════════════════════════════════════════

  let etapeCourante = 1;
  const totalEtapes = 5;

  const panels = {
    1: document.getElementById("step-panel-1"),
    2: document.getElementById("step-panel-2"),
    3: document.getElementById("step-panel-3"),
    4: document.getElementById("step-panel-4"),
    5: document.getElementById("step-panel-5")
  };

  const stepIndicators = {
    1: document.getElementById("step-btn-1"),
    2: document.getElementById("step-btn-2"),
    3: document.getElementById("step-btn-3"),
    4: document.getElementById("step-btn-4"),
    5: document.getElementById("step-btn-5")
  };

  function afficherEtape(numero) {
    if (numero < 1 || numero > totalEtapes) return;

    // Arrêt propre du test micro si on quitte l'étape 1
    if (etapeCourante === 1 && numero !== 1) {
      arreterTestMicro();
    }

    // Arrêt propre du bac à sable interactif si on quitte l'étape 4
    if (etapeCourante === 4 && numero !== 4 && typeof arreterEnregistrementDemo === "function") {
      arreterEnregistrementDemo(true);
    }

    etapeCourante = numero;

    // Mise à jour des panneaux
    Object.keys(panels).forEach((k) => {
      const n = parseInt(k, 10);
      if (panels[n]) {
        panels[n].classList.toggle("active", n === numero);
      }
    });

    // Mise à jour des indicateurs du stepper
    Object.keys(stepIndicators).forEach((k) => {
      const n = parseInt(k, 10);
      const btn = stepIndicators[n];
      if (btn) {
        btn.classList.toggle("active", n === numero);
        btn.classList.toggle("completed", n < numero);
        if (n === numero) {
          btn.setAttribute("aria-current", "step");
        } else {
          btn.removeAttribute("aria-current");
        }
      }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Écouteurs des boutons "Suivant" et "Retour"
  document.querySelectorAll(".mvs-btn-next").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cible = parseInt(btn.getAttribute("data-next"), 10);
      afficherEtape(cible);
    });
  });

  document.querySelectorAll(".mvs-btn-prev").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cible = parseInt(btn.getAttribute("data-prev"), 10);
      afficherEtape(cible);
    });
  });

  // Clic sur les pastilles du stepper
  Object.keys(stepIndicators).forEach((k) => {
    const n = parseInt(k, 10);
    const btn = stepIndicators[n];
    if (btn) {
      btn.addEventListener("click", () => afficherEtape(n));
    }
  });

  // Libération propre des flux micro si la fenêtre est fermée
  window.addEventListener("pagehide", () => {
    arreterTestMicro();
    if (typeof arreterEnregistrementDemo === "function") {
      arreterEnregistrementDemo(true);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. ÉTAPE 1 : DÉTECTION OS & TEST MICROPHONE EN DIRECT
  // ═════════════════════════════════════════════════════════════════════════

  let platformOS = "unknown";
  const osIcon = document.getElementById("os-icon");
  const osNameLabel = document.getElementById("os-name-label");
  const osDetailText = document.getElementById("os-detail-text");
  const linuxSnapAlert = document.getElementById("linux-snap-alert");
  const setupShortcutBadge = document.getElementById("setup-shortcut-badge");

  try {
    if (api && api.runtime && typeof api.runtime.getPlatformInfo === "function") {
      const info = await api.runtime.getPlatformInfo();
      platformOS = info.os || "unknown";
    }
  } catch {
    /* Fallback userAgent */
    if (navigator.userAgent.includes("Linux")) platformOS = "linux";
    else if (navigator.userAgent.includes("Mac")) platformOS = "mac";
    else if (navigator.userAgent.includes("Win")) platformOS = "win";
  }

  if (platformOS === "linux") {
    if (osIcon) osIcon.textContent = "🐧";
    if (osNameLabel) osNameLabel.textContent = "Système Linux détecté";
    if (osDetailText) osDetailText.textContent = "Ubuntu, Debian ou dérivé Linux";
    if (linuxSnapAlert) linuxSnapAlert.classList.remove("mvs-hidden");
  } else if (platformOS === "mac") {
    if (osIcon) osIcon.textContent = "🍏";
    if (osNameLabel) osNameLabel.textContent = "Système macOS détecté";
    if (osDetailText) osDetailText.textContent = "Apple Silicon ou Intel";
    if (setupShortcutBadge) setupShortcutBadge.textContent = "⌘ + Shift + S";
  } else if (platformOS === "win") {
    if (osIcon) osIcon.textContent = "🪟";
    if (osNameLabel) osNameLabel.textContent = "Système Windows détecté";
    if (osDetailText) osDetailText.textContent = "Microsoft Windows 10/11";
  } else {
    if (osIcon) osIcon.textContent = "💻";
    if (osNameLabel) osNameLabel.textContent = "Système détecté";
  }

  // Copie de la préférence Thunderbird
  const btnCopyPref = document.getElementById("btn-copy-pref");
  if (btnCopyPref) {
    btnCopyPref.addEventListener("click", async () => {
      const nomPref = "media.navigator.permission.disabled";
      const succes = await copierDansPressePapier(nomPref);
      if (succes) {
        btnCopyPref.textContent = t("btnCopyMicPrefCopied") || "Copié ✓";
        setTimeout(() => {
          btnCopyPref.textContent = t("btnCopyMicPref") || "Copier le nom de la préférence";
        }, 3000);
      }
    });
  }

  // Copie de la commande deb pour Linux
  const btnCopyDebCmd = document.getElementById("btn-copy-deb-cmd");
  if (btnCopyDebCmd) {
    btnCopyDebCmd.addEventListener("click", async () => {
      const commande = "sudo add-apt-repository -y ppa:mozillateam/ppa && echo -e 'Package: thunderbird*\\nPin: release o=LP-PPA-mozillateam\\nPin-Priority: 1001' | sudo tee /etc/apt/preferences.d/mozillateam-thunderbird && sudo apt update && sudo apt install -y thunderbird";
      const succes = await copierDansPressePapier(commande);
      if (succes) {
        btnCopyDebCmd.textContent = t("cmdCopied") || "Commande copiée ✓";
        setTimeout(() => {
          btnCopyDebCmd.textContent = t("btnCopyCmd") || "Copier la commande";
        }, 3000);
      }
    });
  }

  // Moteur audio de test live
  let testAudioStream = null;
  let testAudioCtx = null;
  let testAudioAnalyser = null;
  let testAudioInterval = null;
  let testAudioMaxAmplitude = 0;
  let testAudioStartTime = 0;

  const btnTestMic = document.getElementById("btn-test-mic");
  const micStatusText = document.getElementById("mic-status-text");
  const waveformBars = document.querySelectorAll(".mvs-waveform-bar");

  function definirContenuBoutonMicro(btn, icone, texte) {
    if (!btn) return;
    const spanIcone = document.createElement("span");
    spanIcone.className = "mvs-btn-icon-symbol";
    spanIcone.setAttribute("aria-hidden", "true");
    spanIcone.textContent = icone;
    const spanTexte = document.createElement("span");
    spanTexte.textContent = texte;
    btn.replaceChildren(spanIcone, spanTexte);
  }

  function definirStatutMicro(element, titre, sousTitre, couleur) {
    if (!element) return;
    element.replaceChildren();
    if (titre) {
      const s = document.createElement("strong");
      if (couleur) s.style.color = couleur;
      s.textContent = titre;
      element.appendChild(s);
    }
    if (sousTitre) {
      if (titre) element.appendChild(document.createElement("br"));
      const span = document.createElement("span");
      span.textContent = sousTitre;
      element.appendChild(span);
    }
  }

  function arreterTestMicro() {
    if (testAudioInterval) {
      clearInterval(testAudioInterval);
      testAudioInterval = null;
    }
    if (testAudioStream) {
      testAudioStream.getTracks().forEach((track) => track.stop());
      testAudioStream = null;
    }
    if (testAudioCtx && testAudioCtx.state !== "closed") {
      testAudioCtx.close().catch(() => {});
      testAudioCtx = null;
    }
    waveformBars.forEach((bar) => {
      bar.style.height = "6px";
    });
    if (btnTestMic) {
      definirContenuBoutonMicro(btnTestMic, "🎙️", t("btnTestMic") || "Tester le microphone");
      btnTestMic.classList.remove("mvs-btn-secondary");
      btnTestMic.classList.add("mvs-btn-primary");
    }
  }

  let testDemarrageEnCours = false;
  async function demarrerTestMicro() {
    if (testDemarrageEnCours) return;
    if (testAudioStream) {
      arreterTestMicro();
      if (micStatusText) micStatusText.textContent = t("micStatusIdle") || "Test terminé. Cliquez pour relancer.";
      return;
    }

    testDemarrageEnCours = true;
    if (micStatusText) micStatusText.textContent = "Accès au microphone en cours…";
    testAudioMaxAmplitude = 0;
    testAudioStartTime = Date.now();

    try {
      testAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      testAudioCtx = new AudioCtxClass();
      if (testAudioCtx.state === "suspended") {
        await testAudioCtx.resume();
      }

      const sourceNode = testAudioCtx.createMediaStreamSource(testAudioStream);
      testAudioAnalyser = testAudioCtx.createAnalyser();
      testAudioAnalyser.fftSize = 64;
      sourceNode.connect(testAudioAnalyser);

      const freqData = new Uint8Array(testAudioAnalyser.frequencyBinCount);

      if (btnTestMic) {
        definirContenuBoutonMicro(btnTestMic, "⏹️", "Arrêter le test");
        btnTestMic.classList.remove("mvs-btn-primary");
        btnTestMic.classList.add("mvs-btn-secondary");
      }
      if (micStatusText) micStatusText.textContent = "Parlez dans votre micro : les barres doivent réagir !";

      testAudioInterval = setInterval(() => {
        if (!testAudioAnalyser) return;
        testAudioAnalyser.getByteFrequencyData(freqData);

        let total = 0;
        for (let i = 0; i < freqData.length; i++) total += freqData[i];
        const moyenne = total / freqData.length;
        if (moyenne > testAudioMaxAmplitude) {
          testAudioMaxAmplitude = moyenne;
        }

        // Animation des 5 barres
        waveformBars.forEach((bar, idx) => {
          const val = freqData[idx * 2] || moyenne;
          const h = Math.max(6, Math.min(42, Math.round((val / 255) * 44)));
          bar.style.height = `${h}px`;
        });

        // Détection de silence après 1,8 s
        const ecoule = Date.now() - testAudioStartTime;
        if (ecoule > 1800) {
          if (testAudioMaxAmplitude < 1.5) {
            if (platformOS === "linux") {
              definirStatutMicro(
                micStatusText,
                "⚠️ Silence absolu détecté sous Linux.",
                "Si vous utilisez Thunderbird Snap, le paquet bloque le micro. Basculez en version .deb.",
                "#ef4444"
              );
              if (linuxSnapAlert) linuxSnapAlert.classList.remove("mvs-hidden");
            } else {
              if (micStatusText) {
                micStatusText.textContent = "Aucun son capté. Vérifiez que votre micro n'est pas coupé.";
              }
            }
          } else {
            definirStatutMicro(
              micStatusText,
              "Microphone parfaitement opérationnel ✓",
              "Signal audio capté avec succès !",
              "#10b981"
            );
          }
        }
      }, 70);
    } catch (err) {
      if (DEBUG) console.warn("[Setup] Erreur test micro :", err);
      definirStatutMicro(
        micStatusText,
        "Impossible d'accéder au microphone.",
        "Vérifiez la préférence media.navigator.permission.disabled ci-dessous.",
        "#ef4444"
      );
      arreterTestMicro();
    } finally {
      testDemarrageEnCours = false;
    }
  }

  if (btnTestMic) {
    btnTestMic.addEventListener("click", demarrerTestMicro);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. ÉTAPE 2 : CONFIGURATION DU FOURNISSEUR & TEST DE CONNEXION API
  // ═════════════════════════════════════════════════════════════════════════

  const selectProvider = document.getElementById("setup-select-provider");
  const panelGemini = document.getElementById("setup-panel-gemini");
  const panelMistral = document.getElementById("setup-panel-mistral");
  const panelLocal = document.getElementById("setup-panel-local");

  const inputGeminiKey = document.getElementById("setup-gemini-key");
  const btnToggleGeminiKey = document.getElementById("btn-toggle-setup-gemini-key");
  const inputMistralKey = document.getElementById("setup-mistral-key");
  const btnToggleMistralKey = document.getElementById("btn-toggle-setup-mistral-key");
  const selectLocalPreset = document.getElementById("setup-local-preset");

  const btnTestApi = document.getElementById("btn-test-api");
  const apiTestStatus = document.getElementById("api-test-status");

  const PRESETS_LOCAL = {
    ollama: {
      sttUrl: "http://localhost:8000",
      sttModel: "whisper-1",
      llmUrl: "http://localhost:11434",
      llmModel: "llama3.2"
    },
    lmstudio: {
      sttUrl: "http://localhost:8000",
      sttModel: "whisper-1",
      llmUrl: "http://localhost:1234",
      llmModel: "local-model"
    },
    custom: {
      sttUrl: "http://localhost:8000",
      sttModel: "whisper-1",
      llmUrl: "http://localhost:11434",
      llmModel: "llama3.2"
    }
  };

  function construireConfigActive(modeleGemini = "gemini-3.5-transcribe-live") {
    const provider = selectProvider ? selectProvider.value : "gemini";
    const config = {
      provider,
      geminiApiKey: inputGeminiKey ? inputGeminiKey.value.trim() : "",
      geminiModel: modeleGemini
    };

    if (provider === "mistral") {
      config.mistralApiKey = inputMistralKey ? inputMistralKey.value.trim() : "";
      config.mistralModel = "voxtral-mini-latest";
    } else if (provider === "local") {
      const presetKey = selectLocalPreset ? selectLocalPreset.value : "ollama";
      const preset = PRESETS_LOCAL[presetKey] || PRESETS_LOCAL.ollama;
      config.localLlmPreset = presetKey;
      config.localSttUrl = preset.sttUrl;
      config.localSttModel = preset.sttModel;
      config.localLlmUrl = preset.llmUrl;
      config.localLlmModel = preset.llmModel;
      config.localApiKey = "";
    }
    return config;
  }

  // Masquer / afficher mot de passe
  if (btnToggleGeminiKey && inputGeminiKey) {
    btnToggleGeminiKey.addEventListener("click", () => {
      const estMasque = inputGeminiKey.type === "password";
      inputGeminiKey.type = estMasque ? "text" : "password";
      btnToggleGeminiKey.setAttribute("aria-pressed", estMasque ? "true" : "false");
    });
  }
  if (btnToggleMistralKey && inputMistralKey) {
    btnToggleMistralKey.addEventListener("click", () => {
      const estMasque = inputMistralKey.type === "password";
      inputMistralKey.type = estMasque ? "text" : "password";
      btnToggleMistralKey.setAttribute("aria-pressed", estMasque ? "true" : "false");
    });
  }

  function actualiserAffichageFournisseur() {
    const val = selectProvider ? selectProvider.value : "gemini";
    if (panelGemini) panelGemini.classList.toggle("mvs-hidden", val !== "gemini");
    if (panelMistral) panelMistral.classList.toggle("mvs-hidden", val !== "mistral");
    if (panelLocal) panelLocal.classList.toggle("mvs-hidden", val !== "local");

    // Invariant Strict #1 : Moteurs 1 passe (Gemini SMART & Mistral Voxtral) = Zéro prompt de style artificiel
    const estMoteurUnPasse = val === "gemini" || val === "mistral";
    const panelGeminiSmart = document.getElementById("setup-gemini-smart-panel");
    const panelLlmModes = document.getElementById("setup-llm-modes-panel");
    if (panelGeminiSmart) panelGeminiSmart.classList.toggle("mvs-hidden", !estMoteurUnPasse);
    if (panelLlmModes) panelLlmModes.classList.toggle("mvs-hidden", estMoteurUnPasse);

    if (apiTestStatus) {
      apiTestStatus.textContent = "";
      apiTestStatus.className = "mvs-api-status";
    }
  }

  if (selectProvider) {
    selectProvider.addEventListener("change", actualiserAffichageFournisseur);
  }

  // Pré-remplissage depuis le storage existant
  try {
    const configExistante = await api.storage.local.get([
      "provider",
      "geminiApiKey",
      "mistralApiKey",
      "localLlmPreset",
      "defaultVoiceMode"
    ]);

    if (configExistante.provider && selectProvider) {
      selectProvider.value = configExistante.provider;
    }
    if (configExistante.geminiApiKey && inputGeminiKey) {
      inputGeminiKey.value = configExistante.geminiApiKey;
    }
    if (configExistante.mistralApiKey && inputMistralKey) {
      inputMistralKey.value = configExistante.mistralApiKey;
    }
    if (configExistante.localLlmPreset && selectLocalPreset) {
      selectLocalPreset.value = configExistante.localLlmPreset;
    }
    actualiserAffichageFournisseur();

    if (configExistante.defaultVoiceMode) {
      const radio = document.querySelector(`input[name="setup-voice-mode"][value="${configExistante.defaultVoiceMode}"]`);
      if (radio) {
        radio.checked = true;
        document.querySelectorAll(".mvs-mode-option").forEach((opt) => {
          opt.classList.toggle("selected", opt.contains(radio));
        });
      }
    }
  } catch (errStockage) {
    if (DEBUG) console.warn("[Setup] Impossible de lire le storage :", errStockage);
  }

  // Test de connexion direct
  if (btnTestApi) {
    btnTestApi.addEventListener("click", async () => {
      if (apiTestStatus) {
        apiTestStatus.textContent = "Vérification en cours…";
        apiTestStatus.className = "mvs-api-status";
      }

      const configTest = construireConfigActive("gemini-3.5-transcribe-live");

      try {
        let res;
        if (api && api.runtime && typeof api.runtime.sendMessage === "function") {
          res = await api.runtime.sendMessage({ action: "testProvider", config: configTest });
        } else if (globalThis.MVSProviders) {
          res = await globalThis.MVSProviders.testerConnexion(configTest);
        }

        if (res && res.success) {
          if (apiTestStatus) {
            apiTestStatus.textContent = "Connexion réussie ✓ Prêt à l'emploi";
            apiTestStatus.className = "mvs-api-status success";
          }
        } else {
          const detail = res && res.message ? res.message : "Vérifiez votre clé d'API";
          if (apiTestStatus) {
            apiTestStatus.textContent = `Échec de connexion : ${detail}`;
            apiTestStatus.className = "mvs-api-status error";
          }
        }
      } catch (errApi) {
        if (apiTestStatus) {
          apiTestStatus.textContent = `Erreur réseau : ${errApi.message || "Impossible de joindre le service"}`;
          apiTestStatus.className = "mvs-api-status error";
        }
      }
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. ÉTAPE 3 : STYLES DE DICTÉE (CARDS RADIO)
  // ═════════════════════════════════════════════════════════════════════════

  document.querySelectorAll(".mvs-mode-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".mvs-mode-option").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      const input = opt.querySelector("input");
      if (input) input.checked = true;
    });
  });

  document.querySelectorAll('input[name="setup-voice-mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll(".mvs-mode-option").forEach((opt) => {
        opt.classList.toggle("selected", opt.contains(input));
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. ÉTAPE 4 : BAC À SABLE INTERACTIF (ESSAYEZ LA MAGIE EN DIRECT !)
  // ═════════════════════════════════════════════════════════════════════════

  let demoAudioStream = null;
  let demoAudioCtx = null;
  let demoAudioAnalyser = null;
  let demoAudioInterval = null;
  let demoMediaRecorder = null;
  let demoAudioChunks = [];
  let demoIsRecording = false;

  const btnDemoRecord = document.getElementById("btn-demo-record");
  const demoStatusText = document.getElementById("demo-status-text");
  const demoResultBox = document.getElementById("demo-result-box");
  const demoResultContent = document.getElementById("demo-result-content");
  const demoWaveformBars = document.querySelectorAll("#demo-visualizer .mvs-waveform-bar");

  function arreterEnregistrementDemo(annuler = false) {
    demoIsRecording = false;
    if (demoAudioInterval) {
      clearInterval(demoAudioInterval);
      demoAudioInterval = null;
    }
    if (demoMediaRecorder && demoMediaRecorder.state !== "inactive") {
      try {
        demoMediaRecorder.stop();
      } catch {}
    }
    if (demoAudioStream) {
      demoAudioStream.getTracks().forEach((track) => track.stop());
      demoAudioStream = null;
    }
    if (demoAudioCtx && demoAudioCtx.state !== "closed") {
      demoAudioCtx.close().catch(() => {});
      demoAudioCtx = null;
    }
    demoWaveformBars.forEach((bar) => {
      bar.style.height = "6px";
    });
    demoAudioChunks = [];

    if (btnDemoRecord) {
      btnDemoRecord.disabled = false;
      btnDemoRecord.classList.remove("mvs-btn-secondary");
      btnDemoRecord.classList.add("mvs-btn-primary");
      definirContenuBoutonMicro(btnDemoRecord, "🎙️", t("btnDemoRecord") || "Lire la phrase à voix haute");
    }

    if (annuler && demoStatusText) {
      demoStatusText.textContent = t("demoStatusIdle") || "Cliquez sur « Lire la phrase » et parlez à voix haute.";
    }
  }

  let demoDemarrageEnCours = false;
  async function demarrerEnregistrementDemo() {
    if (demoDemarrageEnCours) return;
    if (demoIsRecording) {
      // Deuxième clic = arrêt de l'enregistrement et lancement du nettoyage sémantique
      if (demoStatusText) {
        demoStatusText.textContent = t("demoStatusProcessing") || "Nettoyage sémantique en cours… ✨";
      }
      if (btnDemoRecord) {
        btnDemoRecord.disabled = true;
        definirContenuBoutonMicro(btnDemoRecord, "⏳", "Traitement IA en cours…");
      }

      demoIsRecording = false;
      if (demoAudioInterval) {
        clearInterval(demoAudioInterval);
        demoAudioInterval = null;
      }
      demoWaveformBars.forEach((bar) => {
        bar.style.height = "6px";
      });

      if (demoMediaRecorder && demoMediaRecorder.state === "recording") {
        demoMediaRecorder.addEventListener("stop", async () => {
          await traiterAudioDemo();
        }, { once: true });
        try {
          demoMediaRecorder.stop();
        } catch {
          await traiterAudioDemo();
        }
      } else {
        await traiterAudioDemo();
      }
      return;
    }

    demoDemarrageEnCours = true;
    // Réinitialisation de la zone de résultat
    if (demoResultBox) demoResultBox.classList.add("mvs-hidden");
    if (demoResultContent) demoResultContent.textContent = "";
    demoAudioChunks = [];

    try {
      demoAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      demoAudioCtx = new AudioCtxClass();
      if (demoAudioCtx.state === "suspended") {
        await demoAudioCtx.resume();
      }

      const sourceNode = demoAudioCtx.createMediaStreamSource(demoAudioStream);
      demoAudioAnalyser = demoAudioCtx.createAnalyser();
      demoAudioAnalyser.fftSize = 64;
      sourceNode.connect(demoAudioAnalyser);

      const freqData = new Uint8Array(demoAudioAnalyser.frequencyBinCount);

      // Animation réactive des 5 barres pendant l'élocution
      demoAudioInterval = setInterval(() => {
        if (!demoAudioAnalyser) return;
        demoAudioAnalyser.getByteFrequencyData(freqData);
        let total = 0;
        for (let i = 0; i < freqData.length; i++) total += freqData[i];
        const moyenne = total / freqData.length;

        demoWaveformBars.forEach((bar, idx) => {
          const val = freqData[idx * 2] || moyenne;
          const h = Math.max(6, Math.min(42, Math.round((val / 255) * 44)));
          bar.style.height = `${h}px`;
        });
      }, 70);

      // Initialisation du MediaRecorder
      let mime = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mime = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mime = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          mime = "audio/ogg;codecs=opus";
        }
      }

      demoMediaRecorder = new MediaRecorder(demoAudioStream, { mimeType: mime });
      demoMediaRecorder.onerror = (e) => {
        if (DEBUG) console.warn("[Setup] Erreur MediaRecorder démo :", e);
        arreterEnregistrementDemo(true);
      };
      demoMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          demoAudioChunks.push(e.data);
        }
      };
      demoMediaRecorder.start(250);

      demoIsRecording = true;
      if (btnDemoRecord) {
        btnDemoRecord.classList.remove("mvs-btn-primary");
        btnDemoRecord.classList.add("mvs-btn-secondary");
        definirContenuBoutonMicro(btnDemoRecord, "⏹️", t("btnDemoStop") || "Arrêter et voir le résultat");
      }
      if (demoStatusText) {
        demoStatusText.textContent = t("demoStatusRecording") || "Enregistrement en cours… Lisez la phrase à voix haute.";
      }
    } catch (errDemoMic) {
      if (DEBUG) console.warn("[Setup] Erreur micro démo :", errDemoMic);
      arreterEnregistrementDemo(true);
      if (demoStatusText) {
        demoStatusText.textContent = "Impossible d'accéder au micro. Veuillez vérifier vos autorisations à l'étape 1.";
      }
    } finally {
      demoDemarrageEnCours = false;
    }
  }

  async function traiterAudioDemo() {
    if (demoAudioStream) {
      demoAudioStream.getTracks().forEach((track) => track.stop());
      demoAudioStream = null;
    }
    if (demoAudioCtx && demoAudioCtx.state !== "closed") {
      demoAudioCtx.close().catch(() => {});
      demoAudioCtx = null;
    }

    const mime = (demoMediaRecorder && demoMediaRecorder.mimeType) || "audio/webm";
    const blobFinal = new Blob(demoAudioChunks, { type: mime });

    if (blobFinal.size < 200) {
      demoAudioChunks = [];
      if (demoStatusText) {
        demoStatusText.textContent = "Aucun son suffisant capté. Réessayez en parlant bien distinctement.";
      }
      if (btnDemoRecord) {
        btnDemoRecord.disabled = false;
        definirContenuBoutonMicro(btnDemoRecord, "🎙️", t("btnDemoRecord") || "Lire la phrase à voix haute");
        btnDemoRecord.classList.remove("mvs-btn-secondary");
        btnDemoRecord.classList.add("mvs-btn-primary");
      }
      return;
    }

    try {
      const base64Audio = await blobVersBase64(blobFinal);
      const modeRadio = document.querySelector('input[name="setup-voice-mode"]:checked');
      const voiceMode = modeRadio ? modeRadio.value : "natural";
      const configDemo = construireConfigActive("gemini-3.5-transcribe");

      let resultat;
      if (globalThis.MVSProviders) {
        resultat = await globalThis.MVSProviders.transcrire(
          configDemo,
          base64Audio,
          blobFinal.type || "audio/webm",
          voiceMode
        );
      }

      // Si l'utilisateur a changé d'étape pendant la requête réseau, ne pas altérer le DOM masqué
      if (etapeCourante !== 4) return;

      if (resultat && resultat.text && resultat.text.trim()) {
        if (demoResultContent) {
          demoResultContent.textContent = resultat.text.trim();
        }
        if (demoResultBox) {
          demoResultBox.classList.remove("mvs-hidden");
        }
        if (demoStatusText) {
          demoStatusText.textContent = "Transcription et nettoyage sémantique réussis ✓";
        }
      } else {
        if (demoStatusText) {
          demoStatusText.textContent = "Le moteur n'a retourné aucun texte. Vérifiez votre clé API à l'étape 2.";
        }
      }
    } catch (errTranscription) {
      if (DEBUG) console.warn("[Setup] Erreur transcription démo :", errTranscription);
      if (etapeCourante === 4 && demoStatusText) {
        const msg = errTranscription && errTranscription.message ? errTranscription.message : "Erreur réseau";
        demoStatusText.textContent = `Échec de transcription : ${msg}. Vérifiez votre clé d'API.`;
      }
    } finally {
      demoAudioChunks = [];
      if (btnDemoRecord) {
        btnDemoRecord.disabled = false;
        definirContenuBoutonMicro(btnDemoRecord, "🎙️", t("btnDemoRecord") || "Lire la phrase à voix haute");
        btnDemoRecord.classList.remove("mvs-btn-secondary");
        btnDemoRecord.classList.add("mvs-btn-primary");
      }
    }
  }

  if (btnDemoRecord) {
    btnDemoRecord.addEventListener("click", demarrerEnregistrementDemo);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. ÉTAPE 5 : FINALISATION & SAUVEGARDE GLOBALE
  // ═════════════════════════════════════════════════════════════════════════

  const btnFinish = document.getElementById("btn-finish-setup");
  if (btnFinish) {
    btnFinish.addEventListener("click", async () => {
      btnFinish.disabled = true;
      btnFinish.textContent = "Enregistrement en cours…";

      const modeRadio = document.querySelector('input[name="setup-voice-mode"]:checked');
      const voiceMode = modeRadio ? modeRadio.value : "natural";

      const configSauvegarde = {
        ...construireConfigActive("gemini-3.5-transcribe-live"),
        defaultVoiceMode: voiceMode,
        lastVoiceMode: voiceMode,
        voiceModePolicy: "default"
      };

      try {
        await api.storage.local.set(configSauvegarde);
        btnFinish.textContent = "Configuration enregistrée ✓";

        // Fermer l'onglet après 800 ms
        setTimeout(async () => {
          try {
            if (api && api.tabs && typeof api.tabs.getCurrent === "function") {
              const ongletActuel = await api.tabs.getCurrent();
              if (ongletActuel && ongletActuel.id) {
                await api.tabs.remove(ongletActuel.id);
                return;
              }
            }
          } catch {
            /* Fallback window.close */
          }
          window.close();
        }, 800);
      } catch (errSave) {
        btnFinish.disabled = false;
        btnFinish.textContent = "Erreur lors de la sauvegarde";
        if (DEBUG) console.error("[Setup] Erreur de sauvegarde :", errSave);
      }
    });
  }
});
