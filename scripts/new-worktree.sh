#!/usr/bin/env bash
# Crée un chantier isolé : worktree + branche claude/<sujet> depuis origin/staging à jour,
# node_modules lié, PORT libre et NOESIS_DATA_DIR temporaire propres au chantier.
# Usage : scripts/new-worktree.sh <sujet>      (depuis n'importe quel worktree du dépôt)
# Variable : NM_SOURCE=<dossier node_modules> pour choisir la source (défaut : celui du worktree courant).
set -euo pipefail
sujet="${1:?usage: new-worktree.sh <sujet>}"
[[ "$sujet" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "sujet : minuscules, chiffres, tirets" >&2; exit 1; }
top="$(git rev-parse --show-toplevel)"
dest="$(dirname "$top")/wt-$sujet"
[ -e "$dest" ] && { echo "existe déjà : $dest" >&2; exit 1; }
git fetch origin staging >/dev/null 2>&1
git worktree add "$dest" -b "claude/$sujet" FETCH_HEAD >/dev/null
nm="${NM_SOURCE:-$top/node_modules}"
[ -d "$nm" ] && ln -s "$nm" "$dest/node_modules"
# Port libre : premier non utilisé à partir de 3900 et non déjà attribué à un autre chantier
port=3900
while (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || grep -qs "PORT=$port\$" "$(dirname "$top")"/wt-*/.chantier.env 2>/dev/null; do port=$((port+1)); done
data="$(mktemp -d -t "noesis-$sujet-XXXXXX")"
printf 'PORT=%s\nNOESIS_DATA_DIR=%s\n' "$port" "$data" > "$dest/.chantier.env"
grep -qxF '.chantier.env' "$(git rev-parse --git-common-dir)/info/exclude" 2>/dev/null || echo '.chantier.env' >> "$(git rev-parse --git-common-dir)/info/exclude"
echo "Worktree : $dest   Branche : claude/$sujet"
echo "Env      : cd $dest && set -a && . ./.chantier.env && set +a   (PORT=$port, données $data)"
echo "Rappel   : jamais git stash (commit WIP) ; node scripts/bump-sw.js après le rebase si public/ change."
