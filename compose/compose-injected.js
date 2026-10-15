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
  let timestampDerniereFrappeTexte = 0;
  let demarrageEnCours = false;

  // Éléments de transcription en direct dans le corps du mail (gemini-3.5-transcribe-live)
  let conteneurTexteLiveEl = null;
  let spanValideLiveEl = null;
  let spanInterimLiveEl = null;
  let prefixeEspaceLive = "";

  // Références DOM à l'intérieur du Shadow Root
  let hoteShadow = null;
  let racineShadow = null;
  let conteneurFlottant = null;
  let zoneStatutA11y = null;
  let zoneAlerteA11y = null;
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

  /**
   * Vocalise un message d'état accessible pour les lecteurs d'écran (B3).
   * @param {string} message
   */
  function annoncerA11y(message) {
    if (!zoneStatutA11y || !message) return;
    zoneStatutA11y.textContent = "";
    setTimeout(() => {
      if (zoneStatutA11y) zoneStatutA11y.textContent = message;
    }, 50);
  }

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
    const defaut = { left: 24, right: 24, top: 20, bottom: 40, height: 20 };
    try {
      // Si un flux live est en cours d'écriture, on se cale juste après le span live
      if (conteneurTexteLiveEl && document.body && document.body.contains(conteneurTexteLiveEl)) {
        const rectsLive = conteneurTexteLiveEl.getClientRects();
        if (rectsLive && rectsLive.length > 0) {
          const dernier = rectsLive[rectsLive.length - 1];
          if (dernier.width > 0 || dernier.height > 0) {
            return {
              left: dernier.left,
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
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            height: r.height || 18
          };
        }
      }

      // Repli en lecture seule sur ligne vide sans jamais muter l'arbre DOM (M8)
      const elementParent = clone.startContainer.nodeType === Node.ELEMENT_NODE
        ? clone.startContainer
        : clone.startContainer.parentElement;

      if (elementParent && typeof elementParent.getBoundingClientRect === "function") {
        const rParent = elementParent.getBoundingClientRect();
        if (rParent && (rParent.top > 0 || rParent.left > 0 || rParent.height > 0)) {
          const styleParent = window.getComputedStyle(elementParent);
          const padLeft = parseFloat(styleParent.paddingLeft) || 0;
          const lineH = parseFloat(styleParent.lineHeight) || 18;
          return {
            left: rParent.left + padLeft,
            right: rParent.left + padLeft,
            top: rParent.top,
            bottom: rParent.top + lineH,
            height: lineH
          };
        }
      }
    } catch {
      /* Ignorer */
    }
    return defaut;
  }

  /**
   * Positionne le widget sous le curseur (Goutte Vocale en veille, ou pilule déployée en enregistrement),
   * tout en garantissant qu'il ne sorte jamais des limites visibles de la fenêtre.
   */
  function positionnerPresDuCurseur() {
    if (!conteneurFlottant) return;

    const rectCurseur = obtenirRectangleCurseur();
    const rectWidget = conteneurFlottant.getBoundingClientRect();
    const estEnVeille = etatCourant === "IDLE_FLOATING";
    const largeurW = rectWidget.width || (estEnVeille ? 14 : 210);
    const hauteurW = rectWidget.height || (estEnVeille ? 14 : 38);

    const largeurFenetre = window.innerWidth || document.documentElement.clientWidth || 800;
    const hauteurFenetre = window.innerHeight || document.documentElement.clientHeight || 600;

    const refX = rectCurseur.left !== undefined ? rectCurseur.left : rectCurseur.right;
    let gauche = 0;
    let haut = 0;

    if (estEnVeille) {
      // 💧 Goutte Vocale (14 px) : suspendue 2 px sous le curseur, alignée sur le trait vertical
      gauche = refX - 2;
      haut = rectCurseur.bottom + 2;

      // Si débordement en bas de fenêtre, bascule au-dessus de la ligne
      if (haut + hauteurW > hauteurFenetre - 6) {
        haut = Math.max(6, rectCurseur.top - hauteurW - 2);
      }
    } else {
      // 🎙️ Pilule active déployée (210 px) : sous le flux de dictée live
      gauche = refX - 8;
      haut = rectCurseur.bottom + 4;

      // Si débordement à droite, aligner à droite
      if (gauche + largeurW > largeurFenetre - 12) {
        gauche = Math.max(12, largeurFenetre - largeurW - 12);
      }
      // Si débordement en bas, passer au-dessus
      if (haut + hauteurW > hauteurFenetre - 8) {
        haut = Math.max(6, rectCurseur.top - hauteurW - 6);
      }
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
    hoteShadow.style.pointerEvents = "none";
    (document.documentElement || document.body).appendChild(hoteShadow);

    racineShadow = hoteShadow.attachShadow({ mode: "closed" });

    // Règle anti-vol de focus Linux GTK : toute tentative d'amener le focus dans le Shadow DOM est renvoyée à l'éditeur
    racineShadow.addEventListener("focusin", () => {
      if (document.body && typeof document.body.focus === "function") {
        document.body.focus();
      }
    });

    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host {
        all: initial;
        pointer-events: none !important;
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
        pointer-events: none !important;
        transition: left 0.10s cubic-bezier(0.22, 1, 0.36, 1),
                    top 0.10s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .mvs-red-wave-btn,
      .mvs-mode-btn,
      .mvs-mini-btn,
      .mvs-onboarding-btn {
        pointer-events: auto !important;
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
      /* ── Le Petit Bouton Rond avec les 5 Ondes Vocales Blanches (ou Icône Micro en Veille) ── */
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
        transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity 0.20s ease,
                    background 0.2s ease,
                    box-shadow 0.2s ease,
                    width 0.18s ease,
                    height 0.18s ease;
        flex-shrink: 0;
      }
      /* En état de veille permanente sous le curseur : Goutte Vocale (14x14 px) avec liseré de marque (M11) */
      .mvs-red-wave-btn.state-idle {
        width: 14px;
        height: 14px;
        opacity: 0.90;
        background: linear-gradient(135deg, #f97316 0%, #ea6512 100%);
        border: 1.5px solid #85270b;
        box-shadow: 0 2px 6px rgba(133, 39, 11, 0.40);
      }
      /* Hitbox magnétique invisible de 28x28 px pour un clic sans effort (Loi de Fitts) */
      .mvs-red-wave-btn.state-idle::before {
        content: "";
        position: absolute;
        top: -7px;
        left: -7px;
        right: -7px;
        bottom: -7px;
        border-radius: 50%;
        background: transparent;
      }
      /* Micro-zoom au survol (20x20 px) avec halo lumineux */
      .mvs-red-wave-btn.state-idle:hover {
        width: 20px;
        height: 20px;
        opacity: 1;
        box-shadow: 0 0 12px rgba(249, 115, 22, 0.70), 0 2px 8px rgba(239, 68, 68, 0.50);
      }
      /* Ghost Mode : atténuation discrète pendant la frappe active au clavier */
      .mvs-floating-root.is-typing .mvs-red-wave-btn.state-idle {
        opacity: 0.20;
        transform: scale(0.90);
      }
      .mvs-floating-root.is-typing .mvs-red-wave-btn.state-idle:hover {
        opacity: 1 !important;
        transform: scale(1.05) !important;
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
      /* Icône SVG miniature du microphone en veille */
      .mvs-idle-mic-icon {
        display: none;
        width: 8px;
        height: 8px;
        pointer-events: none;
        transition: width 0.15s ease, height 0.15s ease;
      }
      .mvs-red-wave-btn.state-idle .mvs-idle-mic-icon {
        display: block;
      }
      .mvs-red-wave-btn.state-idle:hover .mvs-idle-mic-icon {
        width: 10px;
        height: 10px;
      }
      /* Masquer les 5 barres d'ondes en veille */
      .mvs-red-wave-btn.state-idle .mvs-wave-bar {
        display: none !important;
      }
      /* Les 5 barres verticales blanches à l'intérieur du bouton (GPU scaleY - P2.1) */
      .mvs-wave-bar {
        width: 2.4px;
        height: 18px;
        border-radius: 999px;
        background: #ffffff;
        transform: scaleY(0.25);
        transform-origin: bottom center;
        will-change: transform;
        transition: transform 0.06s ease-out, opacity 0.15s ease;
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
      /* Visibilité du focus clavier WCAG 2.1 AA */
      button:focus-visible,
      .mvs-red-wave-btn:focus-visible,
      .mvs-mode-btn:focus-visible,
      .mvs-mini-btn:focus-visible,
      .mvs-onboarding-btn:focus-visible {
        outline: 2px solid #ea6512 !important;
        outline-offset: 2px !important;
      }
      /* Masquage visuel accessible aux lecteurs d'écran (B3) */
      .mvs-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      /* Respect de prefers-reduced-motion (M13) */
      @media (prefers-reduced-motion: reduce) {
        .mvs-floating-root,
        .mvs-wave-bar,
        .mvs-red-wave-btn,
        .mvs-mini-btn,
        .mvs-mode-btn {
          transition: none !important;
          animation: none !important;
        }
      }
    `;

    conteneurFlottant = document.createElement("div");
    conteneurFlottant.className = "mvs-floating-root";
    conteneurFlottant.setAttribute("role", "region");
    conteneurFlottant.setAttribute("aria-label", t("composeActionLabel"));

    zoneStatutA11y = document.createElement("div");
    zoneStatutA11y.className = "mvs-sr-only";
    zoneStatutA11y.setAttribute("role", "status");
    zoneStatutA11y.setAttribute("aria-live", "polite");
    conteneurFlottant.appendChild(zoneStatutA11y);

    zoneAlerteA11y = document.createElement("div");
    zoneAlerteA11y.className = "mvs-sr-only";
    zoneAlerteA11y.setAttribute("role", "alert");
    conteneurFlottant.appendChild(zoneAlerteA11y);

    // ⚠️ RÈGLE CRITIQUE : Empêcher toute perte du focus / curseur lors d'un clic sur le widget !
    conteneurFlottant.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    conteneurFlottant.addEventListener("mouseenter", () => {
      reinitialiserAttenuatonFrappe();
    });

    // ── 1. Capsule flottante (Veille compacte ou Enregistrement déployé) ──────
    vueCapsule = document.createElement("div");
    vueCapsule.className = "mvs-pill mvs-pill-idle";

    // Bouton principal rond avec micro SVG en veille et 5 barres verticales blanches en enregistrement
    btnOndeRouge = document.createElement("button");
    btnOndeRouge.type = "button";
    btnOndeRouge.tabIndex = -1;
    btnOndeRouge.setAttribute("tabindex", "-1");
    btnOndeRouge.className = "mvs-red-wave-btn state-idle";
    btnOndeRouge.setAttribute("title", t("composeActionTitle"));
    btnOndeRouge.setAttribute("aria-label", t("composeActionLabel"));

    // Micro-icône SVG miniature pour la Goutte Vocale en veille (Règle 11 : Zéro innerHTML)
    const nsSvg = "http://www.w3.org/2000/svg";
    const svgMic = document.createElementNS(nsSvg, "svg");
    svgMic.setAttribute("class", "mvs-idle-mic-icon");
    svgMic.setAttribute("viewBox", "0 0 24 24");
    svgMic.setAttribute("fill", "none");
    svgMic.setAttribute("stroke", "#ffffff");
    svgMic.setAttribute("stroke-width", "2.8");
    svgMic.setAttribute("stroke-linecap", "round");
    svgMic.setAttribute("stroke-linejoin", "round");

    const pathCapsule = document.createElementNS(nsSvg, "path");
    pathCapsule.setAttribute("d", "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z");
    svgMic.appendChild(pathCapsule);

    const pathArc = document.createElementNS(nsSvg, "path");
    pathArc.setAttribute("d", "M19 10v2a7 7 0 0 1-14 0v-2");
    svgMic.appendChild(pathArc);

    const lignePied = document.createElementNS(nsSvg, "line");
    lignePied.setAttribute("x1", "12");
    lignePied.setAttribute("y1", "19");
    lignePied.setAttribute("x2", "12");
    lignePied.setAttribute("y2", "22");
    svgMic.appendChild(lignePied);

    btnOndeRouge.appendChild(svgMic);

    const hauteursRepos = [0.28, 0.50, 0.72, 0.50, 0.28];
    barresBlanchesEls = [];
    for (let i = 0; i < 5; i++) {
      const barre = document.createElement("span");
      barre.className = "mvs-wave-bar";
      barre.style.transform = `scaleY(${hauteursRepos[i]})`;
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

    // Compteur temporel (00:00) — masqué au lecteur d'écran (B3)
    timerEl = document.createElement("span");
    timerEl.className = "mvs-timer";
    timerEl.textContent = "00:00";
    timerEl.setAttribute("aria-hidden", "true");
    timerEl.style.display = "none";

    // Texte court d'état (affiché pendant la réflexion ou en cas d'erreur)
    statutCourtEl = document.createElement("span");
    statutCourtEl.className = "mvs-status-short";
    statutCourtEl.style.display = "none";

    // Sélecteur de Mode Morphing à 3 états (🎙️ / 👔 / 📋 — affiché uniquement pour OpenAI/Local)
    btnModeMorphing = document.createElement("button");
    btnModeMorphing.type = "button";
    btnModeMorphing.tabIndex = -1;
    btnModeMorphing.setAttribute("tabindex", "-1");
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
    btnPause.tabIndex = -1;
    btnPause.setAttribute("tabindex", "-1");
    btnPause.className = "mvs-mini-btn";
    btnPause.textContent = "⏸";
    btnPause.style.display = "none";
    btnPause.setAttribute("aria-pressed", "false");
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
    btnAnnuler.tabIndex = -1;
    btnAnnuler.setAttribute("tabindex", "-1");
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
    btnActionOnboardingEl.tabIndex = -1;
    btnActionOnboardingEl.setAttribute("tabindex", "-1");
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
    btnFermerOnboarding.tabIndex = -1;
    btnFermerOnboarding.setAttribute("tabindex", "-1");
    btnFermerOnboarding.className = "mvs-mini-btn";
    btnFermerOnboarding.textContent = "✕";
    btnFermerOnboarding.setAttribute("aria-label", t("btnCancelLabel"));
    btnFermerOnboarding.setAttribute("title", t("btnCancelLabel"));
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
      const facteurEchelle = Math.max(0.18, Math.min(1.0, hauteursBarres[i]));
      if (barresBlanchesEls[i]) {
        barresBlanchesEls[i].style.transform = `scaleY(${facteurEchelle.toFixed(3)})`;
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

  let ticksChrono = 0;

  function demarrerChrono() {
    arreterChrono();
    secondesEcoulees = 0;
    ticksChrono = 0;
    actualiserChronoUI();

    idIntervalleChrono = setInterval(() => {
      ticksChrono += 1;

      // Garde-fou MV3 : émettre un keepAlive toutes les 4 secondes (y compris en PAUSE)
      // pour empêcher Gecko de suspendre l'Event Page après 30s d'inactivité
      if (ticksChrono % 4 === 0) {
        api.runtime.sendMessage({ action: "keepAliveAudioSession" }).catch(() => {});
      }

      if (etatCourant !== "RECORDING") return;
      secondesEcoulees += 1;
      actualiserChronoUI();

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
    if (demarrageEnCours || etatCourant === "RECORDING" || etatCourant === "STARTING") return;
    demarrageEnCours = true;
    etatCourant = "STARTING";

    try {
      construireInterfaceShadowDom();
      restaurerPositionCurseur();
      reinitialiserAttenuatonFrappe();
      nettoyerConteneurLiveDOM();

      vueOnboarding.classList.add("mvs-hidden");
      vueCapsule.classList.remove("mvs-hidden", "mvs-pill-idle");

      btnOndeRouge.className = "mvs-red-wave-btn";
      btnOndeRouge.setAttribute("title", t("btnStopTitle"));
      btnOndeRouge.setAttribute("aria-label", t("btnStopLabel"));

      timerEl.style.display = "inline";
      statutCourtEl.style.display = "none";
      statutCourtEl.classList.remove("is-error");
      statutCourtEl.removeAttribute("title");
      btnPause.style.display = "inline-flex";
      btnPause.textContent = "⏸";
      btnPause.setAttribute("aria-pressed", "false");
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
          annoncerA11y(t("onboardingMessage"), true);
          return;
        }
        if (reponse && reponse.error === "MIC_PREF_REQUIRED") {
          etatCourant = "MIC_PREF_GUIDE";
          txtOnboardingEl.textContent = t("micPrefRequiredMessage");
          btnActionOnboardingEl.textContent = t("btnCopyMicPref");
          vueCapsule.classList.add("mvs-hidden");
          vueOnboarding.classList.remove("mvs-hidden");
          positionnerPresDuCurseur();
          annoncerA11y(t("micPrefRequiredMessage"), true);
          return;
        }
        afficherErreurDansCapsule((reponse && reponse.error) || "MIC_DENIED");
        return;
      }

      etatCourant = "RECORDING";
      annoncerA11y(t("statusRecording") || "Enregistrement en cours", false);
      ciblesBarres = [0.25, 0.45, 0.65, 0.45, 0.25];
      demarrerChrono();
      positionnerPresDuCurseur();

      if (!idBoucleAnimation) {
        idBoucleAnimation = requestAnimationFrame(animerBarresBouton);
      }
    } finally {
      demarrageEnCours = false;
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
          btnPause.setAttribute("aria-pressed", "true");
          annoncerA11y(t("statusPaused") || "Enregistrement en pause", false);
        } else {
          etatCourant = "RECORDING";
          btnOndeRouge.classList.remove("state-paused");
          btnPause.textContent = "⏸";
          btnPause.setAttribute("aria-pressed", "false");
          annoncerA11y(t("statusRecording") || "Reprise de l'enregistrement", false);
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
    statutCourtEl.removeAttribute("title");
    const msgPensee = t("statusThinking");
    statutCourtEl.textContent = msgPensee;
    annoncerA11y(msgPensee, false);
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
        const msgInsere = t("statusInserted");
        statutCourtEl.textContent = msgInsere;
        annoncerA11y(msgInsere, false);
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
    const msgInsere = t("statusInserted");
    statutCourtEl.textContent = msgInsere;
    annoncerA11y(msgInsere, false);
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
    const msgErreur = t(cle);

    vueOnboarding.classList.add("mvs-hidden");
    vueCapsule.classList.remove("mvs-hidden", "mvs-pill-idle");
    btnOndeRouge.className = "mvs-red-wave-btn state-paused";
    timerEl.style.display = "none";
    btnModeMorphing.style.display = "none";
    btnPause.style.display = "none";
    btnAnnuler.style.display = "inline-flex";
    statutCourtEl.style.display = "inline";
    statutCourtEl.classList.add("is-error");
    statutCourtEl.textContent = msgErreur;
    statutCourtEl.setAttribute("title", msgErreur);
    annoncerA11y(msgErreur, true);
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
    reinitialiserAttenuatonFrappe();
    etatCourant = "IDLE_FLOATING";

    if (idBoucleAnimation) {
      cancelAnimationFrame(idBoucleAnimation);
      idBoucleAnimation = null;
    }

    const facteursRepos = [0.28, 0.5, 0.72, 0.5, 0.28];
    for (let i = 0; i < 5; i++) {
      if (barresBlanchesEls[i]) {
        barresBlanchesEls[i].style.transform = `scaleY(${facteursRepos[i]})`;
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
    if (statutCourtEl) {
      statutCourtEl.style.display = "none";
      statutCourtEl.removeAttribute("title");
    }
    if (btnModeMorphing) btnModeMorphing.style.display = "none";
    if (btnPause) {
      btnPause.style.display = "none";
      btnPause.setAttribute("aria-pressed", "false");
    }
    if (btnAnnuler) btnAnnuler.style.display = "none";

    restaurerPositionCurseur();
    positionnerPresDuCurseur();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. ÉCOUTEURS D'ÉVÉNEMENTS (SUIVI PERMANENT DU CURSEUR, CLAVIER & MESSAGES)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Ghost Mode : Atténuation automatique de la Goutte Vocale pendant la frappe ──
  let timerFinFrappe = null;

  function gererAttenuatonFrappe() {
    if (!conteneurFlottant || etatCourant !== "IDLE_FLOATING") return;
    conteneurFlottant.classList.add("is-typing");
    if (timerFinFrappe) {
      clearTimeout(timerFinFrappe);
    }
    timerFinFrappe = setTimeout(() => {
      if (conteneurFlottant) {
        conteneurFlottant.classList.remove("is-typing");
      }
      timerFinFrappe = null;
    }, 1000);
  }

  function reinitialiserAttenuatonFrappe() {
    if (timerFinFrappe) {
      clearTimeout(timerFinFrappe);
      timerFinFrappe = null;
    }
    if (conteneurFlottant) {
      conteneurFlottant.classList.remove("is-typing");
    }
  }

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

  document.addEventListener("input", () => {
    timestampDerniereFrappeTexte = Date.now();
    planifierPositionnementCurseur();
    gererAttenuatonFrappe();
  });

  document.addEventListener("keyup", (e) => {
    planifierPositionnementCurseur();
    if (e && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
      reinitialiserAttenuatonFrappe();
    }
  });

  document.addEventListener("mouseup", () => {
    planifierPositionnementCurseur();
    reinitialiserAttenuatonFrappe();
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

  // Raccourcis clavier (Alt+Shift+S / ⌘⇧S / Alt+Shift+D, Espace : Pause, Entrée : Insérer, Échap : Annuler)
  window.addEventListener(
    "keydown",
    (e) => {
      // ⚠️ RÈGLE ABSOLUE : Ne JAMAIS intercepter les raccourcis d'envoi Thunderbird (Ctrl+Entrée, Cmd+Entrée, Alt+Entrée) !
      if ((e.key === "Enter" || e.code === "Enter") && (e.ctrlKey || e.metaKey || e.altKey)) {
        return;
      }

      const estToucheDeclenchement =
        e.shiftKey &&
        (e.altKey || e.metaKey) &&
        (e.code === "KeyS" || e.key === "s" || e.key === "S" || e.code === "KeyD" || e.key === "d" || e.key === "D");

      if (estToucheDeclenchement) {
        e.preventDefault();
        e.stopPropagation();
        basculerActivationWidget();
        return;
      }

      if (etatCourant === "IDLE_FLOATING") {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key && e.key.length === 1) {
          gererAttenuatonFrappe();
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        annulerSessionEtReplier();
        return;
      }

      if (etatCourant === "RECORDING" || etatCourant === "PAUSED") {
        // Mode clavier hybride : si l'utilisateur est en train de taper du texte (< 1.5s),
        // on ne capture pas Space ou Enter pour ne pas bloquer sa saisie manuelle dans l'e-mail.
        const saisieEnCours = Date.now() - timestampDerniereFrappeTexte < 1500;

        if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (!saisieEnCours) {
            e.preventDefault();
            e.stopPropagation();
            basculerPauseReprise();
          }
        } else if ((e.key === "Enter" || e.code === "Enter") && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (!saisieEnCours) {
            e.preventDefault();
            e.stopPropagation();
            arreterEtInsererTexte();
          }
        }
      }
    },
    false
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
    api.runtime.onMessage.addListener((message, expediteur, sendResponse) => {
      // Filtrer les messages externes : accepter uniquement l'extension elle-même
      if (expediteur && expediteur.id && expediteur.id !== api.runtime.id) {
        return false;
      }

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
