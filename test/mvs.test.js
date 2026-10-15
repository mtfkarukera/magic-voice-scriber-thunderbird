/**
 * Magic Voice Scriber — Suite de Tests Unitaires et d'Intégrité
 * ═════════════════════════════════════════════════════════════
 *
 * Vérifie :
 *   1. L'orchestrateur MVSProviders (Gemini 3.5 Transcribe REST/Live SMART, OpenAI/Mistral, Local Ollama/Whisper)
 *   2. Les 3 modes de voix (natural, pro, bullets) et le nettoyage des réponses
 *   3. La parité stricte des 6 locales (en, fr, es, pt, de, vi) et la couverture de tous les attributs data-i18n*
 *   4. La conformité de sécurité (Zéro innerHTML, eval, alert, DEBUG = true)
 */

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("../mvs-providers.js");
const MVSProviders = globalThis.MVSProviders;

const RACINE = path.resolve(__dirname, "..");

describe("1. MVSProviders — Utilitaires & Modes de Voix", () => {
  it("expose les 3 modes de voix (natural, pro, bullets) et génère des prompts distincts", () => {
    const pNatural = MVSProviders.construirePromptSysteme("natural");
    const pPro = MVSProviders.construirePromptSysteme("pro");
    const pBullets = MVSProviders.construirePromptSysteme("bullets");

    assert.ok(pNatural.includes("exact vocabulary"));
    assert.ok(pPro.includes("professional email"));
    assert.ok(pBullets.includes("bulleted list"));
  });

  it("nettoie les blocs markdown et guillemets parasites dans nettoyerReponseLLM", () => {
    assert.equal(MVSProviders.nettoyerReponseLLM("```text\nBonjour à tous.\n```"), "Bonjour à tous.");
    assert.equal(MVSProviders.nettoyerReponseLLM('"Rendez-vous demain à 14h."'), "Rendez-vous demain à 14h.");
    assert.equal(MVSProviders.nettoyerReponseLLM("« Texte propre »"), "Texte propre");
  });

  it("normalise correctement les endpoints STT et Chat OpenAI", () => {
    assert.equal(
      MVSProviders.construireEndpointSTT("https://api.openai.com"),
      "https://api.openai.com/v1/audio/transcriptions"
    );
    assert.equal(
      MVSProviders.construireEndpointSTT("http://localhost:8000/v1/"),
      "http://localhost:8000/v1/audio/transcriptions"
    );
    assert.equal(
      MVSProviders.construireEndpointChat("https://api.mistral.ai"),
      "https://api.mistral.ai/v1/chat/completions"
    );
    assert.equal(
      MVSProviders.construireEndpointChat("http://localhost:11434/v1"),
      "http://localhost:11434/v1/chat/completions"
    );
  });

  it("calcule des patterns d'origine WebExtension valides sans numéro de port", () => {
    assert.equal(
      MVSProviders.obtenirPatternOrigine("gemini"),
      "https://generativelanguage.googleapis.com/*"
    );
    assert.equal(
      MVSProviders.obtenirPatternOrigine("openai", { openaiPreset: "mistral" }),
      "https://api.mistral.ai/*"
    );
    assert.equal(
      MVSProviders.obtenirPatternOrigine("local", { localLlmUrl: "http://localhost:11434" }),
      "http://localhost/*"
    );
  });

  it("construit la configuration WebSocket Gemini 3.5 Transcribe Live (v1beta) en mode SMART sans systemInstruction", () => {
    const urlWs = MVSProviders.obtenirUrlWebSocketGeminiLive("CLE_TEST");
    assert.ok(urlWs.startsWith("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta."));
    assert.ok(urlWs.includes("key=CLE_TEST"));

    const setup = MVSProviders.construireSetupGeminiLive();
    assert.equal(setup.setup.model, "models/gemini-3.5-transcribe-live");
    assert.equal(setup.setup.inputAudioTranscription.mode, "SMART");
    assert.equal(setup.setup.realtimeInputConfig.automaticActivityDetection.disabled, true);
    assert.equal(setup.setup.systemInstruction, undefined);
  });

  it("concatène proprement les segments de dictée en direct dans assemblerSegmentsLive", () => {
    assert.equal(MVSProviders.assemblerSegmentsLive("", "Bonjour"), "Bonjour");
    assert.equal(MVSProviders.assemblerSegmentsLive("Bonjour", ""), "Bonjour");
    assert.equal(
      MVSProviders.assemblerSegmentsLive("Bonjour", "tout le monde"),
      "Bonjour tout le monde"
    );
    assert.equal(
      MVSProviders.assemblerSegmentsLive("Bonjour", ", comment allez-vous ?"),
      "Bonjour, comment allez-vous ?"
    );
    assert.equal(
      MVSProviders.assemblerSegmentsLive("Test", ". Suite de phrase"),
      "Test. Suite de phrase"
    );
  });

  it("gère les retours cumulatifs et incrémentaux sans duplication dans fusionnerSegmentFinal", () => {
    // 1. Initialisation
    assert.equal(MVSProviders.fusionnerSegmentFinal("", "Bonjour Fred"), "Bonjour Fred");
    assert.equal(MVSProviders.fusionnerSegmentFinal("Bonjour Fred", ""), "Bonjour Fred");

    // 2. Mode cumulatif de l'API (le nouveau segment englobe le texte précédent)
    assert.equal(
      MVSProviders.fusionnerSegmentFinal("Bonjour", "Bonjour Fred, voici les documents."),
      "Bonjour Fred, voici les documents."
    );

    // 3. Écho tardif ou redite (le segment est déjà présent à la fin de la base)
    assert.equal(
      MVSProviders.fusionnerSegmentFinal("Bonjour Fred, voici les documents.", "documents."),
      "Bonjour Fred, voici les documents."
    );

    // 4. Incrémental pur avec espace ou ponctuation
    assert.equal(
      MVSProviders.fusionnerSegmentFinal("Bonjour Fred", "voici les documents."),
      "Bonjour Fred voici les documents."
    );
    assert.equal(
      MVSProviders.fusionnerSegmentFinal("Bonjour Fred", ", voici les documents."),
      "Bonjour Fred, voici les documents."
    );
  });
});

