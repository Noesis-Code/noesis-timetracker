#!/usr/bin/env bash
# Hook git local OPTIONNEL : refuse un push dont les commits touchent public/ sans que public/sw.js change CACHE_VERSION,
# ou dont le diff ajoute un marqueur de conflit hors docs/.
# Installation (facultative) : ln -sf ../../scripts/pre-push-sw.sh "$(git rev-parse --git-path hooks)/pre-push"
# Contournement ponctuel : git push --no-verify. Correction : node scripts/bump-sw.js puis commit.
set -u
Z=0000000000000000000000000000000000000000
cv() { git show "$1:public/sw.js" 2>/dev/null | grep -o "CACHE_VERSION *= *['\"][^'\"]*['\"]" | head -1; }
rc=0
while read -r lref lsha rref rsha; do
  [ "$lsha" = "$Z" ] && continue
  if [ "$rsha" = "$Z" ]; then base="$(git merge-base "$lsha" origin/staging 2>/dev/null || true)"; else base="$rsha"; fi
  [ -n "$base" ] || continue
  # Marqueur de conflit ajouté (hors docs/) : refus (incident f7e5583).
  if git diff "$base" "$lsha" -- . ':(exclude)docs' | grep -qE '^\+(<{7}|>{7})( |$)'; then
    echo "[pre-push-sw] marqueur de conflit (<<<<<<< ou >>>>>>>) dans le diff poussé : le résoudre avant de pousser." >&2
    rc=1
  fi
  git diff --quiet "$base" "$lsha" -- public/ && continue
  if [ "$(cv "$base")" = "$(cv "$lsha")" ]; then
    echo "[pre-push-sw] public/ modifié sans bump de CACHE_VERSION dans public/sw.js : lancer 'node scripts/bump-sw.js', committer, repousser." >&2
    rc=1
  fi
done
exit $rc
