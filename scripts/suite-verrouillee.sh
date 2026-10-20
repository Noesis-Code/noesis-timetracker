#!/usr/bin/env bash
# Lance la suite complète (node test/run-tests.js) sous verrou fichier : une seule suite à la fois sur la machine.
# Verrou : /tmp/tmt-suite.lock (hors dépôt). Attente max 25 min, exécution max 25 min. Libéré à la sortie, même sur kill du script.
# Usage : scripts/suite-verrouillee.sh [args de run-tests.js]
set -uo pipefail
LOCK="${TMT_SUITE_LOCK:-/tmp/tmt-suite.lock}"
MAX="${TMT_SUITE_MAX_S:-1500}"
cd "$(dirname "$0")/.."
exec 9>>"$LOCK"
if ! flock -n 9; then
  echo "[suite] une autre suite tourne ($(cat "$LOCK" 2>/dev/null | tr '\n' ' ')) : attente max ${MAX}s…" >&2
  flock -w "$MAX" 9 || { echo "[suite] ERREUR : verrou non obtenu après ${MAX}s ; relancer plus tard (ne pas pousser sans suite verte)." >&2; exit 75; }
fi
echo "pid=$$ depuis=$(date +%H:%M:%S) dossier=$PWD" > "$LOCK"
echo "[suite] verrou obtenu, lancement." >&2
# Le fils n'hérite pas du descripteur 9 : le verrou ne vit que tant que ce script vit.
timeout -k 10 "$MAX" node test/run-tests.js "$@" 9>&- &
child=$!
trap 'kill -TERM "$child" 2>/dev/null; wait "$child" 2>/dev/null; exit 143' TERM INT HUP
wait "$child"; rc=$?
[ "$rc" = 124 ] && echo "[suite] ERREUR : suite interrompue après ${MAX}s." >&2
exit "$rc"