describe("2. MVSProviders — Pipelines Gemini, OpenAI/Mistral & Local (Mock Fetch)", () => {
  it("exécute le pipeline Gemini 3.5 Transcribe en une passe avec mode SMART (sans prompt texte ni temperature)", async () => {
    const fetchOriginal = globalThis.fetch;
    let urlAppelee = "";
    let optionsAppelees = null;
    let corpsEnvoye = null;

    globalThis.fetch = async (url, options) => {
      urlAppelee = url;
      optionsAppelees = options;
      corpsEnvoye = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [{ text: "Bonjour, voici le rapport final." }]
                }
              }
            ]
          };
        }
      };
    };

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "gemini",
          geminiApiKey: "AIzaTestKey",
          geminiModel: "gemini-3.5-transcribe"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/webm",
        "natural"
      );

      assert.equal(res.success, true);
      assert.equal(res.text, "Bonjour, voici le rapport final.");
      assert.ok(urlAppelee.includes("models/gemini-3.5-transcribe:generateContent"));
      assert.ok(urlAppelee.includes("?key=AIzaTestKey"), "Le paramètre key de secours doit être présent dans l'URL");
      assert.equal(optionsAppelees.headers["x-goog-api-key"], "AIzaTestKey", "x-goog-api-key doit être dans les headers");
      assert.equal(corpsEnvoye.generationConfig.audioTranscriptionConfig.mode, "SMART");
      assert.equal(corpsEnvoye.generationConfig.temperature, undefined);
      assert.equal(corpsEnvoye.contents[0].parts.length, 1);
      assert.ok(corpsEnvoye.contents[0].parts[0].inlineData);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("calcule les patterns d'origines multiples et protège contre les fuites de clés cross-domain", () => {
    const patternsMistral = MVSProviders.obtenirPatternsOrigines("openai", { openaiPreset: "mistral" });
    assert.deepEqual(patternsMistral.sort(), [
      "https://api.groq.com/*",
      "https://api.mistral.ai/*"
    ]);

    // Si origines différentes (ex: Groq STT + Mistral LLM), les 2 clés sont requises
    const configIncomplete = {
      provider: "openai",
      openaiPreset: "mistral",
      llmBaseUrl: "https://api.mistral.ai",
      llmApiKey: "mistral-secret-key",
      sttBaseUrl: "https://api.groq.com",
      sttApiKey: ""
    };
    assert.equal(MVSProviders.estConfigure(configIncomplete), false);

    const configComplete = {
      ...configIncomplete,
      sttApiKey: "groq-secret-key"
    };
    assert.equal(MVSProviders.estConfigure(configComplete), true);
  });

  it("parse correctement le format ASR dédié de gemini-3.5-transcribe (part.audioTranscription.text)", async () => {
    const fetchOriginal = globalThis.fetch;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    audioTranscription: {
                      text: "Bonjour, ceci est un test de dictée vocale."
                    }
                  }
                ],
                role: "model"
              },
              finishReason: "STOP",
              index: 0
            }
          ]
        };
      }
    });

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "gemini",
          geminiApiKey: "AIzaTestKey",
          geminiModel: "gemini-3.5-transcribe"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/wav",
        "natural"
      );

      assert.equal(res.success, true);
      assert.equal(res.text, "Bonjour, ceci est un test de dictée vocale.");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("gère gracieusement le silence sans jeter de fausse erreur SERVICE_UNAVAILABLE (finishReason STOP sans content)", async () => {
    const fetchOriginal = globalThis.fetch;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              finishReason: "STOP",
              index: 0
            }
          ]
        };
      }
    });

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "gemini",
          geminiApiKey: "AIzaTestKey",
          geminiModel: "gemini-3.5-transcribe"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/wav",
        "natural"
      );

      assert.equal(res.success, true);
      assert.equal(res.text, "");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("teste avec succès la connexion Gemini (testerConnexion) avec double authentification", async () => {
    const fetchOriginal = globalThis.fetch;
    let urlTestee = "";
    let headersTestes = null;

    globalThis.fetch = async (url, opts) => {
      urlTestee = url;
      headersTestes = opts && opts.headers;
      return { ok: true, status: 200 };
    };

    try {
      const res = await MVSProviders.testerConnexion({
        provider: "gemini",
        geminiApiKey: "AIzaTestKeyValid"
      });

      assert.equal(res.success, true);
      assert.equal(res.message, "OK");
      assert.ok(urlTestee.includes("https://generativelanguage.googleapis.com/v1beta/models"));
      assert.ok(urlTestee.includes("?key=AIzaTestKeyValid"));
      assert.equal(headersTestes["x-goog-api-key"], "AIzaTestKeyValid");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("exécute le pipeline en 2 étapes (STT Whisper + LLM Mistral/OpenAI)", async () => {
    const fetchOriginal = globalThis.fetch;
    const appels = [];

    globalThis.fetch = async (url) => {
      appels.push(url);
      if (url.includes("/audio/transcriptions")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { text: "euh je veux envoyer trois non quatre pommes" };
          }
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: { content: "Je veux envoyer quatre pommes." }
              }
            ]
          };
        }
      };
    };

    try {
      const res = await MVSProviders.transcrire(
        {
          provider: "openai",
          openaiPreset: "mistral",
          sttBaseUrl: "https://api.groq.com/openai",
          sttApiKey: "gsk_test",
          sttModel: "whisper-large-v3-turbo",
          llmBaseUrl: "https://api.mistral.ai",
          llmApiKey: "mistral_test",
          llmModel: "mistral-small-latest"
        },
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "audio/webm",
        "pro"
      );

      assert.equal(res.success, true);
      assert.equal(res.text, "Je veux envoyer quatre pommes.");
      assert.equal(appels.length, 2);
      assert.ok(appels[0].includes("/audio/transcriptions"));
      assert.ok(appels[1].includes("/chat/completions"));
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});

