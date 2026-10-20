#!/usr/bin/env bash
# Contrôle de la première minute après un déploiement : curl seulement, GET uniquement, aucune écriture, aucun secret.
# Usage : scripts/smoke-staging.sh [URL]     (défaut http://localhost:${PORT:-3000} ; la production n'est JAMAIS un défaut)
# Sortie : une ligne ok/ECHEC par contrôle ; code 0 si tout passe, 1 sinon.
set -u
URL="${1:-http://localhost:${PORT:-3000}}"; URL="${URL%/}"
fail=0
ok() { echo "  ok    $1"; }
ko() { echo "  ECHEC $1"; fail=1; }
hdr() { curl -sS -m 20 -o /dev/null -D - "$@" 2>/dev/null | tr -d '\r'; }   # en-têtes seulement
code() { curl -sS -m 20 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null; }
echo "[smoke] $URL"
[ "$(code "$URL/healthz")" = 200 ] && ok "/healthz 200" || ko "/healthz ne répond pas 200"
html="$(curl -sS -m 20 -w '\n%{http_code}' "$URL/" 2>/dev/null)"; hc="${html##*$'\n'}"
[ "$hc" = 200 ] && ok "page d'accueil 200" || ko "page d'accueil : code $hc"
for f in app.js styles.css; do
  ref="$(printf '%s' "$html" | grep -oE "(src|href)=\"/$f\?v=[0-9a-zA-Z_-]+\"" | head -1 | sed -E 's/^[a-z]+="//; s/"$//')"
  if [ -z "$ref" ]; then ko "$f : l'accueil ne le référence pas avec ?v="; continue; fi
  h="$(hdr -H 'Accept-Encoding: gzip' "$URL$ref")"
  echo "$h" | head -1 | grep -q ' 200' && ok "$ref 200" || ko "$ref : pas de 200"
  echo "$h" | grep -iq '^cache-control:.*immutable' && ok "$f : cache immutable" || ko "$f : Cache-Control sans immutable"
  echo "$h" | grep -iq '^content-encoding: *\(gzip\|br\)' && ok "$f : compression active" || ko "$f : pas de gzip/br"
done
h="$(hdr "$URL/sw.js")"
echo "$h" | head -1 | grep -q ' 200' && ok "/sw.js 200" || ko "/sw.js : pas de 200"
echo "$h" | grep -iq '^cache-control:.*\(no-cache\|no-store\)' && ! echo "$h" | grep -iq '^cache-control:.*max-age=[1-9]' && ok "/sw.js sans cache" || ko "/sw.js : Cache-Control autorisant le cache"
[ "$fail" = 0 ] && echo "[smoke] tout est bon" || echo "[smoke] ECHEC : voir ci-dessus"
exit "$fail"
