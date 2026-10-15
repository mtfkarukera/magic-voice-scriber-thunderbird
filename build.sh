#!/usr/bin/env bash
#
# Magic Voice Scriber — Packaging reproductible du XPI (Thunderbird MV3)
# ══════════════════════════════════════════════════════════════════════
# Produit  dist/magic-voice-scriber-<VERSION>.xpi
# + lien   dist/magic-voice-scriber.xpi  → la dernière version
#
# Garde-fous de sécurité (user_global §6, §9, §12) :
#   1. Interrompt la compilation si DEBUG = true est détecté dans le code source.
#   2. Exclut strictement AGENTS.md, task.md et tout document interne.
#
# Usage :  bash build.sh   (ou : npm run build)

set -euo pipefail
cd "$(dirname "$0")"

NAME="magic-voice-scriber-thunderbird"
OUT_DIR="dist"

# ── 1. Lecture de la version depuis manifest.json (source unique de vérité) ──
VERSION=$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
if [ -z "${VERSION}" ]; then
  echo "❌ Impossible de lire la version dans manifest.json" >&2
  exit 1
fi
XPI="${OUT_DIR}/${NAME}-${VERSION}.xpi"

# ── 2. Fichiers runtime embarqués dans le XPI ───────────────────────────────
FILES=(
  manifest.json
  background.js
  mvs-providers.js
  compose
  setup
  options
  icons
  icon.png
  LICENSE
  _locales
)

# ── 3. Garde-fou Anti-Leak : interdire DEBUG = true en production ───────────
if grep -nE '(const|let|var)?[[:space:]]*DEBUG[[:space:]]*=[[:space:]]*true' background.js mvs-providers.js compose/compose-injected.js options/options.js setup/setup.js; then
  echo "❌ ABANDON : DEBUG = true détecté dans le code source. Repasser à false avant de packager." >&2
  exit 1
fi

# ── 4. Construction de l'archive .xpi dans dist/ ────────────────────────────
mkdir -p "${OUT_DIR}"
rm -f "${XPI}"
zip -r -FS "${XPI}" "${FILES[@]}" -x '*.DS_Store' 'AGENTS.md' 'task.md' 'tasks.md' 'submission_kit.md' >/dev/null
ln -sf "$(basename "${XPI}")" "${OUT_DIR}/${NAME}.xpi"

# ── 5. Récapitulatif ────────────────────────────────────────────────────────
echo "✅ Construit : ${XPI}"
echo "   Lien      : ${OUT_DIR}/${NAME}.xpi"
echo "   Contenu :"
unzip -l "${XPI}" | sed 's/^/     /'
