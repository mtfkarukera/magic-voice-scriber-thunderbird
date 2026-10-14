/**
 * Magic Voice Scriber — Bouton Flottant Permanent & Pilule à Ondes Vocales près du Curseur
 * ════════════════════════════════════════════════════════════════════════════════════════
 *
 * S'exécute directement dans l'éditeur de rédaction de Thunderbird 128+ / 157+
 * via un Shadow DOM isolé (attaché à document.documentElement pour ne jamais
 * polluer le corps HTML du courriel envoyé).
 *
 * Caractéristiques :
 *   1. Bouton d'enregistrement rond flottant EN PERMANENCE à 10 px à droite du curseur (IDLE_FLOATING)
 *   2. Déploiement sur place en 1 clic vers la pilule complète (5 barres blanches animées, chrono, pause)
 *   3. Affichage des mots EN DIRECT au fur et à mesure de la parole (gemini-3.5-transcribe-live)
 *   4. Sélecteur de Mode à 3 états (🎙️ / 👔 / 📋) réservé aux moteurs OpenAI/Tiers & Local (masqué pour Gemini SMART)
 *   5. Zéro perte de curseur (mousedown -> e.preventDefault()) et aide 1-clic pour la préférence micro Thunderbird
 *
 * Auteur : MTF Karukera
 */

"use strict";

const DEBUG = false;