describe("3. Internationalisation (Parité des 6 langues & Zéro texte en dur)", () => {
  const LOCALES = ["en", "fr", "es", "pt", "de", "vi"];

  it("possède exactement les mêmes clés dans les 6 locales et aucune chaîne vide", () => {
    const dicEn = JSON.parse(
      fs.readFileSync(path.join(RACINE, "_locales/en/messages.json"), "utf8")
    );
    const clesRef = Object.keys(dicEn).sort();
    assert.ok(clesRef.length >= 60, "Le dictionnaire de référence doit être complet");

    for (const code of LOCALES) {
      const chemin = path.join(RACINE, `_locales/${code}/messages.json`);
      assert.ok(fs.existsSync(chemin), `Fichier manquant pour la locale ${code}`);
      const dic = JSON.parse(fs.readFileSync(chemin, "utf8"));
      const cles = Object.keys(dic).sort();

      assert.deepEqual(cles, clesRef, `Parité des clés rompue dans la locale '${code}'`);

      for (const cle of cles) {
        assert.ok(
          dic[cle] && typeof dic[cle].message === "string" && dic[cle].message.trim().length > 0,
          `Message vide pour la clé '${cle}' dans la locale '${code}'`
        );
      }
    }
  });

  it("couvre tous les attributs data-i18n* utilisés dans options.html", () => {
    const dicEn = JSON.parse(
      fs.readFileSync(path.join(RACINE, "_locales/en/messages.json"), "utf8")
    );
    const fichiersHtml = [
      path.join(RACINE, "options/options.html"),
      path.join(RACINE, "setup/setup.html")
    ];

    const regexAttr = /data-i18n(?:-[a-z-]+)?="([^"]+)"/g;
    for (const fichier of fichiersHtml) {
      const contenu = fs.readFileSync(fichier, "utf8");
      let match;
      while ((match = regexAttr.exec(contenu)) !== null) {
        const cle = match[1];
        assert.ok(
          Object.prototype.hasOwnProperty.call(dicEn, cle),
          `Clé i18n '${cle}' référencée dans ${path.basename(fichier)} mais absente de messages.json`
        );
      }
    }
  });
});

