#!/usr/bin/env bash
# Crée un chantier isolé : worktree + branche claude/<sujet> depuis origin/staging à jour,
# node_modules lié, PORT libre et NOESIS_DATA_DIR temporaire propres au chantier.
# Usage : scripts/new-worktree.sh <sujet>      (depuis n'importe quel worktree du dépôt)
# Variable : NM_SOURCE=<dossier node_modules> pour choisir la source (défaut : celui du worktree courant).
set -euo pipefail
export TMPDIR="${TMPDIR:-/tmp}"  # jamais vide : évite les redirections \$TMPDIR/x vers /x
sujet="${1:?usage: new-worktree.sh <sujet>}"
[[ "$sujet" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "sujet : minuscules, chiffres, tirets" >&2; exit 1; }
top="$(git rev-parse --show-toplevel)"
dest="$(dirname "$top")/wt-$sujet"
[ -e "$dest" ] && { echo "existe déjà : $dest" >&2; exit 1; }
git fetch origin staging >/dev/null 2>&1
git worktree add "$dest" -b "claude/$sujet" FETCH_HEAD >/dev/null
nm="${NM_SOURCE:-$top/node_modules}"
[ -d "$nm" ] && ln -s "$nm" "$dest/node_modules"
# Dépendances propres à Trade Tracker (@simplewebauthn/server) : lien vers celles du worktree courant (sinon : cd trade-tracker && npm ci)
tnm=""
for c in "$top" "$(dirname "$(git rev-parse --git-common-dir)")" "$(dirname "$top")"/wt-*; do [ -d "$c/trade-tracker/node_modules" ] && { tnm="$c/trade-tracker/node_modules"; break; }; done
[ -n "$tnm" ] && ln -s "$tnm" "$dest/trade-tracker/node_modules" || echo "Avertissement : trade-tracker/node_modules absent, lancer 'cd trade-tracker && npm ci' (tests Trade)" >&2
# Vérifie que chaque dépendance résout ; sinon le node_modules lié est périmé : lien retiré et npm ci local.
ensure_deps() {
  local d="$1"
  [ -f "$d/package.json" ] || return 0
  if ! (cd "$d" && node -e "const p=require('./package.json');for(const k of Object.keys(p.dependencies||{}))require.resolve(k+'/package.json',{paths:[process.cwd()]})" 2>/dev/null \
       || node -e "const p=require('./package.json');for(const k of Object.keys(p.dependencies||{}))require.resolve(k,{paths:[process.cwd()]})" 2>/dev/null); then
    echo "Dépendances de $d périmées ou absentes : npm ci local" >&2
    [ -L "$d/node_modules" ] && rm "$d/node_modules"
    (cd "$d" && npm ci --no-audit --no-fund >/dev/null 2>&1) || echo "Avertissement : npm ci a échoué dans $d" >&2
  fi
}
ensure_deps "$dest"
ensure_deps "$dest/trade-tracker"
# Port libre : premier non utilisé à partir de 3900 et non déjà attribué à un autre chantier
port=3900
while (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || grep -qs "PORT=$port\$" "$(dirname "$top")"/wt-*/.chantier.env 2>/dev/null; do port=$((port+1)); done
data="$(mktemp -d -t "noesis-$sujet-XXXXXX")"
printf 'PORT=%s\nNOESIS_DATA_DIR=%s\n' "$port" "$data" > "$dest/.chantier.env"
grep -qxF '.chantier.env' "$(git rev-parse --git-common-dir)/info/exclude" 2>/dev/null || echo '.chantier.env' >> "$(git rev-parse --git-common-dir)/info/exclude"
echo "Worktree : $dest   Branche : claude/$sujet"
echo "Env      : cd $dest && set -a && . ./.chantier.env && set +a   (PORT=$port, données $data)"
echo "Rappel   : jamais git stash (commit WIP) ; node scripts/bump-sw.js après le rebase si public/ change."
