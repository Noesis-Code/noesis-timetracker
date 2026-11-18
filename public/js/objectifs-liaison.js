/* Règle de liaison des colonnes (macro), écrite UNE seule fois : lue par le serveur (server/lib/objectifs.js) ET par l'écran (js/objectifs-arbre.js).
 * Décision d'Émilien (8 nov. 2026) : deux colonnes déjà reliées au-dessus (macro) ne peuvent pas être reliées de nouveau EN ENTIER en dessous ; on peut relier si
 * AU MOINS UNE des colonnes reliées au-dessus est laissée de côté (A+B reliées : A+B refusé, B+C accepté). Autrement dit : un nouveau lien est refusé quand il
 * contient deux colonnes (ou plus) d'un macro existant du même niveau. Même règle aux cinq niveaux (activités, années/pôles, périodes/secteurs).
 * colonne = { activityId, poleKey, categoryKey } ; macro = { id, level, columns:[colonne] } (macros racines). */
(function (root) {
  var MSG = 'Ces colonnes sont déjà reliées au-dessus.';
  function key(level, c) { return level === 'activite' ? 'a|' + c.activityId : level === 'pole' ? 'p|' + c.activityId + '|' + c.poleKey : 's|' + c.activityId + '|' + c.poleKey + '|' + c.categoryKey; }
  // true = refusé : le lien (colonnes `columns`, niveau `level`) reprend deux colonnes ou plus d'un autre macro du même niveau (ignoreId : le ou les macros que l'on modifie ou que l'on range).
  function refuse(level, columns, macros, ignoreId) {
    var mine = {}; (columns || []).forEach(function (c) { mine[key(level, c)] = true; });
    return (macros || []).some(function (m) {
      if ([].concat(ignoreId).indexOf(m.id) >= 0 || (m.level || 'activite') !== level) return false;
      var shared = 0, seen = {}; (m.columns || []).forEach(function (c) { var k = key(level, c); if (!seen[k] && mine[k]) { seen[k] = true; shared++; } });
      return shared >= 2;
    });
  }
  // CHAÎNAGE (décision d'Émilien, 9 nov. 2026) : deux macros se rattachent DÈS QU'ILS PARTAGENT AU MOINS UNE COLONNE ; le macro de plus tard (le dessus) est le parent du plus tôt (le dessous) et couvre l'union de ses colonnes,
  // en cascade sur toute la chaîne ; sans colonne commune, aucun lien. macros = [{ id, level, endDate, direct:[colonne] }] (colonnes directes : celles de leurs objectifs et de leurs cases vides) ; rend { id: idDuParent | null }.
  function chain(macros) {
    var out = {}, byLevel = {};
    (macros || []).forEach(function (m) { out[m.id] = null; (byLevel[m.level || 'activite'] = byLevel[m.level || 'activite'] || []).push(m); });
    Object.keys(byLevel).forEach(function (level) {
      var list = byLevel[level].slice().sort(function (a, b) { return a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : a.id - b.id; }), union = {};
      list.forEach(function (m) { union[m.id] = {}; (m.direct || []).forEach(function (c) { union[m.id][key(level, c)] = true; }); });
      list.forEach(function (m, i) {
        for (var j = i + 1; j < list.length; j++) { // le plus proche macro plus tardif qui partage une colonne avec toute la branche de m
          var n = list[j], hit = (n.direct || []).some(function (c) { return union[m.id][key(level, c)]; });
          if (hit) { out[m.id] = n.id; Object.keys(union[m.id]).forEach(function (k) { union[n.id][k] = true; }); break; }
        }
      });
    });
    return out;
  }
  // GROUPES PAR LIGNE (Émilien, 18 nov. 2026) : les liens de fusion sont INDÉPENDANTS (A-B, B-D) ; un lien vaut à partir de SA ligne vers le haut ; sur une ligne, le groupe = les composantes connexes des liens ACTIFS à cette ligne
  // (rang du lien <= rang de la ligne) ; avant sa ligne, ses branches restent séparées. La DOMINANTE d'un lien est sa première colonne (la première touchée) ; la dominante du groupe suit les liens actifs (A-B puis B-D : A).
  // links = [{ id, rank, cols:[indices de colonnes, dans l'ordre de sélection] }] ; rend [{ members:[indices triés, contigus], anchor }] (anchor : colonne dominante, dans members). Des colonnes non contiguës dans l'ordre affiché forment des groupes séparés.
  function groupsAt(links, rank) {
    var act = (links || []).filter(function (l) { return l && l.cols && l.cols.length > 1 && l.rank <= rank; }).sort(function (a, b) { return a.rank - b.rank || a.id - b.id; });
    var up = {}, abs = {};
    function find(x) { while (up[x] != null && up[x] !== x) x = up[x]; return x; }
    act.forEach(function (l) {
      l.cols.forEach(function (c) { if (up[c] == null) up[c] = c; });
      l.cols.slice(1).forEach(function (c) { var a = find(l.cols[0]), b = find(c); if (a !== b) up[b] = a; if (c !== l.cols[0] && abs[c] == null) abs[c] = l.cols[0]; });
    });
    function surv(c) { var n = 0; while (abs[c] != null && n++ < 50) c = abs[c]; return c; }
    var comps = {};
    Object.keys(up).forEach(function (k) { var r = find(Number(k)); (comps[r] = comps[r] || []).push(Number(k)); });
    var out = [];
    Object.keys(comps).forEach(function (r) {
      var ms = comps[r].sort(function (a, b) { return a - b; }), runs = [];
      ms.forEach(function (c) { var last = runs[runs.length - 1]; if (last && c === last[last.length - 1] + 1) last.push(c); else runs.push([c]); });
      runs.forEach(function (run) { if (run.length < 2) return; var s = surv(run[0]); out.push({ members: run, anchor: run.indexOf(s) >= 0 ? s : run[0] }); });
    });
    return out.sort(function (a, b) { return a.members[0] - b.members[0]; });
  }
  var api = { MSG: MSG, key: key, refuse: refuse, chain: chain, groupsAt: groupsAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.TMT = root.TMT || {}; root.TMT.liaison = api; }
})(typeof window !== 'undefined' ? window : null);