(function initialiserWidgetFlottantMVS() {
  // Garde d'idempotence : éviter toute double initialisation dans le même éditeur
  if (window.__MVS_CARET_WIDGET_LOADED__) {
    return;
  }
  window.__MVS_CARET_WIDGET_LOADED__ = true;

  const api = globalThis.browser || globalThis.messenger;
  const DUREE_OPTIMALE_MAX_SEC = 300; // 5 minutes par segment optimal
  const ORDRE_MODES_VOIX = ["natural", "pro", "bullets"];

  const META_MODES_VOIX = {
    natural: { icone: "🎙️", cleLabel: "modeNaturalLabel", cleDesc: "modeNaturalDesc", codeCouleur: "#a78bfa" },
    pro: { icone: "👔", cleLabel: "modeProLabel", cleDesc: "modeProDesc", codeCouleur: "#38bdf8" },
    bullets: { icone: "📋", cleLabel: "modeBulletsLabel", cleDesc: "modeBulletsDesc", codeCouleur: "#34d399" }
  };

  // ── État interne du widget flottant ───────────────────────────────────────
  // "IDLE_FLOATING" | "ONBOARDING" | "MIC_PREF_GUIDE" | "RECORDING" | "PAUSED" | "THINKING" | "DONE" | "ERROR"
  let etatCourant = "IDLE_FLOATING";
  let fournisseurActif = "gemini";
  let modeVoixActif = "natural";
  let secondesEcoulees = 0;
  let idIntervalleChrono = null;
  let idBoucleAnimation = null;
  let phaseOnde = 0;
  let ciblesBarres = [0.22, 0.35, 0.5, 0.35, 0.22];
  let hauteursBarres = [0.22, 0.35, 0.5, 0.35, 0.22];
  let dernierRangeCurseur = null;

  // Éléments de transcription en direct dans le corps du mail (gemini-3.5-transcribe-live)
  let conteneurTexteLiveEl = null;
  let spanValideLiveEl = null;
  let spanInterimLiveEl = null;
  let prefixeEspaceLive = "";

  // Références DOM à l'intérieur du Shadow Root
  let hoteShadow = null;
  let racineShadow = null;
  let conteneurFlottant = null;
  let vueCapsule = null;
  let vueOnboarding = null;
  let txtOnboardingEl = null;
  let btnActionOnboardingEl = null;
  let btnOndeRouge = null;
  let barresBlanchesEls = [];
  let timerEl = null;
  let statutCourtEl = null;
  let btnModeMorphing = null;
  let iconeModeEl = null;
  let labelModeEl = null;
  let btnPause = null;
  let btnAnnuler = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. INTERNATIONALISATION (i18n — Zéro texte codé en dur)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère une chaîne traduite depuis _locales/<lang>/messages.json.
   * @param {string} cle
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
   * Formate un nombre de secondes en MM:SS.
   * @param {number} sec
   * @returns {string}
   */
  function formaterDuree(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. GESTION DU CURSEUR (CARET) & POSITIONNEMENT PERMANENT À 10 PX
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sauvegarde la position actuelle du curseur dans l'éditeur de courriel.
   */
  function sauvegarderPositionCurseur() {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (document.body && document.body.contains(range.commonAncestorContainer)) {
          dernierRangeCurseur = range.cloneRange();
        }
      }
    } catch {
      /* Ignorer */
    }
  }

  /**
   * Restaure le focus et la position exacte du curseur dans l'éditeur de courriel.
   */
  function restaurerPositionCurseur() {
    try {
      const editeur = document.querySelector("body[contenteditable='true']") || document.body;
      if (editeur && typeof editeur.focus === "function") {
        editeur.focus({ preventScroll: true });
      }
      const sel = window.getSelection();
      if (!sel) return;

      if (sel.rangeCount > 0 && document.body && document.body.contains(sel.anchorNode)) {
        sauvegarderPositionCurseur();
        return;
      }

      if (dernierRangeCurseur) {
        sel.removeAllRanges();
        sel.addRange(dernierRangeCurseur);
      } else if (editeur) {
        const range = document.createRange();
        range.selectNodeContents(editeur);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        dernierRangeCurseur = range.cloneRange();
      }
    } catch {
      /* Ignorer */
    }
  }

  /**
   * Calcule le rectangle exact (en coordonnées viewport) du curseur de texte actif
   * (ou de la fin du texte en cours de dictée live).
   * @returns {{ right: number, top: number, bottom: number, height: number }}
   */
  function obtenirRectangleCurseur() {
    const defaut = { right: 24, top: 20, bottom: 40, height: 20 };
    try {
      // Si un flux live est en cours d'écriture, on se cale juste après le span live
      if (conteneurTexteLiveEl && document.body && document.body.contains(conteneurTexteLiveEl)) {
        const rectsLive = conteneurTexteLiveEl.getClientRects();
        if (rectsLive && rectsLive.length > 0) {
          const dernier = rectsLive[rectsLive.length - 1];
          if (dernier.width > 0 || dernier.height > 0) {
            return {
              right: dernier.right,
              top: dernier.top,
              bottom: dernier.bottom,
              height: dernier.height || 18
            };
          }
        }
      }

      const sel = window.getSelection();
      let range = null;
      if (sel && sel.rangeCount > 0) {
        range = sel.getRangeAt(0);
      } else if (dernierRangeCurseur) {
        range = dernierRangeCurseur;
      }
      if (!range) return defaut;

      const clone = range.cloneRange();
      clone.collapse(false);

      const rects = clone.getClientRects();
      if (rects && rects.length > 0) {
        const r = rects[rects.length - 1];
        if (r.top > 0 || r.left > 0 || r.height > 0) {
          return {
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            height: r.height || 18
          };
        }
      }

      // Repli sur ligne vide : insertion furtive d'un marqueur sans jamais muter la sélection active
      if (document.body && document.body.contains(clone.startContainer)) {
        const sonde = document.createElement("span");
        sonde.textContent = "\u200b";
        clone.insertNode(sonde);
        const rectSonde = sonde.getBoundingClientRect();
        const parentSonde = sonde.parentNode;
        sonde.remove();
        if (parentSonde) {
          parentSonde.normalize();
        }
        if (rectSonde && (rectSonde.top > 0 || rectSonde.left > 0)) {
          return {
            right: rectSonde.right,
            top: rectSonde.top,
            bottom: rectSonde.bottom,
            height: rectSonde.height || 18
          };
        }
      }
    } catch {
      /* Ignorer */
    }
    return defaut;
  }

  /**
   * Positionne le bouton flottant à 10 px à droite du curseur,
   * tout en garantissant qu'il ne sorte jamais des limites visibles de la fenêtre.
   */
  function positionnerPresDuCurseur() {
    if (!conteneurFlottant) return;

    const rectCurseur = obtenirRectangleCurseur();
    const rectWidget = conteneurFlottant.getBoundingClientRect();
    const largeurW = rectWidget.width || (etatCourant === "IDLE_FLOATING" ? 30 : 210);
    const hauteurW = rectWidget.height || (etatCourant === "IDLE_FLOATING" ? 30 : 38);

    const largeurFenetre = window.innerWidth || document.documentElement.clientWidth || 800;
    const hauteurFenetre = window.innerHeight || document.documentElement.clientHeight || 600;

    // Décalage de 10 px (quelques millimètres) à droite du curseur, centré verticalement sur la ligne
    let gauche = rectCurseur.right + 10;
    let haut = rectCurseur.top + rectCurseur.height / 2 - hauteurW / 2;

    // Si le curseur est trop près du bord droit, on place le widget juste en dessous de la ligne
    if (gauche + largeurW > largeurFenetre - 12) {
      gauche = Math.max(12, largeurFenetre - largeurW - 12);
      haut = rectCurseur.bottom + 6;
    }

    gauche = Math.max(8, Math.min(gauche, largeurFenetre - largeurW - 8));
    haut = Math.max(6, Math.min(haut, hauteurFenetre - hauteurW - 6));

    conteneurFlottant.style.left = `${Math.round(gauche)}px`;
    conteneurFlottant.style.top = `${Math.round(haut)}px`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CONSTRUCTION DU SHADOW DOM (ZÉRO INNERHTML — RÈGLE 11)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construit l'hôte Shadow DOM et l'interface du bouton flottant permanent.
   */
  function construireInterfaceShadowDom() {
    if (hoteShadow && racineShadow) return;

    hoteShadow = document.createElement("div");
    hoteShadow.id = "mvs-caret-floating-host";
    (document.documentElement || document.body).appendChild(hoteShadow);

    racineShadow = hoteShadow.attachShadow({ mode: "open" });

    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host {
        all: initial;
      }
      .mvs-floating-root {
        position: fixed;
        left: 28px;
        top: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        color: #f8fafc;
        user-select: none;
        -webkit-user-select: none;
        transition: left 0.10s cubic-bezier(0.22, 1, 0.36, 1),
                    top 0.10s cubic-bezier(0.22, 1, 0.36, 1);
      }
      /* ── Capsule principale (Mode Actif vs Mode Veille Compact) ── */
      .mvs-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px 4px 4px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.90);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(148, 163, 184, 0.28);
        box-shadow: 0 8px 24px rgba(2, 6, 23, 0.45),
                    0 0 0 1px rgba(255, 255, 255, 0.06) inset;
        transition: padding 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      /* En veille permanente à côté du curseur : uniquement le petit bouton rond discret */
      .mvs-pill.mvs-pill-idle {
        padding: 0;
        gap: 0;
        background: transparent;
        border-color: transparent;
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .mvs-pill.mvs-hidden {
        display: none !important;
      }
      /* ── Le Petit Bouton Rond avec les 5 Ondes Vocales Blanches ── */
      .mvs-red-wave-btn {
        position: relative;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: none;
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 2.3px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        box-shadow: 0 2px 10px rgba(239, 68, 68, 0.55);
        transition: transform 0.14s ease, opacity 0.16s ease, background 0.2s ease, box-shadow 0.2s ease, width 0.15s ease, height 0.15s ease;
        flex-shrink: 0;
      }
      /* En état de veille permanente près du curseur : compact (26x26 px) et légèrement discret */
      .mvs-red-wave-btn.state-idle {
        width: 26px;
        height: 26px;
        opacity: 0.78;
        background: linear-gradient(135deg, #f97316 0%, #ef4444 100%);
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.38);
      }
      .mvs-red-wave-btn.state-idle:hover {
        opacity: 1;
        transform: scale(1.10);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.60);
      }
      .mvs-red-wave-btn:hover {
        transform: scale(1.06);
      }
      .mvs-red-wave-btn:active {
        transform: scale(0.94);
      }
      /* État En Pause : Ambre chaleureux */
      .mvs-red-wave-btn.state-paused {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        box-shadow: 0 2px 10px rgba(245, 158, 11, 0.45);
      }
      /* État Réflexion IA : Violet-Indigo Magique */
      .mvs-red-wave-btn.state-thinking {
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        box-shadow: 0 2px 12px rgba(99, 102, 241, 0.65);
        cursor: wait;
      }
      /* État Succès : Émeraude */
      .mvs-red-wave-btn.state-done {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        box-shadow: 0 2px 10px rgba(16, 185, 129, 0.5);
      }
      /* Les 5 barres verticales blanches à l'intérieur du bouton */
      .mvs-wave-bar {
        width: 2.4px;
        height: 6px;
        border-radius: 999px;
        background: #ffffff;
        transition: height 0.05s ease-out, opacity 0.15s ease;
        pointer-events: none;
      }
      /* ── Chronomètre & Statut compact ── */
      .mvs-timer {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        font-size: 11.5px;
        color: #e2e8f0;
        padding: 0 3px;
        white-space: nowrap;
      }
      .mvs-timer.is-warning {
        color: #fbbf24;
      }
      .mvs-status-short {
        font-size: 11.5px;
        font-weight: 500;
        color: #cbd5e1;
        max-width: 210px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mvs-status-short.is-error {
        color: #fda4af;
      }
      /* ── Sélecteur de Mode Morphing à 3 états (🎙️ / 👔 / 📋 — uniquement hors Gemini) ── */
      .mvs-mode-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 8px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(30, 41, 59, 0.85);
        color: #f1f5f9;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.14s ease, border-color 0.15s ease;
        white-space: nowrap;
      }
      .mvs-mode-btn:hover {
        background: rgba(51, 65, 85, 0.95);
        border-color: rgba(167, 139, 250, 0.55);
      }
      .mvs-mode-btn.is-morphing {
        transform: scale(0.92);
      }
      /* ── Petits boutons icônes (Pause ⏸, Annuler ✕) ── */
      .mvs-mini-btn {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.08);
        color: #cbd5e1;
        font-size: 11px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .mvs-mini-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        color: #ffffff;
      }
      /* ── Carte d'accueil Onboarding / Aide Préférence Micro ── */
      .mvs-onboarding-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 295px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(14px);
        border: 1px solid rgba(249, 115, 22, 0.45);
        box-shadow: 0 10px 28px rgba(2, 6, 23, 0.55);
      }
      .mvs-onboarding-card.mvs-hidden {
        display: none !important;
      }
      .mvs-onboarding-text {
        margin: 0;
        font-size: 11.5px;
        line-height: 1.42;
        color: #e2e8f0;
      }
      .mvs-onboarding-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .mvs-onboarding-btn {
        flex: 1;
        height: 28px;
        border-radius: 8px;
        border: none;
        background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
        color: #ffffff;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        padding: 0 10px;
      }
    `;

    conteneurFlottant = document.createElement("div");
    conteneurFlottant.className = "mvs-floating-root";
    conteneurFlottant.setAttribute("role", "region");
    conteneurFlottant.setAttribute("aria-live", "polite");

    // ⚠️ RÈGLE CRITIQUE : Empêcher toute perte du focus / curseur lors d'un clic sur le widget !
    conteneurFlottant.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // ── 1. Capsule flottante (Veille compacte ou Enregistrement déployé) ──────
    vueCapsule = document.createElement("div");
    vueCapsule.className = "mvs-pill mvs-pill-idle";

    // Bouton principal rond avec les 5 barres verticales blanches (|┃|┃|)
    btnOndeRouge = document.createElement("button");
    btnOndeRouge.type = "button";
    btnOndeRouge.className = "mvs-red-wave-btn state-idle";
    btnOndeRouge.setAttribute("title", t("composeActionTitle"));
    btnOndeRouge.setAttribute("aria-label", t("composeActionTitle"));

    const hauteursRepos = [5, 9, 13, 9, 5];
    barresBlanchesEls = [];
    for (let i = 0; i < 5; i++) {
      const barre = document.createElement("span");
      barre.className = "mvs-wave-bar";
      barre.style.height = `${hauteursRepos[i]}px`;
      btnOndeRouge.appendChild(barre);
      barresBlanchesEls.push(barre);
    }

    btnOndeRouge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (etatCourant === "IDLE_FLOATING" || etatCourant === "ERROR") {
        demarrerSessionFlottante();
      } else if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
        arreterEtInsererTexte();
      }
    });

    // Compteur temporel (00:00)
    timerEl = document.createElement("span");
    timerEl.className = "mvs-timer";
    timerEl.textContent = "00:00";
    timerEl.style.display = "none";

    // Texte court d'état (affiché pendant la réflexion ou en cas d'erreur)
    statutCourtEl = document.createElement("span");
    statutCourtEl.className = "mvs-status-short";
    statutCourtEl.style.display = "none";

    // Sélecteur de Mode Morphing à 3 états (🎙️ / 👔 / 📋 — affiché uniquement pour OpenAI/Local)
    btnModeMorphing = document.createElement("button");
    btnModeMorphing.type = "button";
    btnModeMorphing.className = "mvs-mode-btn";
    btnModeMorphing.style.display = "none";

    iconeModeEl = document.createElement("span");
    labelModeEl = document.createElement("span");
    btnModeMorphing.appendChild(iconeModeEl);
    btnModeMorphing.appendChild(labelModeEl);

    btnModeMorphing.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      basculerModeVoixSuivant();
    });

    // Bouton Pause / Reprise (⏸ / ▶)
    btnPause = document.createElement("button");
    btnPause.type = "button";
    btnPause.className = "mvs-mini-btn";
    btnPause.textContent = "⏸";
    btnPause.style.display = "none";
    btnPause.setAttribute("title", t("btnPauseTitle"));
    btnPause.setAttribute("aria-label", t("btnPauseTitle"));
    btnPause.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      basculerPauseReprise();
    });

    // Bouton Annuler (✕)
    btnAnnuler = document.createElement("button");
    btnAnnuler.type = "button";
    btnAnnuler.className = "mvs-mini-btn";
    btnAnnuler.textContent = "✕";
    btnAnnuler.style.display = "none";
    btnAnnuler.setAttribute("title", t("btnCancelTitle"));
    btnAnnuler.setAttribute("aria-label", t("btnCancelLabel"));
    btnAnnuler.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      annulerSessionEtReplier();
    });

    vueCapsule.appendChild(btnOndeRouge);
    vueCapsule.appendChild(timerEl);
    vueCapsule.appendChild(statutCourtEl);
    vueCapsule.appendChild(btnModeMorphing);
    vueCapsule.appendChild(btnPause);
    vueCapsule.appendChild(btnAnnuler);

    // ── 2. Carte d'accueil Onboarding / Aide Préférence Micro ────────────────
    vueOnboarding = document.createElement("div");
    vueOnboarding.className = "mvs-onboarding-card mvs-hidden";

    txtOnboardingEl = document.createElement("p");
    txtOnboardingEl.className = "mvs-onboarding-text";
    txtOnboardingEl.textContent = t("onboardingMessage");

    const barreActionsOnboarding = document.createElement("div");
    barreActionsOnboarding.className = "mvs-onboarding-actions";

    btnActionOnboardingEl = document.createElement("button");
    btnActionOnboardingEl.type = "button";
    btnActionOnboardingEl.className = "mvs-onboarding-btn";
    btnActionOnboardingEl.textContent = t("btnOpenSettings");
    btnActionOnboardingEl.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (etatCourant === "MIC_PREF_GUIDE") {
        try {
          await navigator.clipboard.writeText("media.navigator.permission.disabled");
          btnActionOnboardingEl.textContent = t("btnCopyMicPrefCopied") || "Copié ✓";
        } catch {
          /* Ignorer */
        }
        return;
      }
      api.runtime.sendMessage({ action: "openOptions" }).catch(() => {});
      replierVersBoutonVeille();
    });

    const btnFermerOnboarding = document.createElement("button");
    btnFermerOnboarding.type = "button";
    btnFermerOnboarding.className = "mvs-mini-btn";
    btnFermerOnboarding.textContent = "✕";
    btnFermerOnboarding.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      replierVersBoutonVeille();
    });

    barreActionsOnboarding.appendChild(btnActionOnboardingEl);
    barreActionsOnboarding.appendChild(btnFermerOnboarding);
    vueOnboarding.appendChild(txtOnboardingEl);
    vueOnboarding.appendChild(barreActionsOnboarding);

    conteneurFlottant.appendChild(vueCapsule);
    conteneurFlottant.appendChild(vueOnboarding);

    racineShadow.appendChild(styleEl);
    racineShadow.appendChild(conteneurFlottant);

    appliquerVisuelModeVoix(modeVoixActif, false);
    positionnerPresDuCurseur();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ANIMATION DES 5 BARRES BLANCHES & SÉLECTEUR DE MODE MORPHING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Met à jour le bouton sélecteur de mode à 3 états (🎙️ Naturel, 👔 Pro, 📋 Synthèse).
   * @param {string} mode
   * @param {boolean} animer
   */
  function appliquerVisuelModeVoix(mode, animer = false) {
    modeVoixActif = ORDRE_MODES_VOIX.includes(mode) ? mode : "natural";
    const meta = META_MODES_VOIX[modeVoixActif] || META_MODES_VOIX.natural;

    if (!btnModeMorphing || !iconeModeEl || !labelModeEl) return;

    if (animer) {
      btnModeMorphing.classList.add("is-morphing");
      setTimeout(() => btnModeMorphing.classList.remove("is-morphing"), 140);
    }

    iconeModeEl.textContent = meta.icone;
    const texteLabel = t(meta.cleLabel);
    const texteDesc = t(meta.cleDesc);
    labelModeEl.textContent = texteLabel;
    labelModeEl.style.color = meta.codeCouleur;
    btnModeMorphing.setAttribute("title", `${texteLabel} — ${texteDesc}`);
    btnModeMorphing.setAttribute("aria-label", `${t("modeBtnAriaLabel")} (${texteLabel})`);
  }

  /**
   * Passe au mode de dictée suivant au clic et mémorise le choix (pour OpenAI/Local).
   */
  function basculerModeVoixSuivant() {
    const idx = ORDRE_MODES_VOIX.indexOf(modeVoixActif);
    const suivant = ORDRE_MODES_VOIX[(idx + 1) % ORDRE_MODES_VOIX.length];
    appliquerVisuelModeVoix(suivant, true);
    api.runtime.sendMessage({ action: "saveVoiceMode", voiceMode: suivant }).catch(() => {});
  }

  /**
   * Boucle d'animation 60 FPS des 5 barres verticales blanches à l'intérieur du bouton rouge.
   */
  function animerBarresBouton() {
    if (
      etatCourant !== "RECORDING" &&
      etatCourant !== "PAUSED" &&
      etatCourant !== "THINKING" &&
      etatCourant !== "DONE"
    ) {
      idBoucleAnimation = null;
      return;
    }

    phaseOnde += 0.16;

    for (let i = 0; i < 5; i++) {
      let cible = 0.25;

      if (etatCourant === "RECORDING") {
        // Interpolation vive vers les niveaux vocaux réels + oscillation organique
        const baseAudio = ciblesBarres[i] || 0.22;
        const profilOnde = 0.08 * Math.sin(phaseOnde * 1.5 + i * 1.05);
        cible = Math.min(1, Math.max(0.2, baseAudio + profilOnde));
      } else if (etatCourant === "PAUSED") {
        cible = 0.24;
      } else if (etatCourant === "THINKING") {
        cible = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(phaseOnde * 1.6 - i * 0.75));
      } else if (etatCourant === "DONE") {
        cible = 0.55;
      }

      hauteursBarres[i] += (cible - hauteursBarres[i]) * 0.38;
      const px = Math.round(4 + hauteursBarres[i] * 15); // Hauteur entre 4 px et 19 px
      if (barresBlanchesEls[i]) {
        barresBlanchesEls[i].style.height = `${px}px`;
      }
    }

    idBoucleAnimation = requestAnimationFrame(animerBarresBouton);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. AFFICHAGE EN DIRECT DES MOTS DICTÉS (GEMINI 3.5 TRANSCRIBE LIVE)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Crée ou met à jour en direct dans l'éditeur de mail les mots dictés au fil de l'eau.
   * @param {string} committedText - Segments validés et nettoyés par le mode SMART
   * @param {string} interimText - Mots provisoires en cours de prononciation
   */
  function actualiserTranscriptionEnDirectDOM(committedText, interimText) {
    const valide = (committedText || "").trim();
    const interim = (interimText || "").trim();
    if (!valide && !interim) return;

    try {
      // Création du conteneur live lors du tout premier mot reçu
      if (!conteneurTexteLiveEl || !document.body || !document.body.contains(conteneurTexteLiveEl)) {
        restaurerPositionCurseur();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        range.collapse(false);

        // Vérifier s'il faut insérer une espace séparatrice devant le bloc dicté
        prefixeEspaceLive = "";
        if (range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
          const texteNoeud = range.startContainer.nodeValue || "";
          const charPrecedent = texteNoeud.slice(Math.max(0, range.startOffset - 1), range.startOffset);
          const premierChar = (valide || interim).charAt(0);
          if (charPrecedent && !/\s/.test(charPrecedent) && !/^[,.;:!?]/.test(premierChar)) {
            prefixeEspaceLive = " ";
          }
        }

        conteneurTexteLiveEl = document.createElement("span");
        conteneurTexteLiveEl.setAttribute("data-mvs-live", "true");

        spanValideLiveEl = document.createElement("span");
        spanInterimLiveEl = document.createElement("span");
        spanInterimLiveEl.style.opacity = "0.62";
        spanInterimLiveEl.style.fontStyle = "italic";

        conteneurTexteLiveEl.appendChild(spanValideLiveEl);
        conteneurTexteLiveEl.appendChild(spanInterimLiveEl);

        range.insertNode(conteneurTexteLiveEl);
      }

      const sep = valide && interim && !/^[,.;:!?]/.test(interim) ? " " : "";
      spanValideLiveEl.textContent = valide ? `${prefixeEspaceLive}${valide}` : "";
      spanInterimLiveEl.textContent = interim
        ? `${valide ? sep : prefixeEspaceLive}${interim}`
        : "";

      // Placer le curseur juste après le conteneur live pour que la pilule suive la phrase
      const sel = window.getSelection();
      if (sel && conteneurTexteLiveEl.parentNode) {
        const nouveauRange = document.createRange();
        nouveauRange.setStartAfter(conteneurTexteLiveEl);
        nouveauRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nouveauRange);
        dernierRangeCurseur = nouveauRange.cloneRange();
      }

      positionnerPresDuCurseur();
    } catch (err) {
      if (DEBUG) console.warn("[MagicVoiceScriber] Erreur mise à jour live DOM :", err);
    }
  }

  /**
   * Supprime le conteneur de texte live temporaire (ex: lors d'une annulation ou avant remplacement final).
   */
  function nettoyerConteneurLiveDOM() {
    try {
      if (conteneurTexteLiveEl && conteneurTexteLiveEl.parentNode) {
        const parent = conteneurTexteLiveEl.parentNode;
        const rangeApres = document.createRange();
        rangeApres.setStartBefore(conteneurTexteLiveEl);
        rangeApres.collapse(true);
        conteneurTexteLiveEl.remove();
        parent.normalize();

        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(rangeApres);
          dernierRangeCurseur = rangeApres.cloneRange();
        }
      }
    } catch {
      /* Ignorer */
    }
    conteneurTexteLiveEl = null;
    spanValideLiveEl = null;
    spanInterimLiveEl = null;
    prefixeEspaceLive = "";
  }

  /**
   * Fige définitivement dans l'éditeur le texte dicté en direct en le transformant
   * en un nœud texte natif permanent (politique Zero Data Loss).
   * @returns {string} Le texte conservé et figé
   */
  function figerConteneurLiveDOM() {
    let texteConserve = "";
    try {
      if (conteneurTexteLiveEl && conteneurTexteLiveEl.parentNode) {
        texteConserve = (conteneurTexteLiveEl.textContent || "").trim();
        if (texteConserve) {
          const parent = conteneurTexteLiveEl.parentNode;
          const noeudTexte = document.createTextNode(
            prefixeEspaceLive ? `${prefixeEspaceLive}${texteConserve}` : texteConserve
          );
          parent.replaceChild(noeudTexte, conteneurTexteLiveEl);
          parent.normalize();

          const rangeApres = document.createRange();
          rangeApres.setStartAfter(noeudTexte);
          rangeApres.collapse(true);

          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(rangeApres);
            dernierRangeCurseur = rangeApres.cloneRange();
          }
        } else {
          nettoyerConteneurLiveDOM();
        }
      }
    } catch (err) {
      if (DEBUG) console.warn("[MagicVoiceScriber] Erreur figeage texte live :", err);
    } finally {
      conteneurTexteLiveEl = null;
      spanValideLiveEl = null;
      spanInterimLiveEl = null;
      prefixeEspaceLive = "";
    }
    return texteConserve;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. CYCLE DE DICTÉE (DÉPLOIEMENT SUR PLACE, PAUSE, FINALISATION & REPLI)
  // ═══════════════════════════════════════════════════════════════════════════

  function demarrerChrono() {
    arreterChrono();
    secondesEcoulees = 0;
    actualiserChronoUI();

    idIntervalleChrono = setInterval(() => {
      if (etatCourant !== "RECORDING") return;
      secondesEcoulees += 1;
      actualiserChronoUI();

      // Garde-fou MV3 : émettre un keepAlive toutes les 4 secondes pour empêcher Gecko de suspendre l'Event Page
      if (secondesEcoulees % 4 === 0) {
        api.runtime.sendMessage({ action: "keepAliveAudioSession" }).catch(() => {});
      }

      if (secondesEcoulees >= DUREE_OPTIMALE_MAX_SEC) {
        arreterEtInsererTexte();
      }
    }, 1000);
  }

  function arreterChrono() {
    if (idIntervalleChrono) {
      clearInterval(idIntervalleChrono);
      idIntervalleChrono = null;
    }
  }

  function actualiserChronoUI() {
    if (!timerEl) return;
    timerEl.textContent = formaterDuree(secondesEcoulees);
    if (secondesEcoulees >= 240) {
      timerEl.classList.add("is-warning");
    } else {
      timerEl.classList.remove("is-warning");
    }
  }

  /**
   * Déploie sur place le bouton flottant en pilule d'enregistrement et démarre l'écoute microphone.
   */
  async function demarrerSessionFlottante() {
    construireInterfaceShadowDom();
    restaurerPositionCurseur();
    nettoyerConteneurLiveDOM();

    vueOnboarding.classList.add("mvs-hidden");
    vueCapsule.classList.remove("mvs-hidden", "mvs-pill-idle");

    btnOndeRouge.className = "mvs-red-wave-btn";
    btnOndeRouge.setAttribute("title", t("btnStopTitle"));
    btnOndeRouge.setAttribute("aria-label", t("btnStopLabel"));

    timerEl.style.display = "inline";
    statutCourtEl.style.display = "none";
    statutCourtEl.classList.remove("is-error");
    btnPause.style.display = "inline-flex";
    btnPause.textContent = "⏸";
    btnAnnuler.style.display = "inline-flex";

    positionnerPresDuCurseur();

    let reponse;
    try {
      reponse = await api.runtime.sendMessage({ action: "startAudioSession" });
    } catch {
      reponse = { success: false, error: "SERVICE_UNAVAILABLE" };
    }

    if (reponse && reponse.provider) {
      fournisseurActif = reponse.provider;
    }
    if (reponse && reponse.activeVoiceMode) {
      appliquerVisuelModeVoix(reponse.activeVoiceMode, false);
    }

    // Les 3 modes (🎙️/👔/📋) ne sont affichés que pour les moteurs hors Gemini (OpenAI/Tiers & Local)
    if (fournisseurActif === "gemini") {
      btnModeMorphing.style.display = "none";
    } else {
      btnModeMorphing.style.display = "inline-flex";
    }

    if (!reponse || !reponse.success) {
      if (reponse && reponse.error === "NOT_CONFIGURED") {
        etatCourant = "ONBOARDING";
        txtOnboardingEl.textContent = t("onboardingMessage");
        btnActionOnboardingEl.textContent = t("btnOpenSettings");
        vueCapsule.classList.add("mvs-hidden");
        vueOnboarding.classList.remove("mvs-hidden");
        positionnerPresDuCurseur();
        return;
      }
      if (reponse && reponse.error === "MIC_PREF_REQUIRED") {
        etatCourant = "MIC_PREF_GUIDE";
        txtOnboardingEl.textContent = t("micPrefRequiredMessage");
        btnActionOnboardingEl.textContent = t("btnCopyMicPref");
        vueCapsule.classList.add("mvs-hidden");
        vueOnboarding.classList.remove("mvs-hidden");
        positionnerPresDuCurseur();
        return;
      }
      afficherErreurDansCapsule((reponse && reponse.error) || "MIC_DENIED");
      return;
    }

    etatCourant = "RECORDING";
    ciblesBarres = [0.25, 0.45, 0.65, 0.45, 0.25];
    demarrerChrono();
    positionnerPresDuCurseur();

    if (!idBoucleAnimation) {
      idBoucleAnimation = requestAnimationFrame(animerBarresBouton);
    }
  }

  /**
   * Met en pause ou reprend l'enregistrement (Touche Espace ou bouton ⏸).
   */
  async function basculerPauseReprise() {
    if (etatCourant !== "RECORDING" && etatCourant !== "PAUSED") return;
    try {
      const rep = await api.runtime.sendMessage({ action: "pauseResumeAudioSession" });
      if (rep && rep.success) {
        if (rep.state === "PAUSED") {
          etatCourant = "PAUSED";
          btnOndeRouge.classList.add("state-paused");
          btnPause.textContent = "▶";
        } else {
          etatCourant = "RECORDING";
          btnOndeRouge.classList.remove("state-paused");
          btnPause.textContent = "⏸";
        }
      }
    } catch {
      /* Ignorer */
    }
  }

  /**
   * Arrête l'enregistrement, finalise la transcription et insère le texte propre au curseur.
   */
  async function arreterEtInsererTexte() {
    if (etatCourant !== "RECORDING" && etatCourant !== "PAUSED") return;

    arreterChrono();
    etatCourant = "THINKING";

    btnOndeRouge.className = "mvs-red-wave-btn state-thinking";
    timerEl.style.display = "none";
    btnModeMorphing.style.display = "none";
    btnPause.style.display = "none";
    statutCourtEl.style.display = "inline";
    statutCourtEl.classList.remove("is-error");
    statutCourtEl.textContent = t("statusThinking");
    positionnerPresDuCurseur();

    // Mémorisation du texte en direct déjà présent dans l'éditeur (politique Zero Data Loss)
    const texteLiveAffiche =
      conteneurTexteLiveEl && conteneurTexteLiveEl.textContent
        ? conteneurTexteLiveEl.textContent.trim()
        : "";

    let reponse;
    try {
      reponse = await api.runtime.sendMessage({
        action: "stopAndTranscribeSession",
        voiceMode: modeVoixActif,
        lastKnownLiveText: texteLiveAffiche
      });
    } catch {
      reponse = { success: false, error: "SERVICE_UNAVAILABLE" };
    }

    if (!reponse || !reponse.success || !reponse.text) {
      // Si la réponse échoue mais que des mots avaient déjà été dictés et affichés en direct,
      // on CONSERVE et on FIGE ce texte sans jamais le détruire !
      if (texteLiveAffiche) {
        figerConteneurLiveDOM();
        etatCourant = "DONE";
        btnOndeRouge.className = "mvs-red-wave-btn state-done";
        statutCourtEl.textContent = t("statusInserted");
        positionnerPresDuCurseur();

        setTimeout(() => {
          replierVersBoutonVeille();
        }, 450);
        return;
      }

      nettoyerConteneurLiveDOM();
      afficherErreurDansCapsule((reponse && reponse.error) || "SERVICE_UNAVAILABLE");
      return;
    }

    // Si un conteneur live était affiché, on le retire juste avant d'insérer la version finale propre
    nettoyerConteneurLiveDOM();

    const succes = insererTextePropreAuCurseur(reponse.text);
    if (!succes) {
      afficherErreurDansCapsule("INSERT_FAILED");
      return;
    }

    // Confirmation brève puis repli fluide vers le petit bouton flottant permanent près du curseur
    etatCourant = "DONE";
    btnOndeRouge.className = "mvs-red-wave-btn state-done";
    statutCourtEl.textContent = t("statusInserted");
    positionnerPresDuCurseur();

    setTimeout(() => {
      replierVersBoutonVeille();
    }, 450);
  }

  /**
   * Insère chirurgicalement le texte nettoyé à la position du curseur dans l'éditeur,
   * en préservant la pile d'annulation native (Ctrl+Z / ⌘Z).
   * @param {string} textePropre
   * @returns {boolean}
   */
  function insererTextePropreAuCurseur(textePropre) {
    if (!textePropre) return false;
    try {
      restaurerPositionCurseur();

      let texteAInserer = textePropre;
      try {
        const sel = window.getSelection();
        if (sel && sel.anchorNode && sel.anchorNode.nodeType === Node.TEXT_NODE) {
          const texteNoeud = sel.anchorNode.nodeValue || "";
          const charPrecedent = texteNoeud.slice(Math.max(0, sel.anchorOffset - 1), sel.anchorOffset);
          if (charPrecedent && !/\s/.test(charPrecedent) && !/^[,.;:!?\n]/.test(texteAInserer)) {
            texteAInserer = " " + texteAInserer;
          }
        }
      } catch {
        /* Ignorer */
      }

      const succesExec = document.execCommand("insertText", false, texteAInserer);
      if (!succesExec) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();

          const fragment = document.createDocumentFragment();
          const lignes = texteAInserer.split("\n");
          lignes.forEach((ligne, idx) => {
            if (idx > 0) {
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

      sauvegarderPositionCurseur();
      return true;
    } catch (err) {
      if (DEBUG) console.error("[MagicVoiceScriber] Erreur insertion :", err);
      return false;
    }
  }

  /**
   * Affiche un message d'erreur explicite dans la capsule flottante.
   * @param {string} codeErreur
   */
  function afficherErreurDansCapsule(codeErreur) {
    arreterChrono();
    etatCourant = "ERROR";

    const correspondances = {
      MIC_DENIED: "errorMicPermission",
      NO_AUDIO: "errorNoAudio",
      EMPTY_RECORDING: "errorEmptyRecording",
      SESSION_LOST: "errorSessionLost",
      UNAUTHORIZED: "errorUnauthorized",
      RATE_LIMITED: "errorRateLimited",
      TIMEOUT: "errorTimeout",
      NETWORK: "errorNetwork",
      PERMISSION_REQUIRED: "statusPermissionRequired",
      INSERT_FAILED: "errorInsertFailed"
    };

    const cle = correspondances[codeErreur] || "errorServiceUnavailable";
    vueOnboarding.classList.add("mvs-hidden");
    vueCapsule.classList.remove("mvs-hidden", "mvs-pill-idle");
    btnOndeRouge.className = "mvs-red-wave-btn state-paused";
    timerEl.style.display = "none";
    btnModeMorphing.style.display = "none";
    btnPause.style.display = "none";
    btnAnnuler.style.display = "inline-flex";
    statutCourtEl.style.display = "inline";
    statutCourtEl.classList.add("is-error");
    statutCourtEl.textContent = t(cle);
    positionnerPresDuCurseur();
  }

  /**
   * Annule immédiatement l'enregistrement en cours et replie la pilule en petit bouton de veille.
   */
  function annulerSessionEtReplier() {
    arreterChrono();
    nettoyerConteneurLiveDOM();
    api.runtime.sendMessage({ action: "cancelAudioSession" }).catch(() => {});
    replierVersBoutonVeille();
  }

  /**
   * Replie la pilule vers l'état de veille permanent (petit bouton rond discret à 10 px du curseur).
   */
  function replierVersBoutonVeille() {
    arreterChrono();
    etatCourant = "IDLE_FLOATING";

    if (idBoucleAnimation) {
      cancelAnimationFrame(idBoucleAnimation);
      idBoucleAnimation = null;
    }

    const hauteursRepos = [5, 9, 13, 9, 5];
    for (let i = 0; i < 5; i++) {
      if (barresBlanchesEls[i]) {
        barresBlanchesEls[i].style.height = `${hauteursRepos[i]}px`;
      }
    }

    if (vueOnboarding) {
      vueOnboarding.classList.add("mvs-hidden");
    }
    if (vueCapsule) {
      vueCapsule.classList.remove("mvs-hidden");
      vueCapsule.classList.add("mvs-pill-idle");
    }
    if (btnOndeRouge) {
      btnOndeRouge.className = "mvs-red-wave-btn state-idle";
      btnOndeRouge.setAttribute("title", t("composeActionTitle"));
      btnOndeRouge.setAttribute("aria-label", t("composeActionTitle"));
    }
    if (timerEl) timerEl.style.display = "none";
    if (statutCourtEl) statutCourtEl.style.display = "none";
    if (btnModeMorphing) btnModeMorphing.style.display = "none";
    if (btnPause) btnPause.style.display = "none";
    if (btnAnnuler) btnAnnuler.style.display = "none";

    restaurerPositionCurseur();
    positionnerPresDuCurseur();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. ÉCOUTEURS D'ÉVÉNEMENTS (SUIVI PERMANENT DU CURSEUR, CLAVIER & MESSAGES)
  // ═══════════════════════════════════════════════════════════════════════════

  // Verrou anti-réentrance et étranglement 60 FPS pour éviter toute surchauffe CPU
  let estEnTrainDePositionner = false;
  let rafPositionnement = null;

  function planifierPositionnementCurseur() {
    if (rafPositionnement) return;
    rafPositionnement = requestAnimationFrame(() => {
      rafPositionnement = null;
      if (estEnTrainDePositionner) return;
      estEnTrainDePositionner = true;
      try {
        sauvegarderPositionCurseur();
        positionnerPresDuCurseur();
      } finally {
        estEnTrainDePositionner = false;
      }
    });
  }

  // Suivi en continu de la position du curseur dans l'éditeur (même au repos !)
  document.addEventListener("selectionchange", () => {
    if (estEnTrainDePositionner) return;
    planifierPositionnementCurseur();
  });

  document.addEventListener("keyup", () => {
    planifierPositionnementCurseur();
  });

  document.addEventListener("mouseup", () => {
    planifierPositionnementCurseur();
  });

  window.addEventListener("resize", () => {
    planifierPositionnementCurseur();
  });

  window.addEventListener(
    "scroll",
    () => {
      planifierPositionnementCurseur();
    },
    true
  );

  // Raccourcis clavier (Alt+Shift+S / ⌘⇧S, Espace : Pause, Entrée : Insérer, Échap : Annuler)
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.shiftKey && (e.altKey || e.metaKey) && (e.code === "KeyS" || e.key === "s" || e.key === "S")) {
        e.preventDefault();
        e.stopPropagation();
        basculerActivationWidget();
        return;
      }

      if (etatCourant === "IDLE_FLOATING") return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        annulerSessionEtReplier();
        return;
      }

      if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
        if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          basculerPauseReprise();
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          arreterEtInsererTexte();
        }
      }
    },
    true
  );

  /**
   * Bascule l'état du widget (Démarre l'enregistrement si en veille, Arrête et Insère si en cours).
   */
  function basculerActivationWidget() {
    if (
      etatCourant === "IDLE_FLOATING" ||
      etatCourant === "ERROR" ||
      etatCourant === "ONBOARDING" ||
      etatCourant === "MIC_PREF_GUIDE"
    ) {
      demarrerSessionFlottante();
    } else if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
      arreterEtInsererTexte();
    }
  }

  // Réception des messages depuis background.js (toggleVoicePill, updateVoiceBars, updateLiveTranscript)
  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((message, _expediteur, sendResponse) => {
      if (!message || typeof message.action !== "string") {
        return false;
      }

      if (message.action === "toggleVoicePill") {
        basculerActivationWidget();
        sendResponse({ success: true, state: etatCourant });
        return false;
      }

      if (message.action === "updateVoiceBars") {
        if (Array.isArray(message.bars) && message.bars.length === 5) {
          ciblesBarres = message.bars;
        }
        sendResponse({ success: true });
        return false;
      }

      if (message.action === "updateLiveTranscript") {
        if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
          actualiserTranscriptionEnDirectDOM(message.committedText, message.interimText);
        }
        sendResponse({ success: true });
        return false;
      }

      return false;
    });
  }

  // Initialisation immédiate du petit bouton flottant permanent dès l'ouverture du mail
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      construireInterfaceShadowDom();
      setTimeout(positionnerPresDuCurseur, 120);
    });
  } else {
    construireInterfaceShadowDom();
    setTimeout(positionnerPresDuCurseur, 120);
  }

  // Libération propre à la fermeture de la fenêtre de rédaction
  window.addEventListener("pagehide", () => {
    if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
      api.runtime.sendMessage({ action: "cancelAudioSession" }).catch(() => {});
    }
  });
})();