describe("4. Sécurité DOM, CSP & Garde-fou DEBUG (Règles 11, 12, 14)", () => {
  const fichiersJs = [
    "background.js",
    "mvs-providers.js",
    "compose/compose-injected.js",
    "options/options.js",
    "setup/setup.js"
  ];

  it("n'utilise jamais innerHTML, outerHTML, insertAdjacentHTML, eval, alert, confirm ou prompt", () => {
    const patternsInterdits = [
      /\.\s*innerHTML\b/,
      /\.\s*outerHTML\b/,
      /\.\s*insertAdjacentHTML\b/,
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
      /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/
    ];

    for (const rel of fichiersJs) {
      const src = fs.readFileSync(path.join(RACINE, rel), "utf8");
      for (const regex of patternsInterdits) {
        assert.equal(
          regex.test(src),
          false,
          `Pattern interdit ${regex} détecté dans ${rel}`
        );
      }
    }
  });

  it("maintient DEBUG = false dans tous les scripts", () => {
    const regexDebugTrue = /(?:const|let|var)?\s*DEBUG\s*=\s*true/;
    for (const rel of fichiersJs) {
      const src = fs.readFileSync(path.join(RACINE, rel), "utf8");
      assert.equal(
        regexDebugTrue.test(src),
        false,
        `DEBUG = true détecté dans ${rel}`
      );
    }
  });
});
